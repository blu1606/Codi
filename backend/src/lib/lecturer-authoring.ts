// Lecturer authoring helpers the rebuild UI needs beyond Codi's own actions: a per-lesson outline for the
// curriculum table (lesson kind, quiz size, code tests, assignment rubric), the assignment builder (instructions,
// submission format, scores, rubric) and the guided-tutorial step editor. Writes go through
// withCourseContentWrite, so ownership, the pending-review lock and knowledge-map staleness follow Codi's rules.
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { ForbiddenError } from "@codi-1/auth";
import { assessmentSubmissions, assessments, codingExercises, codingTestCases, codingTestResults, codingWorkspaces, courseLessons, courses,
  studentEnrollments } from "@codi-1/db";
import { parseRubric } from "@/lib/assignment-rubric";

export { parseRubric };
import type { TutorialStep } from "@codi-1/db/schema/coding-tutorial";
import { NextResponse } from "next/server";
import { db } from "@/services";
import { fetchCourseDataForReview } from "@/lib/publication-course-data";
import { createNotificationService } from "@/lib/notification-service";
import {
  getEditableCourse,
  getOwnedCourse,
  requireCourseLesson,
  withCourseContentWrite,
} from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";

export class AuthoringInputError extends Error {}

/** Curriculum outline: what each lesson carries, plus the enrolment count that guards course deletion. */
export async function getLecturerCourseOutline(courseId: string) {
  await getOwnedCourse(courseId);
  const { courseData } = await fetchCourseDataForReview(courseId);
  const lessonIds = courseData.chapters.flatMap((ch) => ch.lessons.map((l) => l.id));
  const rows = lessonIds.length
    ? await db
        .select({ lessonId: assessments.lessonId, type: assessments.type, rubric: assessments.rubric,
          steps: codingExercises.tutorialSteps, verifiedAt: codingExercises.solutionVerifiedAt })
        .from(assessments)
        .leftJoin(codingExercises, eq(codingExercises.assessmentId, assessments.id))
        .where(and(eq(assessments.courseId, courseId), inArray(assessments.lessonId, lessonIds)))
    : [];
  const [enrolled] = await db.select({ n: count() }).from(studentEnrollments).where(eq(studentEnrollments.courseId, courseId));
  const lessons: Record<string, unknown> = {};
  for (const ch of courseData.chapters) {
    for (const l of ch.lessons) {
      const coding = rows.find((r) => r.lessonId === l.id && r.type === "coding");
      const assignment = rows.find((r) => r.lessonId === l.id && r.type === "assignment");
      const tutorial = !!coding && Array.isArray(coding.steps) && coding.steps.length > 0;
      const tests = l.code?.tests ?? [];
      lessons[l.id] = {
        materials: (l.materials ?? []).map((m) => ({ type: m.type, title: m.title })),
        quiz: l.quiz ? { count: l.quiz.questions.length } : null,
        code: coding
          ? { kind: tutorial ? "tutorial" : "challenge", tests: tests.length, hiddenTests: tests.filter((t) => t.hidden).length,
              verified: tests.length > 0 && !!coding.verifiedAt }
          : null,
        assignment: assignment ? { rubricCount: parseRubric(assignment.rubric).length } : null,
      };
    }
  }
  return { lessons, enrolledCount: Number(enrolled?.n ?? 0) };
}

const FORMATS = ["text", "file", "link", "file_or_link"] as const;
type Format = (typeof FORMATS)[number];

export async function getLessonAssignment(courseId: string, lessonId: string) {
  await getOwnedCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  const [a] = await db.select().from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lessonId), eq(assessments.type, "assignment")))
    .limit(1);
  if (!a) return null;
  return {
    id: a.id, instructions: a.instructions ?? "", submissionFormat: a.submissionFormat ?? "link", maxScore: a.maxScore,
    passingScore: a.passingScore ?? 50, dueDays: a.dueDays ?? 7, maxFileSizeMb: a.maxFileSizeMb, rubric: parseRubric(a.rubric),
  };
}

export type AssignmentInput = {
  instructions: string; submissionFormat: Format; maxScore: number; passingScore: number; dueDays: number;
  rubric: { id?: string; name: string; desc?: string; points: number }[];
};

function readAssignment(body: unknown): AssignmentInput | null {
  if (body === null) return null;
  if (!body || typeof body !== "object") throw new AuthoringInputError("Dữ liệu bài tập không hợp lệ.");
  const b = body as Record<string, unknown>;
  const instructions = String(b.instructions ?? "").trim();
  if (!instructions) throw new AuthoringInputError('Nhập yêu cầu bài tập hoặc tắt "Có bài tập".');
  if (instructions.length > 10000) throw new AuthoringInputError("Yêu cầu bài tập tối đa 10.000 ký tự.");
  const submissionFormat = b.submissionFormat as Format;
  if (!FORMATS.includes(submissionFormat)) throw new AuthoringInputError("Chọn ít nhất một cách nộp bài: đường dẫn hoặc tệp.");
  const maxScore = Number(b.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) throw new AuthoringInputError("Điểm tối đa phải lớn hơn 0.");
  const passingScore = Math.round(Number(b.passingScore));
  if (!Number.isFinite(passingScore) || passingScore < 1 || passingScore > 100) throw new AuthoringInputError("Điểm đạt phải từ 1 đến 100%.");
  const dueDays = Math.max(1, Math.min(365, Math.round(Number(b.dueDays) || 1)));
  const raw = Array.isArray(b.rubric) ? b.rubric : [];
  if (raw.length > 20) throw new AuthoringInputError("Thang chấm tối đa 20 tiêu chí.");
  const rubric = raw.map((k, i) => {
    const r = (k ?? {}) as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    if (!name) throw new AuthoringInputError("Mỗi tiêu chí chấm cần có tên.");
    const points = Number(r.points);
    if (!Number.isFinite(points) || points < 0) throw new AuthoringInputError(`Điểm tiêu chí "${name}" không hợp lệ.`);
    return { id: typeof r.id === "string" && r.id ? r.id.slice(0, 64) : `r${i + 1}`, name: name.slice(0, 200), desc: String(r.desc ?? "").trim().slice(0, 1000), points };
  });
  const total = Math.round(rubric.reduce((s, k) => s + k.points, 0) * 100) / 100;
  if (rubric.length && total !== maxScore) throw new AuthoringInputError(`Tổng điểm thang chấm (${total}) phải bằng điểm tối đa (${maxScore}).`);
  return { instructions, submissionFormat, maxScore, passingScore, dueDays, rubric };
}

/** Creates, updates (input) or removes (null) the lesson's assignment. Removal is refused once learners submitted. */
export async function saveLessonAssignment(courseId: string, lessonId: string, body: unknown) {
  const input = readAssignment(body);
  return withCourseContentWrite(courseId, async (store) => {
    const lesson = await requireCourseLesson(courseId, lessonId, store);
    const [existing] = await store.select({ id: assessments.id }).from(assessments)
      .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lessonId), eq(assessments.type, "assignment")))
      .limit(1);
    if (!input) {
      if (existing) {
        try {
          await store.delete(assessments).where(eq(assessments.id, existing.id));
        } catch {
          throw new AuthoringInputError("Không thể bỏ bài tập vì đã có học viên nộp bài.");
        }
      }
      return { success: true as const, assignment: null };
    }
    const values = {
      instructions: input.instructions, submissionFormat: input.submissionFormat, maxScore: input.maxScore,
      passingScore: input.passingScore, dueDays: input.dueDays, rubric: input.rubric.length ? JSON.stringify(input.rubric) : null,
    };
    if (existing) await store.update(assessments).set(values).where(eq(assessments.id, existing.id));
    else await store.insert(assessments).values({ ...values, courseId, lessonId, type: "assignment", title: `Bài tập: ${lesson.title}`, status: "published" });
    return { success: true as const, assignment: input };
  });
}

export async function getLessonTutorial(courseId: string, lessonId: string) {
  await getOwnedCourse(courseId);
  const lesson = await requireCourseLesson(courseId, lessonId);
  const [row] = await db.select({ assessmentId: assessments.id, title: assessments.title, minutes: assessments.timeLimitMinutes,
    fileName: codingExercises.fileName, language: codingExercises.language, steps: codingExercises.tutorialSteps })
    .from(assessments).innerJoin(codingExercises, eq(codingExercises.assessmentId, assessments.id))
    .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lessonId), eq(assessments.type, "coding")))
    .limit(1);
  if (!row || !Array.isArray(row.steps) || !row.steps.length) return null;
  return { title: lesson.title, durationMinutes: Math.round(lesson.durationSeconds / 60) || row.minutes || 15,
    fileName: row.fileName ?? "main.js", language: row.language, steps: row.steps };
}

function readSteps(raw: unknown): TutorialStep[] {
  if (!Array.isArray(raw) || !raw.length) throw new AuthoringInputError("Cần ít nhất một bước hướng dẫn.");
  if (raw.length > 50) throw new AuthoringInputError("Tối đa 50 bước hướng dẫn.");
  return raw.map((s, si) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const step: TutorialStep = { title: String(o.title ?? "").trim().slice(0, 200) || `Bước ${si + 1}`, body: String(o.body ?? "").slice(0, 20000), starter: String(o.starter ?? "").slice(0, 20000) };
    if (o.isSolution) step.isSolution = true;
    const tests = Array.isArray(o.tests) ? o.tests : [];
    if (tests.length) {
      step.tests = tests.map((t, i) => {
        const x = (t ?? {}) as Record<string, unknown>;
        const name = String(x.name ?? "").trim(); const input = String(x.input ?? "").trim();
        if (!name) throw new AuthoringInputError(`Bước ${si + 1}, test ${i + 1}: chưa có tên.`);
        if (!input) throw new AuthoringInputError(`Bước ${si + 1}, test ${i + 1}: chưa có biểu thức gọi hàm.`);
        return { name: name.slice(0, 200), input: input.slice(0, 10000), expectedOutput: String(x.expectedOutput ?? "").slice(0, 4096) };
      });
    }
    return step;
  });
}

/** Saves a guided tutorial (title, duration, file name, steps); creates its coding assessment the first time. */
export async function saveLessonTutorial(courseId: string, lessonId: string, body: unknown) {
  if (!body || typeof body !== "object") throw new AuthoringInputError("Dữ liệu bài hướng dẫn không hợp lệ.");
  const b = body as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  if (!title) throw new AuthoringInputError("Tên bài không được để trống.");
  if (title.length > 200) throw new AuthoringInputError("Tên bài tối đa 200 ký tự.");
  const minutes = Math.min(180, Math.max(1, Math.round(Number(b.durationMinutes) || 15)));
  const fileName = String(b.fileName ?? "main.js").trim().slice(0, 100) || "main.js";
  const steps = readSteps(b.steps);
  return withCourseContentWrite(courseId, async (store) => {
    await requireCourseLesson(courseId, lessonId, store);
    await store.update(courseLessons).set({ title, durationSeconds: minutes * 60 }).where(eq(courseLessons.id, lessonId));
    const [existing] = await store.select({ id: assessments.id }).from(assessments)
      .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lessonId), eq(assessments.type, "coding")))
      .limit(1);
    let assessmentId = existing?.id;
    if (assessmentId) await store.update(assessments).set({ title, timeLimitMinutes: minutes }).where(eq(assessments.id, assessmentId));
    else {
      const [created] = await store.insert(assessments).values({ courseId, lessonId, type: "coding", title, timeLimitMinutes: minutes, status: "published" })
        .returning({ id: assessments.id });
      assessmentId = created!.id;
    }
    const [ex] = await store.select({ id: codingExercises.id }).from(codingExercises).where(eq(codingExercises.assessmentId, assessmentId)).limit(1);
    if (ex) await store.update(codingExercises).set({ tutorialSteps: steps, fileName }).where(eq(codingExercises.id, ex.id));
    else await store.insert(codingExercises).values({ assessmentId, language: "javascript", fileName, tutorialSteps: steps, starterCode: steps[0]!.starter });
    return { success: true as const };
  });
}

/** Deletes a lecturer's own course that nobody is enrolled in and that is not waiting for review. */
export async function deleteLecturerCourse(courseId: string) {
  const { course } = await getEditableCourse(courseId);
  if (course.status === "published") throw new AuthoringInputError("Khoá học đang bán không thể xoá. Liên hệ quản trị viên nếu cần ẩn khoá học.");
  const [enrolled] = await db.select({ n: count() }).from(studentEnrollments).where(eq(studentEnrollments.courseId, courseId));
  if (Number(enrolled?.n ?? 0) > 0) throw new AuthoringInputError("Khoá học đã có học viên nên không thể xoá.");
  try {
    await db.delete(courses).where(eq(courses.id, courseId));
  } catch {
    throw new AuthoringInputError("Khoá học có dữ liệu liên kết (đơn hàng, đánh giá…) nên không thể xoá.");
  }
  return { success: true as const };
}

/**
 * "Bài code" tab of learner progress: per coding lesson, learners who tried, pass (challenge) or completion
 * (tutorial) rate, average submits, solution views and the most-failed test on submitted runs.
 */
export async function getCourseCodeStats(courseId: string) {
  await getOwnedCourse(courseId);
  const exercises = await db.select({ lessonId: assessments.lessonId, title: courseLessons.title, position: courseLessons.position, assessmentId: assessments.id, exerciseId: codingExercises.id, steps: codingExercises.tutorialSteps })
    .from(assessments).innerJoin(codingExercises, eq(codingExercises.assessmentId, assessments.id))
    .innerJoin(courseLessons, eq(courseLessons.id, assessments.lessonId))
    .where(and(eq(assessments.courseId, courseId), eq(assessments.type, "coding")));
  const rows = [];
  for (const ex of exercises) {
    const tutorial = Array.isArray(ex.steps) && ex.steps.length > 0;
    const tests = await db.select({ id: codingTestCases.id, name: codingTestCases.name, isSample: codingTestCases.isSample })
      .from(codingTestCases).where(eq(codingTestCases.exerciseId, ex.exerciseId));
    const spaces = await db.select({ enrollmentId: codingWorkspaces.enrollmentId, viewed: codingWorkspaces.solutionViewed, progress: codingWorkspaces.tutorialProgress })
      .from(codingWorkspaces).where(eq(codingWorkspaces.exerciseId, ex.exerciseId));
    const subs = await db.select({ id: assessmentSubmissions.id, enrollmentId: assessmentSubmissions.enrollmentId, mode: assessmentSubmissions.mode, passed: assessmentSubmissions.isPassed })
      .from(assessmentSubmissions).where(eq(assessmentSubmissions.assessmentId, ex.assessmentId));
    const learners = new Set([...spaces.map((w) => w.enrollmentId), ...subs.map((x) => x.enrollmentId)]);
    const n = learners.size;
    let rate: number | null = null; let avgSubmits: number | null = null; let avgStep: number | null = null;
    let worst: { name: string; hidden: boolean; count: number } | null = null;
    if (tutorial) {
      const last = (ex.steps as unknown[]).length - 1;
      const done = spaces.filter((w) => (w.progress?.visited ?? []).includes(last)).length;
      rate = n ? Math.round((done / n) * 100) : null;
      avgStep = spaces.length ? Math.round((spaces.reduce((t, w) => t + (w.progress?.current ?? 0) + 1, 0) / spaces.length) * 10) / 10 : null;
    } else {
      const submits = subs.filter((x) => x.mode === "submit");
      const passedBy = new Set(submits.filter((x) => x.passed).map((x) => x.enrollmentId));
      const submitters = new Set(submits.map((x) => x.enrollmentId));
      rate = n ? Math.round((passedBy.size / n) * 100) : null;
      avgSubmits = submitters.size ? Math.round((submits.length / submitters.size) * 10) / 10 : null;
      const ids = submits.map((x) => x.id);
      if (ids.length) {
        const failed = await db.select({ testCaseId: codingTestResults.testCaseId, n: count() }).from(codingTestResults)
          .where(and(inArray(codingTestResults.submissionId, ids), eq(codingTestResults.isPassed, false)))
          .groupBy(codingTestResults.testCaseId).orderBy(sql`count(*) desc`).limit(1);
        const t = failed[0] && tests.find((x) => x.id === failed[0]!.testCaseId);
        if (t) worst = { name: t.name, hidden: !t.isSample, count: Number(failed[0]!.n) };
      }
    }
    rows.push({ lessonId: ex.lessonId, title: ex.title, kind: tutorial ? "tutorial" : "challenge", tests: tests.length, n, rate, avgSubmits, avgStep,
      viewed: spaces.filter((w) => w.viewed).length, worst });
  }
  return { rows };
}

/** In-app notice from the lecturer to one enrolled learner ("Nhắn" on the progress page). */
export async function messageLearner(courseId: string, userId: string, body: unknown) {
  const { course, user } = await getOwnedCourse(courseId);
  const text = String((body && typeof body === "object" && (body as Record<string, unknown>).text) ?? "").trim();
  if (text.length < 10) throw new AuthoringInputError("Tin nhắn cần ít nhất 10 ký tự.");
  if (text.length > 2000) throw new AuthoringInputError("Tin nhắn tối đa 2000 ký tự.");
  const [enrolled] = await db.select({ id: studentEnrollments.id }).from(studentEnrollments)
    .where(and(eq(studentEnrollments.courseId, courseId), eq(studentEnrollments.userId, userId))).limit(1);
  if (!enrolled) throw new AuthoringInputError("Học viên chưa đăng ký khoá học này.");
  await createNotificationService(db).notify(userId, `Tin nhắn từ giảng viên ${user.name}`, `${course.title}: ${text}`, `/learn/${courseId}`);
  return { success: true as const };
}

/** Maps authoring/ownership failures to HTTP replies for the lecturer route handlers. */
export function authoringErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof AuthoringInputError) return NextResponse.json({ error: message }, { status: 400 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 });
  if (message.startsWith("Unauthorized")) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  if (message.startsWith("Không tìm thấy")) return NextResponse.json({ error: message }, { status: 404 });
  if (message.startsWith("Khoá học đang chờ duyệt")) return NextResponse.json({ error: message }, { status: 409 });
  console.error("[lecturer-authoring]", error);
  return NextResponse.json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, { status: 500 });
}

/** Reads a JSON body; undefined when it is missing or malformed. */
export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return undefined; }
}
