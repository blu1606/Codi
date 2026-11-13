// Learner side of the AI classroom: the checkpoints of a lesson, the checkpoint debate (answer → Bo challenges →
// rebuttal → Bo concedes or pushes back with bounded hints → Cô Lam closes) and the classroom chat.
// Access is the lesson player's own gate (active learner, enrolled, path set up) through tutorService.scope.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { lessonMaterials } from "@codi-1/db/schema/course-content";
import { classroomDebateSessions, lessonCheckpoints, type DebateMessage, type DebateState } from "@codi-1/db/schema/classroom";
import { db } from "@/services";
import { tutorService } from "@/lib/ai-tutor-runtime";
import { lessonTranscript } from "@/lib/lesson-player-contract";
import {
  assessAnswer, assessRebuttal, boChallenge, boReact, classmateReply, coLamClose, coLamHint, coLamOpening, type CheckpointContext,
} from "./classroom-agents";
import {
  CLASSMATES, ClassroomError, INITIAL_DEBATE, afterRebuttal, chatExcerpt, clock, gradeOption, pickTrapMode, routeChat, shapeOpening,
  type ClassmateId, type Cue, type Recipient,
} from "./classroom-contract";

type Checkpoint = typeof lessonCheckpoints.$inferSelect;
type Session = typeof classroomDebateSessions.$inferSelect;

/** The lesson's video transcript (first video that has one) and its duration. */
export async function lessonVideoSource(lessonId: string): Promise<{ cues: Cue[] | null; durationSeconds: number | null }> {
  const rows = await db.select({ transcript: lessonMaterials.transcript, durationSeconds: lessonMaterials.durationSeconds })
    .from(lessonMaterials)
    .where(and(eq(lessonMaterials.lessonId, lessonId), eq(lessonMaterials.type, "video")))
    .orderBy(asc(lessonMaterials.position));
  const withCues = rows.find((r) => lessonTranscript(r.transcript));
  const pick = withCues ?? rows[0];
  return { cues: withCues ? lessonTranscript(withCues.transcript) : null, durationSeconds: pick?.durationSeconds ?? null };
}

const message = (agent: DebateMessage["agent"], kind: DebateMessage["kind"], text: string): DebateMessage =>
  ({ id: randomUUID(), agent, kind, text, at: new Date().toISOString() });

function sessionView(s: Session) {
  return { id: s.id, checkpointId: s.checkpointId, phase: s.state.phase, hintLevel: s.state.hintLevel, version: s.version, messages: s.messages };
}

function checkpointView(c: Checkpoint) {
  return { id: c.id, position: c.position, timestampSeconds: c.timestampSeconds, concept: c.concept, question: c.question, options: c.options ?? null };
}

function contextOf(c: Checkpoint, lessonTitle: string): CheckpointContext {
  return {
    lessonTitle, question: c.question, options: c.options ?? null, answerKey: c.answerKey, keyIdea: c.keyIdea,
    misconception: c.misconception, misconceptionExplanation: c.misconceptionExplanation, boClaim: c.boClaim,
  };
}

async function requireCheckpoint(lessonId: string, checkpointId: string) {
  const [c] = await db.select().from(lessonCheckpoints)
    .where(and(eq(lessonCheckpoints.id, checkpointId), eq(lessonCheckpoints.lessonId, lessonId))).limit(1);
  if (!c) throw new ClassroomError("Không tìm thấy điểm dừng này trong bài học.", 404);
  return c;
}

/** Checkpoints of the lesson (no answer keys) and the learner's latest debate per checkpoint. */
export async function getClassroom(userId: string, courseId: string, lessonId: string) {
  const scope = await tutorService.scope(userId, courseId, lessonId);
  const checkpoints = await db.select().from(lessonCheckpoints).where(eq(lessonCheckpoints.lessonId, lessonId)).orderBy(asc(lessonCheckpoints.position));
  const sessions = await db.select().from(classroomDebateSessions)
    .where(and(eq(classroomDebateSessions.userId, userId), eq(classroomDebateSessions.lessonId, lessonId)))
    .orderBy(desc(classroomDebateSessions.createdAt));
  const latest: Record<string, ReturnType<typeof sessionView>> = {};
  for (const s of sessions) if (!latest[s.checkpointId]) latest[s.checkpointId] = sessionView(s);
  return {
    lesson: { id: lessonId, title: scope.lesson.title },
    classmates: CLASSMATES,
    checkpoints: checkpoints.map(checkpointView),
    sessions: latest,
  };
}

/** Opens a debate at a checkpoint: Cô Lam asks the question (never giving the answer away). */
export async function startSession(userId: string, courseId: string, lessonId: string, checkpointId: string) {
  const scope = await tutorService.scope(userId, courseId, lessonId);
  const cp = await requireCheckpoint(lessonId, checkpointId);
  const opening = await coLamOpening(contextOf(cp, scope.lesson.title));
  const [row] = await db.insert(classroomDebateSessions).values({
    userId, lessonId, checkpointId, state: INITIAL_DEBATE,
    messages: [message("colam", "opening", shapeOpening(opening.dialogue, cp.answerKey))],
  }).returning();
  return { session: sessionView(row) };
}

export type SessionAction =
  | { action: "answer"; answer?: string; optionIndex?: number; version: number }
  | { action: "rebut"; text: string; version: number }
  | { action: "skip"; version: number };

/** One learner turn in a debate; the reply carries every new line in speaking order. */
export async function actOnSession(userId: string, courseId: string, lessonId: string, sessionId: string, act: SessionAction) {
  const scope = await tutorService.scope(userId, courseId, lessonId);
  const [s] = await db.select().from(classroomDebateSessions)
    .where(and(eq(classroomDebateSessions.id, sessionId), eq(classroomDebateSessions.userId, userId), eq(classroomDebateSessions.lessonId, lessonId)))
    .limit(1);
  if (!s) throw new ClassroomError("Không tìm thấy phiên tranh luận.", 404);
  if (s.version !== act.version) throw new ClassroomError("Phiên tranh luận vừa được cập nhật ở nơi khác. Tải lại để tiếp tục.", 409, "stale");
  const cp = await requireCheckpoint(lessonId, s.checkpointId);
  const { cues } = await lessonVideoSource(lessonId);
  const ctx = { ...contextOf(cp, scope.lesson.title), excerpt: cues ? chatExcerpt(cues, null, cp.timestampSeconds, 2500) : undefined };
  const added: DebateMessage[] = [];
  let state: DebateState = s.state;

  if (act.action === "answer") {
    if (state.phase !== "question") throw new ClassroomError("Bạn đã trả lời câu hỏi này rồi.", 409, "answered");
    const choice = cp.options && act.optionIndex !== undefined ? cp.options[act.optionIndex] : undefined;
    const answer = (choice ?? act.answer ?? "").trim();
    if (!answer) throw new ClassroomError(cp.options ? "Hãy chọn một phương án." : "Hãy nhập câu trả lời.", 400);
    const graded = gradeOption(cp.options ?? null, cp.correctIndex, act.optionIndex);
    const verdict = graded ?? ((await assessAnswer(ctx, answer)).verdict === "dung" ? "correct" : "wrong");
    const trapMode = pickTrapMode(verdict);
    const bo = await boChallenge(ctx, answer, verdict, trapMode);
    added.push(message("learner", "answer", answer), message("bo", "challenge", bo.dialogue));
    state = { ...state, phase: "debate", verdict, trapMode };
  } else if (act.action === "rebut") {
    if (state.phase !== "debate") throw new ClassroomError("Phần tranh luận này đã kết thúc.", 409, "closed");
    const boLine = [...s.messages].reverse().find((m) => m.agent === "bo")?.text ?? cp.boClaim;
    const sharp = (await assessRebuttal(ctx, act.text, boLine)).verdict === "sac_ben";
    const outcome = afterRebuttal(state, sharp);
    added.push(message("learner", "rebuttal", act.text));
    if (outcome.next === "concede") {
      const [bo, close] = await Promise.all([boReact(ctx, act.text, true), coLamClose(ctx, "won")]);
      added.push(message("bo", "concede", bo.dialogue), message("colam", "closing", close.dialogue));
    } else if (outcome.next === "hint") {
      const [bo, hint] = await Promise.all([boReact(ctx, act.text, false), coLamHint(ctx, 1, cp.hint1)]);
      added.push(message("bo", "pushback", bo.dialogue), message("colam", "hint", hint.dialogue));
    } else {
      const [hint, close] = await Promise.all([coLamHint(ctx, 2, cp.hint2), coLamClose(ctx, "hinted")]);
      added.push(message("colam", "hint", hint.dialogue), message("colam", "closing", close.dialogue));
    }
    state = outcome.state;
  } else {
    if (state.phase === "closed" || state.phase === "skipped") throw new ClassroomError("Phần tranh luận này đã kết thúc.", 409, "closed");
    // No model call: skipping must work even when the AI is down, and still leaves the key idea behind.
    added.push(message("colam", "skip", `Không sao, mình xem tiếp nhé. Ý then chốt của đoạn này${cues ? ` [${clock(cp.timestampSeconds)}]` : ""}: ${cp.keyIdea}`));
    state = { ...state, phase: "skipped" };
  }

  const [row] = await db.update(classroomDebateSessions)
    .set({ state, messages: [...s.messages, ...added], version: sql`${classroomDebateSessions.version} + 1`, updatedAt: new Date() })
    .where(and(eq(classroomDebateSessions.id, s.id), eq(classroomDebateSessions.version, s.version)))
    .returning();
  if (!row) throw new ClassroomError("Phiên tranh luận vừa được cập nhật ở nơi khác. Tải lại để tiếp tục.", 409, "stale");
  return { session: sessionView(row), added };
}

/** Classroom chat: the chosen classmate (or the one the intent points to) answers; Bo may chime in after. */
export async function classroomChat(userId: string, courseId: string, lessonId: string,
  input: { message: string; recipient: Recipient; currentTime?: number; history: { agent: string; text: string }[] }) {
  const scope = await tutorService.scope(userId, courseId, lessonId);
  const { cues } = await lessonVideoSource(lessonId);
  const ctx = {
    lessonTitle: scope.lesson.title,
    excerpt: chatExcerpt(cues, scope.lesson.body, input.currentTime),
    timeLabel: input.currentTime !== undefined ? clock(input.currentTime) : null,
  };
  const route = routeChat(input.message, input.recipient);
  const primary = await classmateReply(route.primary, ctx, input.message, input.history);
  const replies: { agent: ClassmateId; text: string }[] = [{ agent: route.primary, text: primary.dialogue }];
  if (route.chime) {
    try {
      const chime = await classmateReply(route.chime, ctx, input.message, input.history, { agent: route.primary, text: primary.dialogue });
      replies.push({ agent: route.chime, text: chime.dialogue });
    } catch (error) {
      // The follow-up is optional; the learner already has an answer.
      console.warn("[classroom] chime-in skipped:", error instanceof Error ? error.message : error);
    }
  }
  return { replies, routedTo: route.primary };
}
