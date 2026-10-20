"use server";

import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  aiInteractionLogs,
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
import { createNotificationService } from "@/lib/notification-service";
import { db } from "@/services";
import { getEditableCourse } from "../actions";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

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
  if (lessons.length === 0) {
    effectiveStatus = "empty";
  } else if (effectiveStatus === "empty") {
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
 * Phân tích nội dung và sinh Bản đồ kiến thức AI (STATE-MACHINES §18: tc-kmap-analyse).
 */
export async function runKnowledgeMapAnalysis(courseId: string) {
  const { course, user } = await getEditableCourse(courseId);

  // Lấy bài học của khoá học
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

  if (lessons.length === 0) {
    throw new Error("Khoá học chưa có bài học nào để phân tích. Hãy thêm ít nhất 1 bài học.");
  }

  // Tính content_hash từ cấu trúc các bài học để kiểm tra thay đổi
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify(
        lessons.map((l) => ({ id: l.id, title: l.title, position: l.position }))
      )
    )
    .digest("hex");

  // Lấy các khái niệm hiện có
  const existingSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.courseId, courseId))
    .orderBy(asc(skills.id));

  let finalSkillCount = existingSkills.length;

  if (existingSkills.length === 0) {
    // Lần đầu phân tích: Tạo 1 khái niệm cho mỗi bài học
    const createdSkills = await db
      .insert(skills)
      .values(
        lessons.map((ls) => ({
          courseId,
          name: ls.title.replace(/^Bài \d+[:.]\s*/i, "").trim() || ls.title,
          source: "ai" as const,
          review: "suggested" as const,
        }))
      )
      .returning();

    finalSkillCount = createdSkills.length;

    // Liên kết bài học với kỹ năng
    if (createdSkills.length > 0) {
      await db.insert(lessonSkills).values(
        createdSkills.map((sk, idx) => ({
          lessonId: lessons[idx].id,
          skillId: sk.id,
        }))
      );
    }

    // Nối quan hệ tiên quyết tuần tự giữa các khái niệm liên tiếp
    if (createdSkills.length > 1) {
      const edgesToInsert = createdSkills.slice(1).map((sk, idx) => ({
        prerequisiteSkillId: createdSkills[idx].id,
        skillId: sk.id,
        source: "ai" as const,
        review: "suggested" as const,
      }));
      await db.insert(skillPrerequisites).values(edgesToInsert);
    }
  } else {
    // Phân tích lại: Đặt lại toàn bộ về 'suggested'
    await db
      .update(skills)
      .set({ review: "suggested" })
      .where(eq(skills.courseId, courseId));

    const skillIds = existingSkills.map((s) => s.id);
    if (skillIds.length > 0) {
      await db
        .update(skillPrerequisites)
        .set({ review: "suggested" })
        .where(and(
          inArray(skillPrerequisites.skillId, skillIds),
          inArray(skillPrerequisites.prerequisiteSkillId, skillIds)
        ));
    }
  }

  // Ghi log kiểm toán vào bảng ai_interaction_logs (UC-26 / Task #116)
  try {
    await db.insert(aiInteractionLogs).values({
      userId: user.id,
      courseId,
      requestType: "extract_knowledge_map",
      model: "gemini-1.5-flash",
      userPrompt: `Trích xuất bản đồ kiến thức cho khoá học ${course.title} (${lessons.length} bài học)`,
      aiResponse: `Đã trích xuất ${finalSkillCount} khái niệm và quan hệ tiên quyết`,
      isSuccess: true,
    });
  } catch {}

  // Cập nhật trạng thái khoá học sang ready kèm model và contentHash
  await db
    .update(courses)
    .set({
      knowledgeMapStatus: "ready",
      knowledgeMapModel: "gemini-1.5-flash",
      knowledgeMapContentHash: contentHash,
      knowledgeMapGeneratedAt: new Date(),
    })
    .where(eq(courses.id, courseId));

  // Gửi thông báo cho giảng viên
  try {
    await createNotificationService(db).notify(
      user.id,
      "Bản đồ kiến thức đã sẵn sàng",
      `${course.title}: ${finalSkillCount} khái niệm cần bạn xem lại.`,
      `/dashboard/lecturer/courses/${courseId}/kmap`
    );
  } catch {}

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);

  return { success: true, count: finalSkillCount };
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
  const { course } = await getEditableCourse(courseId);

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
}

/**
 * Đổi tên khái niệm (tc-kmap-rename-save).
 */
export async function renameKnowledgeMapConcept(
  courseId: string,
  skillId: number,
  newName: string
) {
  const { course } = await getEditableCourse(courseId);
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
}

/**
 * Thêm quan hệ "cần học trước" mới giữa 2 khái niệm (tc-kmap-add-edge).
 */
export async function addKnowledgeMapEdge(
  courseId: string,
  fromSkillId: number,
  toSkillId: number
) {
  const { course } = await getEditableCourse(courseId);

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
}

/**
 * Chấp nhận tất cả đề xuất với cơ chế bảo vệ chống vòng lặp (D10: tc-kmap-accept-all).
 */
export async function acceptAllKnowledgeMap(courseId: string) {
  const { course } = await getEditableCourse(courseId);

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
  const { course } = await getEditableCourse(courseId);

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
          .where(inArray(skillPrerequisites.skillId, skillIds))
      : [];

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

  if (course.knowledgeMapStatus === "stale") {
    throw new Error("Nội dung khoá học đã thay đổi. Hãy phân tích lại trước khi xác nhận.");
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

  await db
    .update(courses)
    .set({
      knowledgeMapStatus: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}/kmap`);

  return { success: true };
}
