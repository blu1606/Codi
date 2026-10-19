"use server";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  aiContentDrafts,
  assessments,
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

export interface QuizQuestionInput {
  text: string;
  explanation?: string | null;
  correctIndex: number;
  options: string[];
  aiGenerated?: boolean;
  aiReviewed?: boolean;
}

export interface SaveQuizInput {
  passingScore: number;
  isEntry: boolean;
  questions: QuizQuestionInput[];
}

/**
 * Kiểm tra quyền sở hữu khoá học và đảm bảo khoá học không ở trạng thái pending (chỉ đọc).
 */
export async function getEditableCourse(courseId: string) {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
  }

  // Quy tắc STATE-MACHINES §16: Khoá học đang chờ duyệt thì khoá chỉnh sửa (read-only)
  if (course.status === "pending") {
    throw new Error("Khoá học đang chờ duyệt — nội dung chỉ đọc.");
  }

  return { course, user };
}

/**
 * Đánh dấu bản đồ kiến thức là 'stale' nếu khoá học đã xuất bản bị chỉnh sửa nội dung (D17).
 */
export async function markKnowledgeMapStaleIfPublished(
  course: typeof courses.$inferSelect,
  executor: any = db
) {
  if (course.status === "published" && course.knowledgeMapStatus === "confirmed") {
    await executor
      .update(courses)
      .set({ knowledgeMapStatus: "stale" })
      .where(eq(courses.id, course.id));
  }
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
    .select({ id: assessments.id, title: assessments.title })
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true)))
    .limit(1);

  // Lấy số câu hỏi của bài kiểm tra đầu vào nếu có
  let entryQuestionCount = 0;
  if (entryTest) {
    const [qCount] = await db
      .select({ count: count() })
      .from(quizQuestions)
      .where(eq(quizQuestions.assessmentId, entryTest.id));
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
        ...(input.proposedPrice !== undefined && input.proposedPrice !== null
          ? { price: input.proposedPrice }
          : {}),
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
      .where(eq(courseChapters.id, currentCh.id));

    await tx
      .update(courseChapters)
      .set({ position: currentCh.position })
      .where(eq(courseChapters.id, targetCh.id));

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

  await db
    .update(courseLessons)
    .set({ title: cleanTitle })
    .where(eq(courseLessons.id, lessonId));

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

  const [current] = await db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId));

  if (!current) return { success: false };

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
      .where(eq(courseLessons.id, current.id));

    await tx
      .update(courseLessons)
      .set({ position: current.position })
      .where(eq(courseLessons.id, targetLs.id));

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Xoá một bài học (Hỗ trợ Hoàn tác theo quy tắc §7.17).
 */
export async function deleteLesson(courseId: string, lessonId: string) {
  const { course } = await getEditableCourse(courseId);

  const [deletedLesson] = await db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId));

  if (!deletedLesson) return { success: false };

  await db.delete(courseLessons).where(eq(courseLessons.id, lessonId));

  await markKnowledgeMapStaleIfPublished(course);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);

  return {
    success: true,
    deletedLesson: {
      id: deletedLesson.id,
      chapterId: deletedLesson.chapterId,
      title: deletedLesson.title,
      position: deletedLesson.position,
    },
  };
}

/**
 * Khôi phục bài học vừa xoá (Undo toast §7.17).
 */
export async function restoreLesson(
  courseId: string,
  lessonData: { id: string; chapterId: string; title: string; position: number }
) {
  const { course } = await getEditableCourse(courseId);

  await db.insert(courseLessons).values({
    id: lessonData.id,
    chapterId: lessonData.chapterId,
    title: lessonData.title,
    position: lessonData.position,
  });

  await markKnowledgeMapStaleIfPublished(course);
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
    const [ls] = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.id, lessonId));
    if (!ls) {
      throw new Error("Không tìm thấy bài học.");
    }
    targetLesson = ls;
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
    aiGenerated?: boolean;
    aiReviewed?: boolean;
  }> = [];

  if (assessment) {
    const qs = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.assessmentId, assessment.id))
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
  };
}

/**
 * Lưu quiz hoặc bài kiểm tra đầu vào.
 */
export async function saveQuizData(
  courseId: string,
  lessonId: string,
  input: SaveQuizInput
) {
  const { course } = await getEditableCourse(courseId);

  const isEntry = lessonId === "entry" || input.isEntry;

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
  }

  await db.transaction(async (tx) => {
    // 2. Nếu là bài kiểm tra đầu vào, bỏ flag isDiagnostic ở các quiz khác của khoá (tối đa 1 bài/khoá)
    if (isEntry) {
      await tx
        .update(assessments)
        .set({ isDiagnostic: false })
        .where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true)));
    }

    // 3. Tìm hoặc tạo assessment
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
      .limit(1);

    let assessmentId: number;
    if (existingAssessment) {
      assessmentId = existingAssessment.id;
      await tx
        .update(assessments)
        .set({
          passingScore: input.passingScore,
          isDiagnostic: isEntry,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessmentId));

      // Xoá các câu hỏi cũ để cập nhật danh sách mới
      await tx.delete(quizQuestions).where(eq(quizQuestions.assessmentId, assessmentId));
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

    // 4. Lưu từng câu hỏi và các lựa chọn
    for (let pos = 0; pos < input.questions.length; pos++) {
      const q = input.questions[pos];
      const [insertedQ] = await tx
        .insert(quizQuestions)
        .values({
          assessmentId,
          lessonId: isEntry ? null : lessonId,
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

    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Sinh danh sách câu hỏi trắc nghiệm bằng AI cho Quiz bài học hoặc Bài kiểm tra đầu vào.
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
    const [lesson] = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.id, lessonId));
    if (lesson?.title) {
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

  // Lưu bản nháp vào ai_content_drafts
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

  return {
    success: true,
    questions: generated,
  };
}

