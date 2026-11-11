// AI classroom contract: the six characters, request validation, the checkpoint debate state machine, recipient
// routing of the classroom chat and the council draft rules. Pure functions only; the services own I/O.
import { z } from "zod";
import type { CheckpointDraft, DebateState } from "@codi-1/db/schema/classroom";

export class ClassroomError extends Error {
  constructor(message: string, readonly status: number, readonly code: string = "error") {
    super(message);
    this.name = "ClassroomError";
  }
}

export const AI_NOT_CONFIGURED = "AI không khả dụng: hệ thống chưa cấu hình khoá AI. Quản trị viên cần thiết lập AI_PROVIDER và khoá API tương ứng.";
export const AI_UNAVAILABLE = "AI không khả dụng lúc này. Vui lòng thử lại sau ít phút.";
export const AI_RATE_LIMITED = "AI đang quá tải hoặc bạn đã gửi quá nhiều lượt. Đợi một lúc rồi thử lại.";
export const AI_BAD_OUTPUT = "AI trả lời chưa đúng định dạng. Vui lòng thử lại.";

export const CLASSMATES = {
  colam: { name: "Cô Lam", role: "Giáo viên chủ trì" },
  bo: { name: "Bo", role: "Bạn học hay cãi" },
  tri: { name: "Trí", role: "Đào sâu bản chất" },
  linhchi: { name: "Linh Chi", role: "Sổ tay ghi nhớ" },
  minhkhang: { name: "Minh Khang", role: "Ví dụ đời thường" },
  an: { name: "Trợ giảng An", role: "Gợi ý từng bước" },
} as const;
export type ClassmateId = keyof typeof CLASSMATES;
export const RECIPIENTS = ["all", "colam", "bo", "tri", "linhchi", "minhkhang", "an"] as const;
export type Recipient = (typeof RECIPIENTS)[number];

// ───────────────────────── learner requests ─────────────────────────
const text = (max: number) => z.string().trim().min(1).max(max);

export const startSessionRequest = z.object({ checkpointId: z.string().uuid() });
export const sessionActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), answer: text(1000).optional(), optionIndex: z.number().int().min(0).max(5).optional(),
    version: z.number().int().min(0) }),
  z.object({ action: z.literal("rebut"), text: text(1000), version: z.number().int().min(0) }),
  z.object({ action: z.literal("skip"), version: z.number().int().min(0) }),
]);
export const chatRequest = z.object({
  message: text(800),
  recipient: z.enum(RECIPIENTS).default("all"),
  currentTime: z.number().min(0).max(24 * 60 * 60).optional(),
  history: z.array(z.object({ agent: z.string().max(20), text: z.string().max(1200) })).max(12).default([]),
});

// ───────────────────────── checkpoint debate state machine ─────────────────────────
export const INITIAL_DEBATE: DebateState = { phase: "question", hintLevel: 0, verdict: null, trapMode: null, rebuttals: 0 };

/** Bo's trap after the first answer: a correct answer gets a confident wrong shortcut or an edge case, a wrong one an ally. */
export function pickTrapMode(verdict: "correct" | "wrong", random = Math.random): NonNullable<DebateState["trapMode"]> {
  if (verdict === "wrong") return "misconception_ally";
  return random() < 0.5 ? "shortcut_fallacy" : "edge_case_skeptic";
}

/** Multiple-choice answers are graded without the model; open answers need the assessor. */
export function gradeOption(options: string[] | null, correctIndex: number | null, optionIndex: number | undefined) {
  if (!options || correctIndex === null || optionIndex === undefined) return null;
  if (optionIndex >= options.length) throw new ClassroomError("Phương án không hợp lệ.", 400);
  return optionIndex === correctIndex ? "correct" : "wrong";
}

export type RebuttalOutcome =
  | { next: "concede"; state: DebateState }
  | { next: "hint"; level: 1; state: DebateState }
  | { next: "hint_and_close"; level: 2; state: DebateState };

/**
 * A sharp rebuttal makes Bo concede and Cô Lam close; an unclear one earns hint 1 and another try, and a second
 * unclear one gets hint 2 and the closing, so the debate never loops.
 */
export function afterRebuttal(state: DebateState, sharp: boolean): RebuttalOutcome {
  if (state.phase !== "debate") throw new ClassroomError("Phần tranh luận này đã kết thúc.", 409, "closed");
  const rebuttals = state.rebuttals + 1;
  if (sharp) return { next: "concede", state: { ...state, phase: "closed", rebuttals } };
  if (state.hintLevel === 0) return { next: "hint", level: 1, state: { ...state, hintLevel: 1, rebuttals } };
  return { next: "hint_and_close", level: 2, state: { ...state, hintLevel: 2, phase: "closed", rebuttals } };
}

// ───────────────────────── classroom chat routing ─────────────────────────
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
// The specific request wins over the generic one ("giúp tớ tóm tắt" is a note, not a hint), so order matters.
const RULES: [ClassmateId, RegExp][] = [
  ["linhchi", /\b(tom tat|ghi nho|ghi chu|cong thuc|cu phap|meo|checklist|cach nho|so tay)\b/],
  ["minhkhang", /\b(vi du|thuc te|doi song|giong nhu|hinh dung|so sanh voi)\b/],
  ["an", /\b(goi y|bi qua|khong biet lam|ket|giup (minh|em|to)|huong dan|bat dau tu dau|buoc dau)\b/],
  ["tri", /\b(tai sao|vi sao|ban chat|khac nhau|khac gi|co phai|dung khong|sai khong|truong hop|neu .* thi)\b/],
  ["minhkhang", /^(hi|hello|chao|xin chao|alo|haha|hihi|met qua|chan qua|buon ngu|cam on|thanks)\b/],
];

/**
 * Who answers a chat message: the chosen classmate, or for "Cả lớp" the one whose role matches the intent
 * (hint → An, notes → Linh Chi, examples and small talk → Minh Khang, "why" → Trí), else Cô Lam. A conceptual
 * answer to the whole class gets Bo chiming in with what still confuses him.
 */
export function routeChat(message: string, recipient: Recipient): { primary: ClassmateId; chime: ClassmateId | null } {
  if (recipient !== "all") return { primary: recipient, chime: null };
  const m = fold(message.trim());
  const hit = RULES.find(([, re]) => re.test(m));
  const primary = hit ? hit[0] : "colam";
  return { primary, chime: primary === "tri" || primary === "colam" ? "bo" : null };
}

// ───────────────────────── council draft ─────────────────────────
export const COUNCIL_MAX_CHECKPOINTS = 4;
export const CHECKPOINT_MIN_GAP_SECONDS = 20;

export const checkpointDraftSchema = z.object({
  timestampSeconds: z.number().int().min(0).max(24 * 60 * 60),
  concept: text(160),
  question: text(600),
  options: z.array(text(240)).min(2).max(5).nullable(),
  correctIndex: z.number().int().min(0).max(4).nullable(),
  answerKey: text(1200),
  keyIdea: text(600),
  misconception: z.object({
    description: text(400),
    explanation: text(1000),
    hint1: text(400),
    hint2: text(400),
    boClaim: text(400),
    analogy: z.string().trim().max(400).nullable(),
  }),
}).superRefine((c, ctx) => {
  if ((c.options === null) !== (c.correctIndex === null))
    ctx.addIssue({ code: "custom", message: "Câu trắc nghiệm cần cả phương án và đáp án đúng." });
  else if (c.options && c.correctIndex! >= c.options.length)
    ctx.addIssue({ code: "custom", message: "Đáp án đúng nằm ngoài danh sách phương án." });
});
export const applyDraftRequest = z.object({
  checkpoints: z.array(checkpointDraftSchema).min(1).max(COUNCIL_MAX_CHECKPOINTS).optional(),
});

/**
 * The checkpoints a lesson can actually pause on: inside the video, in time order, at least 20 seconds apart
 * (a later one that collides is moved forward, or dropped when it would leave the video).
 */
export function normalizeCheckpoints(list: CheckpointDraft[], durationSeconds: number | null): CheckpointDraft[] {
  const end = durationSeconds && durationSeconds > 0 ? Math.floor(durationSeconds) - 1 : Number.POSITIVE_INFINITY;
  const sorted = [...list]
    .map((c) => ({ ...c, timestampSeconds: Math.max(0, Math.min(Math.round(c.timestampSeconds), end)) }))
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const out: CheckpointDraft[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    const at = prev ? Math.max(c.timestampSeconds, prev.timestampSeconds + CHECKPOINT_MIN_GAP_SECONDS) : c.timestampSeconds;
    if (at > end) continue;
    out.push({ ...c, timestampSeconds: at });
  }
  return out.slice(0, COUNCIL_MAX_CHECKPOINTS);
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ───────────────────────── opening line guard (Cô Lam) ─────────────────────────
const OTHER_AGENTS = /(?<!\p{L})(Trí|Tri|Bo|Linh Chi|Minh Khang|Trợ giảng|An)(?!\p{L})/u;
const MAX_OPENING_CHARS = 220;

/**
 * Cô Lam's checkpoint opening is the only line the learner reads while deciding: at most two sentences, never
 * addressing other characters and never containing the answer key; a plain invitation when nothing usable is left.
 */
export function shapeOpening(dialogue: string | undefined, answerKey: string) {
  const answer = answerKey.trim().toLowerCase();
  const sentences = String(dialogue || "").replace(/\s+/gu, " ").split(/(?<=[.!?])\s+/u).map((x) => x.trim()).filter(Boolean);
  const kept = sentences
    .filter((x) => !OTHER_AGENTS.test(x))
    .filter((x) => !(answer.length >= 3 && answer.length <= 60 && x.toLowerCase().includes(answer)))
    .slice(0, 2);
  let out = kept.join(" ");
  if (out.length > MAX_OPENING_CHARS) {
    const cut = out.slice(0, MAX_OPENING_CHARS);
    out = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trim()}…`;
  }
  return out || "Cả lớp dừng ở đây một chút nhé. Em hãy tự nghĩ trước rồi trả lời, cô muốn nghe lý do của em.";
}

// ───────────────────────── lesson source (transcript or reading text) ─────────────────────────
export type Cue = { start: number; end?: number; text: string };
export const COUNCIL_SOURCE_MAX_CHARS = 30_000;
const CHAT_EXCERPT_MAX_CHARS = 4_000;

/** What the council reads: the timed transcript as "[mm:ss] line", else the lesson's reading text. */
export function councilMaterial(cues: Cue[] | null, body: string | null, max = COUNCIL_SOURCE_MAX_CHARS) {
  const full = cues?.length ? cues.map((c) => `[${clock(c.start)}] ${c.text}`).join("\n") : (body ?? "").trim();
  return full.length > max ? `${full.slice(0, max)}\n[…phần sau đã được lược bớt]` : full;
}

/** What a chat reply may lean on: the transcript around the current video time, else the start of the reading. */
export function chatExcerpt(cues: Cue[] | null, body: string | null, at: number | undefined, max = CHAT_EXCERPT_MAX_CHARS) {
  if (cues?.length) {
    const t = at ?? 0;
    const near = cues.filter((c) => c.start >= t - 150 && c.start <= t + 30);
    const lines = (near.length ? near : cues.slice(0, 40)).map((c) => `[${clock(c.start)}] ${c.text}`).join("\n");
    return lines.slice(-max);
  }
  return (body ?? "").trim().slice(0, max);
}

/** Shuffles multiple-choice options (models tend to put the right one first) and moves the correct index with it. */
export function shuffleOptions(options: string[], correctIndex: number, random = Math.random) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), correctIndex: order.indexOf(correctIndex) };
}
