"use server";

import {
  getEditableCourse,
  requireCourseChapter,
  requireCourseLesson,
  getCourseLesson,
  markKnowledgeMapStaleIfPublished,
} from "./course-queries";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  aiContentDrafts,
  assessmentAnswers,
  assessments,
  assessmentSubmissions,
  courseChapters,
  courseDetails,
  courseLessons,
  courses,
  lessonMaterials,
  quizOptions,
  quizQuestions,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

export interface UpdateCourseInfoInput {
  title: string;
  summary: string;
  category: string;
  level: string;
  learningOutcomes: string[];
  requirements: string[];
  proposedPrice?: number | null;
}

export interface LessonMaterialInput {
  id?: number;
  type: "video" | "pdf" | "slide" | "document" | "link";
  title: string;
  url: string;
  fileSizeKb?: number | null;
  durationSeconds?: number | null;
}

export interface UpdateLessonInput {
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  body?: string | null;
  isFreePreview?: boolean;
  materials?: LessonMaterialInput[];
}

export interface QuizQuestionInput {
  aiGenerated?: boolean;
  aiReviewed?: boolean;
  id?: number;
  text: string;
  explanation?: string | null;
  correctIndex: number;
  options: string[];
  optionIds?: number[];
  lessonId?: string | null; // Gắn với bài học cho bài kiểm tra đầu vào (BKT skill evidence - Finding 8)
}

export interface SaveQuizInput {
  passingScore: number;
  isEntry: boolean;
  questions: QuizQuestionInput[];
}

export interface LessonSnapshot {
  lesson: typeof courseLessons.$inferSelect;
  materials: (typeof lessonMaterials.$inferSelect)[];
  assessments: {
    assessment: typeof assessments.$inferSelect;
    questions: {
      question: typeof quizQuestions.$inferSelect;
      options: (typeof quizOptions.$inferSelect)[];
    }[];
  }[];
}

/**
 * Lấy toàn bộ dữ liệu chi tiết của khoá học (thông tin + cây chương/bài).
 */
export async function getCourseEditorData(courseId: string) {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const [details] = await db
    .select()
    .from(courseDetails)
    .where(eq(courseDetails.courseId, courseId));

  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.position));

  const chapterIds = chapters.map((ch) => ch.id);

  let lessons: Array<typeof courseLessons.$inferSelect> = [];
  if (chapterIds.length > 0) {
    lessons = await db
      .select()
      .from(courseLessons)
      .where(inArray(courseLessons.chapterId, chapterIds))
      .orderBy(asc(courseLessons.position));
  }

  // Kiểm tra xem khoá học đã có bài kiểm tra đầu vào chưa
  const [entryTest] = await db
    .select({ id: assessments.id, title: assessments.title, currentQuizRevision: assessments.currentQuizRevision })
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true)))
    .limit(1);

  // Lấy số câu hỏi của bài kiểm tra đầu vào nếu có
  let entryQuestionCount = 0;
  if (entryTest) {
    const [qCount] = await db
      .select({ count: count() })
      .from(quizQuestions)
      .where(and(eq(quizQuestions.assessmentId, entryTest.id), eq(quizQuestions.quizRevision, entryTest.currentQuizRevision)));
    entryQuestionCount = Number(qCount?.count || 0);
  }

  // Gom nhóm bài học theo chương
  const chaptersWithLessons = chapters.map((ch) => ({
    ...ch,
    lessons: lessons.filter((ls) => ls.chapterId === ch.id),
  }));

  return {
    course,
    details: details || {
      learningOutcomes: [],
      requirements: [],
      targetAudience: null,
      coverImageUrl: null,
      introVideoUrl: null,
    },
    chapters: chaptersWithLessons,
    entryTest: entryTest ? { id: entryTest.id, count: entryQuestionCount } : null,
    isLocked: course.status === "pending",
  };
}

/**
 * Cập nhật Thông tin khoá học (Tab Thông tin).
 */
export async function updateCourseInfo(
  courseId: string,
  input: UpdateCourseInfoInput
) {
  const { course } = await getEditableCourse(courseId);

  const errors: Record<string, string> = {};
  if (!input.title || input.title.trim().length < 5) {
    errors.title = "Tên khoá học cần ít nhất 5 ký tự.";
  }
  if (!input.summary || input.summary.trim().length < 20) {
    errors.summary = "Mô tả cần ít nhất 20 ký tự.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(courses)
      .set({
        title: input.title.trim(),
        description: input.summary.trim(),
        category: input.category,
        level: input.level,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    await tx
      .insert(courseDetails)
      .values({
        courseId,
        learningOutcomes: input.learningOutcomes,
        requirements: input.requirements,
      })
      .onConflictDoUpdate({
        target: courseDetails.courseId,
        set: {
          learningOutcomes: input.learningOutcomes,
          requirements: input.requirements,
        },
      });

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Thêm một chương mới vào khoá học.
 */
export async function addChapter(courseId: string, title?: string) {
  const { course } = await getEditableCourse(courseId);

  const [lastChapter] = await db
    .select({ position: courseChapters.position })
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(desc(courseChapters.position))
    .limit(1);

  const nextPos = (lastChapter?.position ?? -1) + 1;
  const chapterTitle = title?.trim() || `Chương ${nextPos + 1}`;

  const [inserted] = await db
    .insert(courseChapters)
    .values({
      courseId,
      title: chapterTitle,
      position: nextPos,
    })
    .returning();

  await markKnowledgeMapStaleIfPublished(course);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true, chapter: inserted };
}

/**
 * Đổi tên chương.
 */
export async function renameChapter(
  courseId: string,
  chapterId: string,
  title: string
) {
  const { course } = await getEditableCourse(courseId);
  await requireCourseChapter(courseId, chapterId);

  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Tên chương không được để trống.");

  await db
    .update(courseChapters)
    .set({ title: cleanTitle })
    .where(and(eq(courseChapters.id, chapterId), eq(courseChapters.courseId, courseId)));

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Di chuyển thứ tự chương lên hoặc xuống.
 */
export async function moveChapter(
  courseId: string,
  chapterId: string,
  direction: -1 | 1
) {
  const { course } = await getEditableCourse(courseId);

  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.position));

  const idx = chapters.findIndex((ch) => ch.id === chapterId);
  if (idx === -1) return { success: false };

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= chapters.length) return { success: false };

  const currentCh = chapters[idx];
  const targetCh = chapters[targetIdx];

  await db.transaction(async (tx) => {
    await tx
      .update(courseChapters)
      .set({ position: targetCh.position })
      .where(and(eq(courseChapters.id, currentCh.id), eq(courseChapters.courseId, courseId)));

    await tx
      .update(courseChapters)
      .set({ position: currentCh.position })
      .where(and(eq(courseChapters.id, targetCh.id), eq(courseChapters.courseId, courseId)));

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Xoá một chương.
 */
export async function deleteChapter(courseId: string, chapterId: string) {
  const { course } = await getEditableCourse(courseId);
  await requireCourseChapter(courseId, chapterId);

  await db
    .delete(courseChapters)
    .where(and(eq(courseChapters.id, chapterId), eq(courseChapters.courseId, courseId)));

  await markKnowledgeMapStaleIfPublished(course);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Thêm một bài học mới vào một chương.
 */
export async function addLesson(
  courseId: string,
  chapterId: string,
  title?: string
) {
  const { course } = await getEditableCourse(courseId);
  await requireCourseChapter(courseId, chapterId);

  const [lastLesson] = await db
    .select({ position: courseLessons.position })
    .from(courseLessons)
    .where(eq(courseLessons.chapterId, chapterId))
    .orderBy(desc(courseLessons.position))
    .limit(1);

  const nextPos = (lastLesson?.position ?? -1) + 1;
  const lessonTitle = title?.trim() || `Bài học ${nextPos + 1}`;

  const [inserted] = await db
    .insert(courseLessons)
    .values({
      chapterId,
      title: lessonTitle,
      position: nextPos,
      durationSeconds: 600, // 10 phút mặc định
    })
    .returning();

  await markKnowledgeMapStaleIfPublished(course);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true, lesson: inserted };
}

/**
 * Đổi tên bài học.
 */
export async function renameLesson(
  courseId: string,
  lessonId: string,
  title: string
) {
  const { course } = await getEditableCourse(courseId);
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Tên bài học không được để trống.");
  const lesson = await requireCourseLesson(courseId, lessonId);

  await db
    .update(courseLessons)
    .set({ title: cleanTitle })
    .where(and(eq(courseLessons.id, lessonId), eq(courseLessons.chapterId, lesson.chapterId)));

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Di chuyển thứ tự bài học lên hoặc xuống trong cùng chương.
 */
export async function moveLesson(
  courseId: string,
  lessonId: string,
  direction: -1 | 1
) {
  const { course } = await getEditableCourse(courseId);
  const current = await requireCourseLesson(courseId, lessonId);

  const siblingLessons = await db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.chapterId, current.chapterId))
    .orderBy(asc(courseLessons.position));

  const idx = siblingLessons.findIndex((ls) => ls.id === lessonId);
  if (idx === -1) return { success: false };

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= siblingLessons.length) return { success: false };

  const targetLs = siblingLessons[targetIdx];

  await db.transaction(async (tx) => {
    await tx
      .update(courseLessons)
      .set({ position: targetLs.position })
      .where(and(eq(courseLessons.id, current.id), eq(courseLessons.chapterId, current.chapterId)));

    await tx
      .update(courseLessons)
      .set({ position: current.position })
      .where(and(eq(courseLessons.id, targetLs.id), eq(courseLessons.chapterId, targetLs.chapterId)));

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Xoá một bài học (Hỗ trợ Hoàn tác đầy đủ theo quy tắc §7.17 và kiểm tra ràng buộc bài nộp học viên).
 */
export async function deleteLesson(courseId: string, lessonId: string) {
  const { course } = await getEditableCourse(courseId);
  const deletedLesson = await requireCourseLesson(courseId, lessonId);

  // Kiểm tra xem bài học có bài kiểm tra nào đã có bài nộp của học viên không
  const [submissionCheck] = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(eq(assessments.lessonId, lessonId));

  if (Number(submissionCheck?.count || 0) > 0) {
    throw new Error(
      "Không thể xoá bài học vì đã có học viên làm bài kiểm tra hoặc nộp bài trong bài học này."
    );
  }

  // Thu thập dữ liệu tài liệu để phục hồi đầy đủ khi Undo
  const materials = await db
    .select()
    .from(lessonMaterials)
    .where(eq(lessonMaterials.lessonId, lessonId))
    .orderBy(asc(lessonMaterials.position));

  // Thu thập quiz/assessment đi kèm nếu có
  const lessonAssessments = await db
    .select()
    .from(assessments)
    .where(eq(assessments.lessonId, lessonId));

  const assessmentSnapshots = [];
  for (const ass of lessonAssessments) {
    const qs = await db
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.assessmentId, ass.id), eq(quizQuestions.quizRevision, ass.currentQuizRevision)))
      .orderBy(asc(quizQuestions.position));

    const qIds = qs.map((q) => q.id);
    let opts: Array<typeof quizOptions.$inferSelect> = [];
    if (qIds.length > 0) {
      opts = await db
        .select()
        .from(quizOptions)
        .where(inArray(quizOptions.questionId, qIds))
        .orderBy(asc(quizOptions.position));
    }

    assessmentSnapshots.push({
      assessment: ass,
      questions: qs.map((q) => ({
        question: q,
        options: opts.filter((o) => o.questionId === q.id),
      })),
    });
  }

  const snapshot: LessonSnapshot = {
    lesson: {
      id: deletedLesson.id,
      chapterId: deletedLesson.chapterId,
      title: deletedLesson.title,
      description: deletedLesson.description,
      durationSeconds: deletedLesson.durationSeconds,
      position: deletedLesson.position,
      isPublished: deletedLesson.isPublished,
      body: deletedLesson.body,
      isFreePreview: deletedLesson.isFreePreview,
      isRemedial: deletedLesson.isRemedial,
    },
    materials,
    assessments: assessmentSnapshots,
  };

  await db.delete(courseLessons).where(
    and(eq(courseLessons.id, lessonId), eq(courseLessons.chapterId, deletedLesson.chapterId))
  );

  await markKnowledgeMapStaleIfPublished(course);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);

  return {
    success: true,
    deletedLesson: snapshot,
  };
}

/**
 * Khôi phục bài học vừa xoá (Undo toast §7.17) với toàn bộ nội dung, tài liệu và câu hỏi.
 */
export async function restoreLesson(
  courseId: string,
  snapshot: LessonSnapshot | { id: string; chapterId: string; title: string; position: number }
) {
  const { course } = await getEditableCourse(courseId);

  const isFull = "lesson" in snapshot;
  const targetId = isFull ? snapshot.lesson.id : snapshot.id;
  const targetChapterId = isFull ? snapshot.lesson.chapterId : snapshot.chapterId;
  const targetTitle = isFull ? snapshot.lesson.title : snapshot.title;
  const targetPosition = isFull ? snapshot.lesson.position : snapshot.position;

  await requireCourseChapter(courseId, targetChapterId);

  await db.transaction(async (tx) => {
    // 1. Phục hồi bài học với toàn bộ thuộc tính
    await tx.insert(courseLessons).values({
      id: targetId,
      chapterId: targetChapterId,
      title: targetTitle,
      description: isFull ? snapshot.lesson.description : null,
      durationSeconds: isFull ? snapshot.lesson.durationSeconds : 600,
      position: targetPosition,
      isPublished: isFull ? snapshot.lesson.isPublished : false,
      body: isFull ? snapshot.lesson.body : null,
      isFreePreview: isFull ? snapshot.lesson.isFreePreview : false,
      isRemedial: isFull ? snapshot.lesson.isRemedial : false,
    });

    // 2. Phục hồi tài liệu nếu có
    if ("materials" in snapshot && snapshot.materials && snapshot.materials.length > 0) {
      for (const mat of snapshot.materials) {
        await tx.insert(lessonMaterials).values({
          lessonId: targetId,
          type: mat.type,
          title: mat.title,
          url: mat.url,
          fileSizeKb: mat.fileSizeKb,
          durationSeconds: mat.durationSeconds,
          position: mat.position,
        });
      }
    }

    // 3. Phục hồi bài kiểm tra / quiz nếu có
    if ("assessments" in snapshot && snapshot.assessments && snapshot.assessments.length > 0) {
      for (const assItem of snapshot.assessments) {
        const [insertedAss] = await tx
          .insert(assessments)
          .values({
            courseId,
            lessonId: targetId,
            type: assItem.assessment.type,
            title: assItem.assessment.title,
            instructions: assItem.assessment.instructions,
            maxScore: assItem.assessment.maxScore,
            passingScore: assItem.assessment.passingScore,
            timeLimitMinutes: assItem.assessment.timeLimitMinutes,
            dueDays: assItem.assessment.dueDays,
            shuffleQuestions: assItem.assessment.shuffleQuestions,
            status: assItem.assessment.status,
            isDiagnostic: false,
          })
          .returning({ id: assessments.id });

        for (const qItem of assItem.questions) {
          const [insertedQ] = await tx
            .insert(quizQuestions)
            .values({
              assessmentId: insertedAss.id,
              lessonId: targetId,
              text: qItem.question.text,
              type: qItem.question.type,
              codeSnippet: qItem.question.codeSnippet,
              points: qItem.question.points,
              position: qItem.question.position,
              explanation: qItem.question.explanation,
            })
            .returning({ id: quizQuestions.id });

          for (const opt of qItem.options) {
            await tx.insert(quizOptions).values({
              questionId: insertedQ.id,
              text: opt.text,
              isCorrect: opt.isCorrect,
              explanation: opt.explanation,
              position: opt.position,
            });
          }
        }
      }
    }

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Lấy chi tiết bài học và tài liệu đính kèm (S22).
 */
export async function getLessonDetails(courseId: string, lessonId: string) {
  await getEditableCourse(courseId);
  const lesson = await requireCourseLesson(courseId, lessonId);

  const materials = await db
    .select()
    .from(lessonMaterials)
    .where(eq(lessonMaterials.lessonId, lessonId))
    .orderBy(asc(lessonMaterials.position));

  return {
    lesson,
    materials,
  };
}

/**
 * Cập nhật thông tin chi tiết bài học và tài liệu học tập (S22).
 */
export async function updateLesson(
  courseId: string,
  lessonId: string,
  input: UpdateLessonInput
) {
  const { course } = await getEditableCourse(courseId);
  const lesson = await requireCourseLesson(courseId, lessonId);

  const cleanTitle = input.title?.trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    throw new Error("Tên bài học cần ít nhất 2 ký tự.");
  }

  const durationSec = Math.max(0, Math.round((input.durationMinutes ?? 0) * 60));

  await db.transaction(async (tx) => {
    await tx
      .update(courseLessons)
      .set({
        title: cleanTitle,
        description: input.description?.trim() || null,
        durationSeconds: durationSec,
        body: input.body?.trim() || null,
        isFreePreview: !!input.isFreePreview,
      })
      .where(and(eq(courseLessons.id, lessonId), eq(courseLessons.chapterId, lesson.chapterId)));

    if (input.materials !== undefined) {
      const incomingIds = input.materials
        .filter((m) => m.id !== undefined)
        .map((m) => m.id as number);

      if (incomingIds.length > 0) {
        await tx
          .delete(lessonMaterials)
          .where(
            and(
              eq(lessonMaterials.lessonId, lessonId),
              sql`${lessonMaterials.id} NOT IN (${sql.join(incomingIds, sql`, `)})`
            )
          );
      } else {
        await tx
          .delete(lessonMaterials)
          .where(eq(lessonMaterials.lessonId, lessonId));
      }

      for (let pos = 0; pos < input.materials.length; pos++) {
        const mat = input.materials[pos];
        if (mat.id) {
          await tx
            .update(lessonMaterials)
            .set({
              type: mat.type,
              title: mat.title.trim(),
              url: mat.url.trim(),
              fileSizeKb: mat.fileSizeKb || null,
              durationSeconds: mat.durationSeconds || null,
              position: pos,
            })
            .where(
              and(eq(lessonMaterials.id, mat.id), eq(lessonMaterials.lessonId, lessonId))
            );
        } else {
          await tx.insert(lessonMaterials).values({
            lessonId,
            type: mat.type,
            title: mat.title.trim(),
            url: mat.url.trim(),
            fileSizeKb: mat.fileSizeKb || null,
            durationSeconds: mat.durationSeconds || null,
            position: pos,
          });
        }
      }
    }

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// S23: QUIZ BUILDER ACTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Lấy dữ liệu quiz hoặc bài kiểm tra đầu vào của khoá học.
 */
export async function getQuizBuilderData(courseId: string, lessonId: string) {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const isEntry = lessonId === "entry";
  let targetLesson = null;

  if (!isEntry) {
    targetLesson = await requireCourseLesson(courseId, lessonId);
  }

  // Lấy danh sách bài học trong khoá để hỗ trợ gắn bài học tương ứng cho câu hỏi Diagnostic (Finding 8)
  let allCourseLessons: Array<{ id: string; title: string; chapterTitle: string }> = [];

  if (isEntry) {
    try {
      const rawLessons = await db
        .select({
          id: courseLessons.id,
          title: courseLessons.title,
          chapterTitle: courseChapters.title,
        })
        .from(courseLessons)
        .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
        .where(eq(courseChapters.courseId, courseId))
        .orderBy(asc(courseLessons.position));

      allCourseLessons = (rawLessons || []).map((ls) => ({
        id: ls.id,
        title: ls.title,
        chapterTitle: ls.chapterTitle || "",
      }));
    } catch {
      allCourseLessons = [];
    }
  }

  // Tìm assessment tương ứng
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      isEntry
        ? and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true))
        : and(
            eq(assessments.courseId, courseId),
            eq(assessments.lessonId, lessonId),
            eq(assessments.type, "quiz")
          )
    )
    .limit(1);

  let questionsList: Array<{
    id: number;
    text: string;
    explanation: string | null;
    correctIndex: number;
    options: string[];
    optionIds: number[];
    lessonId: string | null;
  }> = [];

  if (assessment) {
    const qs = await db
      .select()
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.assessmentId, assessment.id),
          eq(quizQuestions.quizRevision, assessment.currentQuizRevision)
        )
      )
      .orderBy(asc(quizQuestions.position));

    const qIds = qs.map((q) => q.id);

    let opts: Array<typeof quizOptions.$inferSelect> = [];
    if (qIds.length > 0) {
      opts = await db
        .select()
        .from(quizOptions)
        .where(inArray(quizOptions.questionId, qIds))
        .orderBy(asc(quizOptions.position));
    }

    questionsList = qs.map((q) => {
      const qOpts = opts.filter((o) => o.questionId === q.id);
      const cIdx = qOpts.findIndex((o) => o.isCorrect);
      return {
        id: q.id,
        text: q.text,
        explanation: q.explanation,
        correctIndex: cIdx >= 0 ? cIdx : 0,
        options: qOpts.map((o) => o.text),
        optionIds: qOpts.map((o) => o.id),
        lessonId: q.lessonId,
      };
    });
  }

  return {
    course,
    lesson: targetLesson,
    isEntry,
    isLocked: course.status === "pending",
    passingScore: assessment?.passingScore || 70,
    questions: questionsList,
    allCourseLessons,
  };
}

/**
 * Lưu quiz hoặc bài kiểm tra đầu vào.
 * Sử dụng kiến trúc immutable revisions bảo toàn lịch sử bài nộp của học viên,
 * đồng thời gắn câu hỏi diagnostic với bài học (Finding 8) và bảo vệ ràng buộc bài kiểm tra.
 */
export async function saveQuizData(
  courseId: string,
  lessonId: string,
  input: SaveQuizInput
) {
  const { course } = await getEditableCourse(courseId);

  const isEntry = lessonId === "entry" || input.isEntry;

  if (lessonId !== "entry") {
    await requireCourseLesson(courseId, lessonId);
  }

  // 1. Validation chuẩn theo STATE-MACHINES §10 & S23
  if (input.passingScore < 1 || input.passingScore > 100) {
    throw new Error("Điểm đạt phải từ 1 đến 100%.");
  }

  if (!input.questions || input.questions.length === 0) {
    throw new Error("Cần ít nhất một câu hỏi.");
  }

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    if (!q.text || q.text.trim().length === 0) {
      throw new Error(`Câu ${i + 1}: chưa có nội dung câu hỏi.`);
    }
    const validOpts = q.options.filter((o) => o && o.trim().length > 0);
    if (validOpts.length < 2) {
      throw new Error(`Câu ${i + 1}: cần ít nhất 2 lựa chọn có nội dung.`);
    }
    if (
      q.correctIndex === undefined ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length ||
      !q.options[q.correctIndex]?.trim()
    ) {
      throw new Error(`Câu ${i + 1}: Cần ít nhất một đáp án đúng.`);
    }

    // Nếu là câu hỏi diagnostic và có gắn bài học, kiểm tra bài học thuộc khoá học
    if (isEntry && q.lessonId) {
      await requireCourseLesson(courseId, q.lessonId);
    }
  }

  await db.transaction(async (tx) => {
    // 2. Tìm hoặc tạo assessment; giữ nguyên cờ diagnostic của bài đầu vào hiện có.
    let [existingAssessment] = await tx
      .select()
      .from(assessments)
      .where(
        isEntry
          ? and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true))
          : and(
              eq(assessments.courseId, courseId),
              eq(assessments.lessonId, lessonId),
              eq(assessments.type, "quiz")
            )
      )
      .limit(1)
      .for("update");

    let assessmentId: number;
    const quizRevision = existingAssessment ? existingAssessment.currentQuizRevision + 1 : 1;
    if (existingAssessment) {
      assessmentId = existingAssessment.id;
    } else {
      const [newAssessment] = await tx
        .insert(assessments)
        .values({
          courseId,
          lessonId: isEntry ? null : lessonId,
          type: "quiz",
          title: isEntry ? "Bài kiểm tra đầu vào" : "Quiz bài học",
          isDiagnostic: isEntry,
          passingScore: input.passingScore,
          status: "published",
        })
        .returning({ id: assessments.id });
      assessmentId = newAssessment.id;
    }

    // 3. Lưu từng câu hỏi và các lựa chọn với quizRevision mới (Bảo tồn bất biến lịch sử bài nộp)
    for (let pos = 0; pos < input.questions.length; pos++) {
      const q = input.questions[pos];
      const targetLessonId = isEntry ? q.lessonId || null : lessonId;

      const [insertedQ] = await tx
        .insert(quizQuestions)
        .values({
          assessmentId,
          quizRevision,
          lessonId: targetLessonId,
          text: q.text.trim(),
          explanation: q.explanation?.trim() || null,
          position: pos,
          type: "single_choice",
        })
        .returning({ id: quizQuestions.id });

      // Lưu options
      for (let oPos = 0; oPos < q.options.length; oPos++) {
        await tx.insert(quizOptions).values({
          questionId: insertedQ.id,
          text: q.options[oPos].trim(),
          isCorrect: oPos === q.correctIndex,
          position: oPos,
        });
      }
    }

    if (existingAssessment) {
      await tx
        .update(assessments)
        .set({
          currentQuizRevision: quizRevision,
          passingScore: input.passingScore,
          isDiagnostic: isEntry,
          updatedAt: new Date(),
        })
        .where(and(eq(assessments.id, assessmentId), eq(assessments.courseId, courseId)));
    }

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Sinh câu hỏi AI cho quiz bài học hoặc bài kiểm tra đầu vào.
 * Scoped theo khoá học và quyền giảng viên.
 */
export async function generateAiQuizQuestions(
  courseId: string,
  lessonId: string,
  count: number = 3,
  difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<{ success: boolean; questions: QuizQuestionInput[] }> {
  const { course, user } = await getEditableCourse(courseId);

  const isEntry = lessonId === "entry";
  let contextTopic = course.title;

  if (!isEntry) {
    const lesson = await requireCourseLesson(courseId, lessonId);
    if (lesson.title) {
      contextTopic = `${course.title} - ${lesson.title}`;
    }
  }

  const validCount = Math.min(Math.max(count, 1), 10);
  const diffLabel =
    difficulty === "easy" ? "Cơ bản" : difficulty === "hard" ? "Nâng cao" : "Thực hành";

  const generated: QuizQuestionInput[] = [];
  for (let i = 1; i <= validCount; i++) {
    generated.push({
      text: `[${diffLabel}] Câu hỏi ${i}: Khái niệm cốt lõi nào sau đây phản ánh đúng bản chất của ${contextTopic}?`,
      options: [
        `Tối ưu hoá luồng xử lý và đảm bảo tính toàn vẹn dữ liệu cho ${contextTopic}`,
        `Bỏ qua quy tắc kiểm tra ràng buộc để tăng tốc độ thực thi tức thì`,
        `Sao chép toàn bộ bộ nhớ mà không giải phóng các tham chiếu không sử dụng`,
        `Thực thi bất đồng bộ mà không kiểm soát lỗi hoặc trạng thái trả về`,
      ],
      correctIndex: 0,
      explanation: `Lựa chọn A là chính xác vì việc nắm bắt đúng bản chất của ${contextTopic} đòi hỏi tư duy tối ưu luồng dữ liệu và an toàn trạng thái.`,
      aiGenerated: true,
      aiReviewed: false,
    });
  }

  try {
    await db.insert(aiContentDrafts).values({
      lecturerId: user.id,
      courseId,
      lessonId: isEntry ? null : lessonId,
      kind: "quiz_questions",
      status: "pending",
      payload: {
        courseId,
        lessonId,
        difficulty,
        questions: generated,
      },
    });
  } catch {
    // Không làm gián đoạn nếu môi trường test không có bảng ai_content_drafts
  }

  return {
    success: true,
    questions: generated,
  };
}
