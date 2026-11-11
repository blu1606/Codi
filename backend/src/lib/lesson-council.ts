// Lecturer side of the AI classroom: the "War Room" council. Cô Lam picks checkpoint moments from the lesson's
// transcript (or reading text), Bo proposes a misconception trap, Trí cross-checks it by reasoning (bounded
// rounds), Linh Chi writes the hint ladder, Minh Khang an analogy, Cô Lam writes the question and does a final
// check. Every turn is streamed and kept on the run; the lecturer reviews the draft and applies it to the lesson.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { courseLessons } from "@codi-1/db/schema/course-content";
import { lessonCheckpoints, lessonCouncilRuns, type CheckpointDraft, type CouncilDraft, type CouncilEvent } from "@codi-1/db/schema/classroom";
import { db } from "@/services";
import { getEditableCourse, getOwnedCourse, requireCourseLesson } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";
import {
  councilBoTrap, councilFinalCheck, councilLinhChiNotes, councilMinhKhangAnalogy, councilPickMoments, councilTriCheck, councilWriteQuestion,
  mapAiError, type CouncilSource, type Moment,
} from "./classroom-agents";
import { ClassroomError, checkpointDraftSchema, clock, councilMaterial, normalizeCheckpoints, shuffleOptions } from "./classroom-contract";
import { lessonVideoSource } from "./classroom-service";
import { checkRateLimit } from "./rate-limit";

const MAX_CROSS_CHECK_ROUNDS = 2;
// One council run is ~10-20 model turns.
const RUNS_PER_HOUR = 10;
// A run whose process died (restart, crash) stops being "running" after this long without a new turn.
const STALE_RUN_MS = 3 * 60 * 1000;

type Run = typeof lessonCouncilRuns.$inferSelect;

async function lessonRow(lessonId: string) {
  const [l] = await db.select({ id: courseLessons.id, title: courseLessons.title, body: courseLessons.body, durationSeconds: courseLessons.durationSeconds })
    .from(courseLessons).where(eq(courseLessons.id, lessonId)).limit(1);
  if (!l) throw new Error("Không tìm thấy bài học trong khoá học này.");
  return l;
}

async function councilSource(courseTitle: string, lessonId: string) {
  const lesson = await lessonRow(lessonId);
  const video = await lessonVideoSource(lessonId);
  const durationSeconds = video.durationSeconds ?? (lesson.durationSeconds || null);
  const source: CouncilSource = {
    lessonTitle: lesson.title, courseTitle, durationSeconds, hasTimestamps: !!video.cues,
    spanSeconds: video.cues?.length ? Math.ceil(video.cues[video.cues.length - 1].end ?? video.cues[video.cues.length - 1].start) : durationSeconds,
    material: councilMaterial(video.cues, lesson.body),
  };
  return {
    lesson, source,
    info: { kind: video.cues ? "transcript" as const : lesson.body?.trim() ? "body" as const : "none" as const,
      cues: video.cues?.length ?? 0, chars: source.material.length, durationSeconds, hasVideo: video.durationSeconds !== null || !!video.cues },
  };
}

function runSummary(r: Run) {
  return { id: r.id, status: r.status, createdAt: r.createdAt, appliedAt: r.appliedAt, error: r.error, checkpointCount: r.draft?.checkpoints.length ?? 0 };
}

async function expireStaleRuns(lessonId: string) {
  await db.update(lessonCouncilRuns).set({ status: "failed", error: "Phiên họp bị gián đoạn.", updatedAt: new Date() })
    .where(and(eq(lessonCouncilRuns.lessonId, lessonId), eq(lessonCouncilRuns.status, "running"),
      lt(lessonCouncilRuns.updatedAt, new Date(Date.now() - STALE_RUN_MS))));
}

/** War Room data: the lesson source, applied checkpoints (with answer keys) and recent runs. */
export async function councilOverview(courseId: string, lessonId: string) {
  const { course } = await getOwnedCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  await expireStaleRuns(lessonId);
  const { lesson, info } = await councilSource(course.title, lessonId);
  const checkpoints = await db.select().from(lessonCheckpoints).where(eq(lessonCheckpoints.lessonId, lessonId)).orderBy(asc(lessonCheckpoints.position));
  const runs = await db.select().from(lessonCouncilRuns).where(eq(lessonCouncilRuns.lessonId, lessonId)).orderBy(desc(lessonCouncilRuns.createdAt)).limit(5);
  return {
    course: { id: course.id, title: course.title, status: course.status },
    lesson: { id: lesson.id, title: lesson.title },
    readOnly: course.status === "pending",
    source: info,
    checkpoints: checkpoints.map(toDraft).map((c, i) => ({ ...c, id: checkpoints[i].id })),
    runs: runs.map(runSummary),
  };
}

export async function getCouncilRun(courseId: string, lessonId: string, runId: string) {
  await getOwnedCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  await expireStaleRuns(lessonId);
  const [run] = await db.select().from(lessonCouncilRuns).where(and(eq(lessonCouncilRuns.id, runId), eq(lessonCouncilRuns.lessonId, lessonId))).limit(1);
  if (!run) throw new ClassroomError("Không tìm thấy phiên họp này.", 404);
  return { run: { ...runSummary(run), events: run.events, draft: run.draft } };
}

/** Checks ownership and input, then opens a run row; the caller streams runCouncil afterwards. */
export async function beginCouncil(courseId: string, lessonId: string, count: number) {
  const { course, user } = await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  await expireStaleRuns(lessonId);
  const { source, info } = await councilSource(course.title, lessonId);
  if (info.kind === "none") throw new ClassroomError("Bài học chưa có transcript video hay nội dung bài đọc để hội đồng đọc.", 422);
  const [busy] = await db.select({ id: lessonCouncilRuns.id }).from(lessonCouncilRuns)
    .where(and(eq(lessonCouncilRuns.lessonId, lessonId), eq(lessonCouncilRuns.status, "running"))).limit(1);
  if (busy) throw new ClassroomError("Hội đồng đang họp cho bài học này. Đợi phiên hiện tại kết thúc.", 409, "busy");
  if (!checkRateLimit(`lesson-council:${user.id}`, { windowMs: 60 * 60 * 1000, max: RUNS_PER_HOUR }).success)
    throw new ClassroomError("Đã dùng hết lượt họp hội đồng AI trong giờ này. Thử lại sau ít phút.", 429, "rate_limited");
  const [run] = await db.insert(lessonCouncilRuns).values({ courseId, lessonId, createdBy: user.id }).returning();
  return { runId: run.id, userId: user.id, source, info, count };
}

/**
 * Runs the council turn by turn. `emit` receives every event as it happens (the SSE stream); each event is also
 * appended to the run, so the War Room can reload a run that the browser lost. Keeps going if the client leaves.
 */
export async function runCouncil(runId: string, source: CouncilSource, count: number, emit: (event: CouncilEvent) => void): Promise<CouncilDraft> {
  const record = async (agent: CouncilEvent["agent"], phase: CouncilEvent["phase"], kind: CouncilEvent["kind"], text: string, checkpointIndex?: number) => {
    const event: CouncilEvent = { id: randomUUID(), at: new Date().toISOString(), agent, phase, kind, text, ...(checkpointIndex !== undefined ? { checkpointIndex } : {}) };
    emit(event);
    await db.update(lessonCouncilRuns)
      .set({ events: sql`${lessonCouncilRuns.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() })
      .where(eq(lessonCouncilRuns.id, runId));
  };

  try {
    const what = source.hasTimestamps ? "transcript video" : "nội dung bài đọc (không có mốc thời gian, mốc dừng là ước lượng)";
    await record("system", "source", "speech",
      `Hội đồng đọc ${what} của bài "${source.lessonTitle}"${source.durationSeconds ? `, thời lượng ${clock(source.durationSeconds)}` : ""}: ${source.material.length.toLocaleString("vi-VN")} ký tự.`);

    const picked = await councilPickMoments(source, count);
    await record("colam", "moments", "thought", picked.thought);
    await record("colam", "moments", "speech", picked.speech);
    const end = source.durationSeconds ? source.durationSeconds - 1 : Number.POSITIVE_INFINITY;
    const moments: Moment[] = picked.moments.slice(0, count)
      .map((m) => ({ ...m, timestampSeconds: Math.max(0, Math.min(Math.round(m.timestampSeconds), end)) }))
      .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

    const drafts: CheckpointDraft[] = [];
    for (const [i, m] of moments.entries()) {
      const at = clock(m.timestampSeconds);
      let feedback: string | null = null;
      let approved: { trap: { claim: string; misconception: string }; correction: string } | null = null;
      for (let round = 0; round < MAX_CROSS_CHECK_ROUNDS && !approved; round++) {
        const trap = await councilBoTrap(source, m, feedback);
        await record("bo", "trap", "thought", trap.thought, i);
        await record("bo", "trap", "speech", `${trap.speech}\nBẫy đề xuất (${at}): ${trap.claim}`, i);
        const check = await councilTriCheck(source, m, trap);
        await record("tri", "crosscheck", "thought", check.thought, i);
        await record("tri", "crosscheck", "verdict", check.speech, i);
        if (check.verdict === "approve") approved = { trap, correction: check.correction };
        else feedback = `${check.reason} ${check.correction}`.trim();
      }
      if (!approved) {
        await record("system", "crosscheck", "speech", `Hội đồng bỏ mốc ${at} vì sau ${MAX_CROSS_CHECK_ROUNDS} lượt chưa có bẫy được Trí đồng thuận.`, i);
        continue;
      }
      const notes = await councilLinhChiNotes(m, approved.trap, approved.correction);
      await record("linhchi", "notes", "thought", notes.thought, i);
      await record("linhchi", "notes", "speech", notes.speech, i);
      const analogy = await councilMinhKhangAnalogy(m, approved.trap);
      await record("minhkhang", "notes", "thought", analogy.thought, i);
      await record("minhkhang", "notes", "speech", analogy.speech, i);
      const q = await councilWriteQuestion(m, approved.trap, approved.correction);
      await record("colam", "question", "thought", q.thought, i);
      const choice = q.correctIndex < q.options.length ? shuffleOptions(q.options, q.correctIndex) : { options: q.options, correctIndex: q.correctIndex };
      const parsed = checkpointDraftSchema.safeParse({
        timestampSeconds: m.timestampSeconds, concept: m.concept, question: q.question, options: choice.options, correctIndex: choice.correctIndex,
        answerKey: q.answerKey, keyIdea: q.keyIdea,
        misconception: { description: approved.trap.misconception, explanation: approved.correction, hint1: notes.hint1, hint2: notes.hint2,
          boClaim: approved.trap.claim, analogy: analogy.analogy },
      });
      if (!parsed.success) {
        await record("system", "question", "speech", `Câu hỏi ở mốc ${at} chưa hợp lệ (phương án hoặc đáp án), hội đồng bỏ mốc này.`, i);
        continue;
      }
      drafts.push(parsed.data);
      await record("colam", "question", "checkpoint", `${q.speech}\nĐiểm dừng ${at}: ${q.question}`, i);
    }
    if (!drafts.length) throw new ClassroomError("Hội đồng chưa thống nhất được điểm dừng nào. Thử họp lại.", 422, "empty");

    const checkpoints = normalizeCheckpoints(drafts, source.durationSeconds);
    const final = await councilFinalCheck(source, checkpoints.map((c) => ({ timestampSeconds: c.timestampSeconds, concept: c.concept, question: c.question })));
    await record("colam", "final", "thought", final.thought);
    await record("colam", "final", "speech", final.speech);
    const draft: CouncilDraft = { checkpoints, summary: final.speech };
    await db.update(lessonCouncilRuns).set({ status: "completed", draft, updatedAt: new Date() }).where(eq(lessonCouncilRuns.id, runId));
    await record("system", "done", "speech", `Bản nháp có ${checkpoints.length} điểm dừng, chờ giảng viên duyệt.`);
    return draft;
  } catch (error) {
    const failure = mapAiError(error);
    try {
      await record("system", "done", "error", failure.message);
      await db.update(lessonCouncilRuns).set({ status: "failed", error: failure.message, updatedAt: new Date() }).where(eq(lessonCouncilRuns.id, runId));
    } catch (persistError) {
      console.error("[council] could not record the failure", persistError);
    }
    throw failure;
  }
}

function toDraft(c: typeof lessonCheckpoints.$inferSelect): CheckpointDraft {
  return {
    timestampSeconds: c.timestampSeconds, concept: c.concept, question: c.question, options: c.options ?? null, correctIndex: c.correctIndex,
    answerKey: c.answerKey, keyIdea: c.keyIdea,
    misconception: { description: c.misconception, explanation: c.misconceptionExplanation, hint1: c.hint1, hint2: c.hint2, boClaim: c.boClaim, analogy: c.analogy },
  };
}

/**
 * Replaces the lesson's checkpoints with the run's draft (or the lecturer's edited copy of it). Learner debates of
 * the replaced checkpoints go with them.
 */
export async function applyCouncilRun(courseId: string, lessonId: string, runId: string, edited?: CheckpointDraft[]) {
  await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  const [run] = await db.select().from(lessonCouncilRuns).where(and(eq(lessonCouncilRuns.id, runId), eq(lessonCouncilRuns.lessonId, lessonId))).limit(1);
  if (!run) throw new ClassroomError("Không tìm thấy phiên họp này.", 404);
  if (!run.draft || (run.status !== "completed" && run.status !== "applied")) throw new ClassroomError("Phiên họp chưa có bản nháp hoàn chỉnh.", 409);
  const video = await lessonVideoSource(lessonId);
  const lesson = await lessonRow(lessonId);
  const checkpoints = normalizeCheckpoints(edited ?? run.draft.checkpoints, video.durationSeconds ?? (lesson.durationSeconds || null));
  if (!checkpoints.length) throw new ClassroomError("Bản nháp không còn điểm dừng nào nằm trong video.", 422);
  await db.transaction(async (tx) => {
    await tx.delete(lessonCheckpoints).where(eq(lessonCheckpoints.lessonId, lessonId));
    await tx.insert(lessonCheckpoints).values(checkpoints.map((c, position) => ({
      courseId, lessonId, position, timestampSeconds: c.timestampSeconds, concept: c.concept, question: c.question,
      options: c.options, correctIndex: c.correctIndex, answerKey: c.answerKey, keyIdea: c.keyIdea,
      misconception: c.misconception.description, misconceptionExplanation: c.misconception.explanation,
      hint1: c.misconception.hint1, hint2: c.misconception.hint2, boClaim: c.misconception.boClaim, analogy: c.misconception.analogy,
      councilRunId: runId,
    })));
    await tx.update(lessonCouncilRuns).set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() }).where(eq(lessonCouncilRuns.id, runId));
  });
  return councilOverview(courseId, lessonId);
}

/** Removes every checkpoint of the lesson (and the learner debates on them). */
export async function clearCheckpoints(courseId: string, lessonId: string) {
  await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);
  await db.delete(lessonCheckpoints).where(eq(lessonCheckpoints.lessonId, lessonId));
  return councilOverview(courseId, lessonId);
}
