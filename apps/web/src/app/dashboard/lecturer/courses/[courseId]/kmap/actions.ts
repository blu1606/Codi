"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  courseChapters,
  courseLessons,
  courses,
  lessonSkills,
  skillPrerequisites,
  skills,
} from "@codi-1/db";
import {
  computeAcceptAllPlan,
  findCycle,
  topoSortLessons,
} from "@/lib/knowledge-map-runner";
import { db } from "@/services";
import { lockKnowledgeMap } from "@/lib/confirmed-knowledge-map";
import { getEditableCourse } from "../course-queries";
import { readLecturerIdentity, verifyLecturerSession } from "@/lib/lecturer-auth";

export interface KnowledgeMapConceptDto {
  id: number;
  name: string;
  description: string | null;
  source: "ai" | "lecturer";
  review: "suggested" | "accepted" | "edited" | "declined";
  lessonIds: string[];
}

export interface KnowledgeMapEdgeDto {
  from: number;
  to: number;
  source: "ai" | "lecturer";
  review: "suggested" | "accepted" | "edited" | "declined";
}

export interface KnowledgeMapDataDto {
  course: {
    id: string;
    title: string;
    status: string;
    knowledgeMapStatus: "empty" | "analysing" | "ready" | "confirmed" | "failed" | "stale";
    knowledgeMapGeneratedAt: Date | null;
    requiresReconfirmation?: boolean;
    confirmationUnavailable?: boolean;
  };
  isLocked: boolean;
  concepts: KnowledgeMapConceptDto[];
  edges: KnowledgeMapEdgeDto[];
  chapters: { id: string; title: string }[];
  lessons: { id: string; title: string; chapterId: string }[];
  cycle: number[] | null;
  defaultOrder: { id: string; title: string }[] | null;
}

async function requireCourseSkills(
  store: Pick<typeof db, "select">,
  courseId: string,
  skillIds: number[]
) {
  if (skillIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Khái niệm không thuộc khoá học này.");
  }
  const requestedIds = [...new Set(skillIds)];
  // Hold membership stable until the edge mutation commits.
  const ownedSkills = await store
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.courseId, courseId), inArray(skills.id, requestedIds)))
    .for("share");
  if (ownedSkills.length !== requestedIds.length) {
    throw new Error("Khái niệm không thuộc khoá học này.");
  }
}

/**
 * Lấy toàn bộ dữ liệu Bản đồ kiến thức AI (Màn hình S24).
 * Hỗ trợ cả chế độ xem chỉ đọc khi khoá học đang chờ duyệt (isLocked = true).
 */
export async function getKnowledgeMapData(courseId: string): Promise<KnowledgeMapDataDto> {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
  }

  // Lấy danh sách chương và bài học
  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.position));

  const chapterIds = chapters.map((ch) => ch.id);
  const lessons =
    chapterIds.length > 0
      ? await db
          .select()
          .from(courseLessons)
          .where(inArray(courseLessons.chapterId, chapterIds))
          .orderBy(asc(courseLessons.position))
      : [];

  // Lấy danh sách kỹ năng / khái niệm
  const allSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.courseId, courseId))
    .orderBy(asc(skills.id));

  const skillIds = allSkills.map((s) => s.id);

  // Lấy danh sách quan hệ tiên quyết
  const allEdges =
    skillIds.length > 0
      ? await db
          .select()
          .from(skillPrerequisites)
          .where(inArray(skillPrerequisites.skillId, skillIds))
      : [];

  // Lấy liên kết giữa bài học và kỹ năng
  const lessonIds = lessons.map((l) => l.id);
  const allLessonSkills =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonSkills)
          .where(inArray(lessonSkills.lessonId, lessonIds))
      : [];

  const conceptLessonMap = new Map<number, string[]>();
  for (const ls of allLessonSkills) {
    const list = conceptLessonMap.get(ls.skillId) || [];
    list.push(ls.lessonId);
    conceptLessonMap.set(ls.skillId, list);
  }

  const mappedConcepts: KnowledgeMapConceptDto[] = allSkills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    source: s.source,
    review: s.review,
    lessonIds: conceptLessonMap.get(s.id) || [],
  }));

  const mappedEdges: KnowledgeMapEdgeDto[] = allEdges.map((e) => ({
    from: e.prerequisiteSkillId,
    to: e.skillId,
    source: e.source,
    review: e.review,
  }));

  // Content availability controls empty/ready; ready does not imply analysis or confirmation.
  let effectiveStatus = course.knowledgeMapStatus;
  const requiresReconfirmation = course.knowledgeMapStatus === "confirmed" && !course.confirmedKnowledgeMap;
  if (lessons.length === 0) {
    effectiveStatus = "empty";
  } else if (effectiveStatus === "empty") {
    effectiveStatus = "ready";
  } else if (requiresReconfirmation) {
    effectiveStatus = "ready";
  }

  // Tìm vòng lặp trên các cạnh hoạt động (không bị bỏ)
  const liveSkillIds = new Set(
    mappedConcepts.filter((c) => c.review !== "declined").map((c) => c.id)
  );
  const activeEdges = mappedEdges.filter(
    (e) =>
      e.review !== "declined" &&
      liveSkillIds.has(e.from) &&
      liveSkillIds.has(e.to)
  );

  const cycle = findCycle([...liveSkillIds], activeEdges);

  // Tính thứ tự học mặc định
  const defaultOrder = topoSortLessons(
    mappedConcepts,
    mappedEdges,
    lessons.map((l) => ({ id: l.id, title: l.title }))
  );

  return {
    course: {
      id: course.id,
      title: course.title,
      status: course.status,
      knowledgeMapStatus: effectiveStatus,
      knowledgeMapGeneratedAt: course.knowledgeMapGeneratedAt,
      requiresReconfirmation: requiresReconfirmation && lessons.length > 0,
      confirmationUnavailable: course.knowledgeMapStatus === "stale" ||
        (course.knowledgeMapAnalysisGeneration ?? 0) !== (course.knowledgeMapContentGeneration ?? 0),
    },
    isLocked: course.status === "pending",
    concepts: mappedConcepts,
    edges: mappedEdges,
    chapters: chapters.map((ch) => ({ id: ch.id, title: ch.title })),
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, chapterId: l.chapterId })),
    cycle,
    defaultOrder,
  };
}

/**
 * AI extraction is unavailable in this nonbillable prototype.
 * Keep the endpoint fail-closed for stale clients without mutating saved data.
 */
export async function runKnowledgeMapAnalysis(courseId: string): Promise<never> {
  const identity = await readLecturerIdentity();
  return db.transaction(async (tx) => {
    await lockKnowledgeMap(tx, courseId, "write");
    await getEditableCourse(courseId, tx, identity);
    throw new Error("Phân tích AI chưa khả dụng trong bản thử nghiệm. Không có dữ liệu nào bị thay đổi.");
  });
}

/**
 * Đánh giá một mục trong Bản đồ kiến thức (tc-kmap-review).
 */
export async function reviewKnowledgeMapItem(
  courseId: string,
  kind: "concept" | "edge",
  payload: {
    skillId?: number;
    fromSkillId?: number;
    toSkillId?: number;
    review: "suggested" | "accepted" | "edited" | "declined";
  }
) {
  const identity = await readLecturerIdentity();
  return db.transaction(async (db) => {
    await lockKnowledgeMap(db, courseId, "write");
  const { course } = await getEditableCourse(courseId, db, identity);

  if (kind === "concept" && payload.skillId) {
    await db
      .update(skills)
      .set({ review: payload.review })
      .where(and(eq(skills.id, payload.skillId), eq(skills.courseId, courseId)));
  } else if (kind === "edge") {
    const { fromSkillId, toSkillId } = payload;
    if (fromSkillId === undefined || toSkillId === undefined) {
      throw new Error("Khái niệm không thuộc khoá học này.");
    }
    await db.transaction(async (tx) => {
      await requireCourseSkills(tx, courseId, [fromSkillId, toSkillId]);
      await tx
        .update(skillPrerequisites)
        .set({ review: payload.review })
        .where(
          and(
            eq(skillPrerequisites.prerequisiteSkillId, fromSkillId),
            eq(skillPrerequisites.skillId, toSkillId)
          )
        );
    });
  }

  // STATE-MACHINES §18: Nếu đang là confirmed mà có chỉnh sửa thì chuyển về ready
  if (course.knowledgeMapStatus === "confirmed") {
    await db
      .update(courses)
      .set({ knowledgeMapStatus: "ready" })
      .where(eq(courses.id, courseId));
  }

  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);
  return { success: true };
  });
}

/**
 * Đổi tên khái niệm (tc-kmap-rename-save).
 */
export async function renameKnowledgeMapConcept(
  courseId: string,
  skillId: number,
  newName: string
) {
  const identity = await readLecturerIdentity();
  return db.transaction(async (db) => {
    await lockKnowledgeMap(db, courseId, "write");
  const { course } = await getEditableCourse(courseId, db, identity);
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error("Tên khái niệm không được để trống.");
  }

  await db
    .update(skills)
    .set({ name: trimmed, review: "edited" })
    .where(and(eq(skills.id, skillId), eq(skills.courseId, courseId)));

  if (course.knowledgeMapStatus === "confirmed") {
    await db
      .update(courses)
      .set({ knowledgeMapStatus: "ready" })
      .where(eq(courses.id, courseId));
  }

  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);
  return { success: true };
  });
}

/**
 * Thêm quan hệ "cần học trước" mới giữa 2 khái niệm (tc-kmap-add-edge).
 */
export async function addKnowledgeMapEdge(
  courseId: string,
  fromSkillId: number,
  toSkillId: number
) {
  const identity = await readLecturerIdentity();
  return db.transaction(async (db) => {
    await lockKnowledgeMap(db, courseId, "write");
  const { course } = await getEditableCourse(courseId, db, identity);

  if (fromSkillId === toSkillId) {
    throw new Error("Một khái niệm không thể cần học trước chính nó.");
  }

  await db.transaction(async (tx) => {
    await requireCourseSkills(tx, courseId, [fromSkillId, toSkillId]);
    const [existing] = await tx
      .select()
      .from(skillPrerequisites)
      .where(
        and(
          eq(skillPrerequisites.prerequisiteSkillId, fromSkillId),
          eq(skillPrerequisites.skillId, toSkillId)
        )
      );

    if (existing) {
      if (existing.review !== "declined") {
        throw new Error("Quan hệ này đã có.");
      }
      // Nếu trước đó đã bỏ thì khôi phục lại và đặt thành accepted
      await tx
        .update(skillPrerequisites)
        .set({ review: "accepted" })
        .where(
          and(
            eq(skillPrerequisites.prerequisiteSkillId, fromSkillId),
            eq(skillPrerequisites.skillId, toSkillId)
          )
        );
    } else {
      await tx.insert(skillPrerequisites).values({
        prerequisiteSkillId: fromSkillId,
        skillId: toSkillId,
        source: "lecturer",
        review: "accepted",
      });
    }
  });

  if (course.knowledgeMapStatus === "confirmed") {
    await db
      .update(courses)
      .set({ knowledgeMapStatus: "ready" })
      .where(eq(courses.id, courseId));
  }

  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);
  return { success: true };
  });
}

/**
 * Chấp nhận tất cả đề xuất với cơ chế bảo vệ chống vòng lặp (D10: tc-kmap-accept-all).
 */
export async function acceptAllKnowledgeMap(courseId: string) {
  const identity = await readLecturerIdentity();
  return db.transaction(async (db) => {
    await lockKnowledgeMap(db, courseId, "write");
  const { course } = await getEditableCourse(courseId, db, identity);

  const allSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.courseId, courseId));

  const skillIds = allSkills.map((s) => s.id);
  const allEdges =
    skillIds.length > 0
      ? await db
          .select()
          .from(skillPrerequisites)
          .where(and(
            inArray(skillPrerequisites.skillId, skillIds),
            inArray(skillPrerequisites.prerequisiteSkillId, skillIds)
          ))
      : [];

  const suggestedSkills = allSkills.filter((s) => s.review === "suggested");
  const suggestedEdges = allEdges
    .filter((e) => e.review === "suggested")
    .map((e) => ({ from: e.prerequisiteSkillId, to: e.skillId }));
  const keptEdges = allEdges
    .filter((e) => e.review === "accepted" || e.review === "edited")
    .map((e) => ({ from: e.prerequisiteSkillId, to: e.skillId }));

  // Áp dụng thuật toán D10
  const plan = computeAcceptAllPlan(
    suggestedSkills.map((s) => s.id),
    suggestedEdges,
    keptEdges
  );

  // Cập nhật các khái niệm đã chấp nhận
  if (plan.acceptedConcepts.length > 0) {
    await db
      .update(skills)
      .set({ review: "accepted" })
      .where(inArray(skills.id, plan.acceptedConcepts));
  }

  // Cập nhật các quan hệ đã chấp nhận
  for (const edge of plan.acceptedEdges) {
    await db
      .update(skillPrerequisites)
      .set({ review: "accepted" })
      .where(
        and(
          eq(skillPrerequisites.prerequisiteSkillId, edge.from),
          eq(skillPrerequisites.skillId, edge.to)
        )
      );
  }

  if (course.knowledgeMapStatus === "confirmed") {
    await db
      .update(courses)
      .set({ knowledgeMapStatus: "ready" })
      .where(eq(courses.id, courseId));
  }

  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);

  return {
    success: true,
    acceptedConceptsCount: plan.acceptedConcepts.length,
    acceptedEdgesCount: plan.acceptedEdges.length,
    skippedEdgesCount: plan.skippedEdges.length,
  };
  });
}

/**
 * Xác nhận Bản đồ kiến thức (tc-kmap-confirm).
 * Ràng buộc nghiêm ngặt:
 * - Không có vòng lặp (findCycle === null).
 * - Không còn đề xuất chưa xem xét (pendingCount === 0).
 * - Số khái niệm hoạt động > 0.
 * - Trạng thái không phải 'stale'.
 */
export async function confirmKnowledgeMap(courseId: string) {
  const identity = await readLecturerIdentity();
  return db.transaction(async (db) => {
    await lockKnowledgeMap(db, courseId, "write");
  const { course } = await getEditableCourse(courseId, db, identity);

  await db.transaction(async (tx) => {
    const allSkills = await tx
      .select()
      .from(skills)
      .where(eq(skills.courseId, courseId));

    const skillIds = allSkills.map((s) => s.id);
    const allEdges =
      skillIds.length > 0
        ? await tx
            .select()
            .from(skillPrerequisites)
            .where(
              or(
                inArray(skillPrerequisites.skillId, skillIds),
                inArray(skillPrerequisites.prerequisiteSkillId, skillIds)
              )
            )
        : [];

    if (allEdges.some((edge) => !skillIds.includes(edge.skillId) || !skillIds.includes(edge.prerequisiteSkillId))) {
      throw new Error("Quan hệ không thuộc khoá học này.");
    }
    if (!["ready", "confirmed", "stale"].includes(course.knowledgeMapStatus)) {
      throw new Error("Bản đồ chưa sẵn sàng để xác nhận.");
    }
    const liveSkills = allSkills.filter((s) => s.review !== "declined");
    if (liveSkills.length === 0) {
      throw new Error("Cần ít nhất một khái niệm để xác nhận bản đồ kiến thức.");
    }

    const pendingConcepts = allSkills.filter((s) => s.review === "suggested").length;
    const pendingEdges = allEdges.filter((e) => e.review === "suggested").length;
    const pendingTotal = pendingConcepts + pendingEdges;

    if (pendingTotal > 0) {
      throw new Error(`Còn ${pendingTotal} đề xuất chưa xem lại. Hãy chấp nhận hoặc bỏ từng đề xuất trước khi xác nhận.`);
    }

    if (course.knowledgeMapStatus === "stale" ||
        (course.knowledgeMapAnalysisGeneration ?? 0) !== course.knowledgeMapContentGeneration) {
      throw new Error("Nội dung khoá học đã thay đổi; bản thử nghiệm chưa hỗ trợ kiểm tra lại để xác nhận.");
    }

    const liveSkillIds = new Set(liveSkills.map((s) => s.id));
    const activeEdges = allEdges
      .filter(
        (e) =>
          e.review !== "declined" &&
          liveSkillIds.has(e.prerequisiteSkillId) &&
          liveSkillIds.has(e.skillId)
      )
      .map((e) => ({ from: e.prerequisiteSkillId, to: e.skillId }));

    const cycle = findCycle([...liveSkillIds], activeEdges);
    if (cycle) {
      throw new Error("Bản đồ còn chứa vòng lặp. Cần phá vòng lặp trước khi xác nhận.");
    }

    const chapters = await tx.select({ id: courseChapters.id }).from(courseChapters)
      .where(eq(courseChapters.courseId, courseId));
    const chapterIds = chapters.map((chapter) => chapter.id);
    const lessons = chapterIds.length ? await tx.select({ id: courseLessons.id }).from(courseLessons)
      .where(inArray(courseLessons.chapterId, chapterIds)) : [];
    if (!lessons.length) throw new Error("Khoá học chưa có bài học để xác nhận.");
    const links = await tx.select().from(lessonSkills)
      .where(or(inArray(lessonSkills.lessonId, lessons.map((lesson) => lesson.id)),
        inArray(lessonSkills.skillId, skillIds)));
    if (links.some((link) => !skillIds.includes(link.skillId) || !lessons.some((lesson) => lesson.id === link.lessonId))) {
      throw new Error("Liên kết khái niệm không thuộc khoá học này.");
    }
    const confirmedKnowledgeMap = {
      version: 1 as const,
      publicationId: randomUUID(),
      contentGeneration: course.knowledgeMapContentGeneration,
      publishedAt: new Date().toISOString(),
      skills: liveSkills.map(({ id, name, bktPInit, bktPLearn, bktPGuess, bktPSlip }) =>
        ({ id, name, bktPInit, bktPLearn, bktPGuess, bktPSlip })),
      edges: activeEdges,
      links: links.filter((link) => liveSkillIds.has(link.skillId))
        .map(({ lessonId, skillId }) => ({ lessonId, skillId })),
    };
    await tx
      .update(courses)
      .set({
        confirmedKnowledgeMap,
        knowledgeMapStatus: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);

  return { success: true };
  });
}
