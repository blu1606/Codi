import { z } from "zod";
import type { UIMessage } from "ai";
import type { aiChatKind } from "@codi-1/db/schema/ai-chat";
import {
  TUTOR_DOWN_REASONS,
  TUTOR_MODES,
  TUTOR_VOTES,
  tutorContext,
  tutorStarters,
  type TutorDiff,
} from "./ai-tutor-contract";

// One Tutor across the app (H3 "Tutor copilot xuyên các màn"): the same panel, full page and history for
// every screen. The chat kind decides what the Tutor can read: `lesson` = the in-lesson tutor (S11a,
// STATE-MACHINES §13), `general` = catalogue and the learner's own learning (S17).
export const AI_CHAT_KINDS = [
  "lesson",
  "general",
] as const satisfies (typeof aiChatKind.enumValues)[number][];
export type AiChatKind = (typeof AI_CHAT_KINDS)[number];

// Guests chat without history; the client sends its recent turns instead.
export const AI_CHAT_GUEST_TURNS = 12;
// Turns the model sees from a stored chat.
export const AI_CHAT_HISTORY_TURNS = 20;
export const AI_CHAT_QUESTION_MAX = 2000;
export const AI_CHAT_TITLE_MAX = 80;

/** Where the panel is open. A lesson context is checked against the learner's access on the server. */
export const aiChatContext = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("lesson"),
      courseId: z.string().min(1).max(200),
      lessonId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("general"),
      label: z.string().trim().min(1).max(120),
      href: z.string().startsWith("/").max(500).nullable(),
    })
    .strict(),
]);
export type AiChatContext = z.infer<typeof aiChatContext>;

export type AiChatMetadata = {
  createdAt?: string;
  /** Hint ladder step this answer was (1..3). */
  hint?: number;
  /** The learner pressed "Dừng" before the answer finished. */
  stopped?: boolean;
  /** Per suggested-change tool call: applied / skipped (G9, applied only on click). */
  diffs?: Record<string, TutorDiff["state"]>;
  vote?: (typeof TUTOR_VOTES)[number] | null;
  voteReason?: string | null;
};
export type AiChatMessage = UIMessage<AiChatMetadata>;

const messageId = z.string().regex(/^[\w-]{1,80}$/);
const textPart = z.object({ type: z.literal("text"), text: z.string() }).loose();
// Only the learner's own text reaches the server from the client; tool and reasoning parts are server-made.
export const aiChatUserMessage = z
  .object({
    id: messageId,
    role: z.literal("user"),
    parts: z.array(textPart).min(1).max(4),
    metadata: z.object({ hint: z.literal(true).optional() }).loose().optional(),
  })
  .loose();
const guestTurn = z
  .object({
    id: messageId,
    role: z.enum(["user", "assistant"]),
    parts: z.array(textPart.or(z.object({ type: z.string() }).loose())).max(40),
  })
  .loose();

export const aiChatRequest = z
  .object({
    id: z.uuid(),
    context: aiChatContext,
    message: aiChatUserMessage,
    // Guests only: recent turns, since nothing is stored for them.
    history: z.array(guestTurn).max(AI_CHAT_GUEST_TURNS).optional(),
    // Lesson chats: what the chips show is exactly what the model reads.
    lesson: z
      .object({
        mode: z.enum(TUTOR_MODES).default("simple"),
        context: tutorContext.default({}),
      })
      .strict()
      .optional(),
    trigger: z.string().optional(),
    messageId: z.string().optional(),
  })
  .loose();
export type AiChatRequest = z.infer<typeof aiChatRequest>;

export const aiChatPatch = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("vote"),
      messageId,
      vote: z.enum(TUTOR_VOTES).nullable(),
      reason: z.enum(TUTOR_DOWN_REASONS).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("diff"),
      messageId,
      toolCallId: z.string().min(1).max(120),
      state: z.enum(["applied", "skipped"]).nullable(),
    })
    .strict(),
]);
export type AiChatPatch = z.infer<typeof aiChatPatch>;

export const messageText = (message: Pick<UIMessage, "parts">) =>
  message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();

/** One-line title for a chat: its first question, whitespace collapsed and cut. */
export function aiChatTitle(question: string) {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > AI_CHAT_TITLE_MAX
    ? `${oneLine.slice(0, AI_CHAT_TITLE_MAX - 1)}…`
    : oneLine;
}

export type AiChatSummary = {
  id: string;
  kind: AiChatKind;
  title: string;
  contextLabel: string;
  contextHref: string | null;
  courseId: string | null;
  lessonId: string | null;
  updatedAt: string;
};

// Dates are grouped on the Bangkok calendar (UTC+7, no DST), whatever the viewer's timezone.
const TIME_ZONE = "Asia/Bangkok";
const DAY_MS = 86_400_000;
const dayKeyOf = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export type AiChatGroup = { label: string; chats: AiChatSummary[] };

/** "Hôm nay", "Hôm qua", "7 ngày qua", then one group per month ("Tháng 10, 2026"), newest first. */
export function groupAiChats(
  chats: AiChatSummary[],
  now: Date = new Date(),
): AiChatGroup[] {
  const today = dayKeyOf(now);
  const yesterday = dayKeyOf(new Date(now.getTime() - DAY_MS));
  const weekAgo = dayKeyOf(new Date(now.getTime() - 7 * DAY_MS));
  const groups: AiChatGroup[] = [];
  const byLabel = new Map<string, AiChatGroup>();
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const chat of sorted) {
    const day = dayKeyOf(new Date(chat.updatedAt));
    let label: string;
    if (day === today) label = "Hôm nay";
    else if (day === yesterday) label = "Hôm qua";
    else if (day > weekAgo) label = "7 ngày qua";
    else {
      const [year, month] = day.split("-");
      label = `Tháng ${Number(month)}, ${year}`;
    }
    let group = byLabel.get(label);
    if (!group) {
      group = { label, chats: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.chats.push(chat);
  }
  return groups;
}

/** Search in the history list: title or context, case and accent insensitive. */
export function matchesAiChat(chat: AiChatSummary, query: string) {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  const q = fold(query.trim());
  return !q || fold(`${chat.title} ${chat.contextLabel}`).includes(q);
}

/** Starter questions for an empty chat, by where the panel is open. */
export function aiChatStarters(input: {
  kind: AiChatKind;
  isCode?: boolean;
  signedIn: boolean;
}) {
  if (input.kind === "lesson") return tutorStarters(!!input.isCode);
  return input.signedIn
    ? [
        "Hôm nay mình nên học gì trước?",
        "Mình đang học tới đâu rồi?",
        "Gợi ý khoá học tiếp theo cho mình",
      ]
    : [
        "Mình mới bắt đầu, nên học khoá nào?",
        "So sánh các khoá lập trình web",
        "Học lập trình mỗi tuần bao nhiêu giờ là đủ?",
      ];
}

// Tool names the UI shows as steps ("Đã tìm trong tài liệu của học phần"), present and past tense.
export const AI_CHAT_TOOL_LABELS: Record<string, { running: string; done: string }> = {
  search_course_material: {
    running: "Đang tìm trong tài liệu của học phần…",
    done: "Đã tìm trong tài liệu của học phần",
  },
  get_my_progress: {
    running: "Đang xem tiến độ của bạn…",
    done: "Đã xem tiến độ của bạn",
  },
  suggest_code_change: {
    running: "Đang soạn đề xuất nhỏ cho code…",
    done: "Đã soạn đề xuất cho code",
  },
  search_courses: {
    running: "Đang tìm trong danh mục khoá học…",
    done: "Đã tìm trong danh mục khoá học",
  },
  compare_courses: {
    running: "Đang so sánh các khoá…",
    done: "Đã so sánh các khoá",
  },
  get_my_learning: {
    running: "Đang xem việc học của bạn…",
    done: "Đã xem việc học của bạn",
  },
};

// Tool outputs the UI renders as rich blocks (course cards, comparison table, diff).
export type MaterialHit = {
  title: string;
  chapter: string | null;
  href: string;
  excerpt: string;
};
export type CourseCardOutput = {
  id: string;
  slug: string;
  title: string;
  level: string;
  lessonCount: number;
  price: number;
  rating: number | null;
  learners: number;
  owned: boolean;
};
export type CompareOutput = { headers: string[]; rows: string[][] };
export type SuggestChangeOutput =
  | { ok: true; diff: TutorDiff }
  | { ok: false; reason: string };

/** Internal links an answer may cite as chips; anything else renders as plain text. */
export function isCitationHref(href: string | undefined): href is string {
  return !!href && /^\/(learn|courses)\//.test(href);
}
