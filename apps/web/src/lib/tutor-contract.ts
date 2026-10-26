import { z } from "zod";

/**
 * Codi AI Tutor Contract & State Machine
 * Adheres to STATE-MACHINES.md §13, §14, and Mockup (docs/mockup/js/ai-tutor.js)
 */

export const HINT_NAMES = [
  "Hướng nghĩ",
  "Chỗ cần xem lại",
  "Khung cách làm",
] as const;

export const DOWN_REASONS = [
  "Chưa đúng",
  "Khó hiểu",
  "Lộ lời giải",
  "Không liên quan bài",
] as const;

export type DownReason = (typeof DOWN_REASONS)[number];

export const tutorDiffState = z.enum(["applied", "skipped"]).nullable();
export type TutorDiffState = z.infer<typeof tutorDiffState>;

export const tutorDiff = z.object({
  at: z.number().int().positive(),
  ctx: z.string(),
  add: z.string(),
  state: tutorDiffState.default(null),
  original: z.string().nullable().default(null),
});
export type TutorDiff = z.infer<typeof tutorDiff>;

export const tutorMessageRole = z.enum(["user", "ai", "limit", "error"]);
export type TutorMessageRole = z.infer<typeof tutorMessageRole>;

export const tutorMessage = z.object({
  id: z.string(),
  role: tutorMessageRole,
  text: z.string().default(""),
  at: z.string(),
  question: z.string().optional(),
  streaming: z.boolean().optional(),
  stopped: z.boolean().optional(),
  lines: z.array(z.number().int().positive()).optional(),
  diff: tutorDiff.optional(),
  vote: z.enum(["up", "down"]).nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type TutorMessage = z.infer<typeof tutorMessage>;

export const tutorContextChip = z.object({
  id: z.string(),
  label: z.string(),
  fixed: z.boolean().optional(),
});
export type TutorContextChip = z.infer<typeof tutorContextChip>;

export const tutorContext = z.object({
  selection: z.string().optional(),
  testId: z.string().optional(),
  testName: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  runError: z.string().optional(),
  runPhase: z.string().optional(),
  code: z.string().optional(),
  lessonTitle: z.string().optional(),
  chapterTitle: z.string().optional(),
  summary: z.string().optional(),
  concepts: z.array(z.string()).optional(),
  isCodeLesson: z.boolean().optional(),
});
export type TutorContext = z.infer<typeof tutorContext>;

export const tutorCommand = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ask"),
    text: z.string().min(1).max(2000),
    context: tutorContext.optional(),
    removedChips: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("hint"),
    level: z.number().int().min(1).max(3).optional(),
    context: tutorContext.optional(),
  }),
  z.object({
    type: z.literal("vote"),
    messageId: z.string(),
    vote: z.enum(["up", "down"]).nullable(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("clear"),
  }),
]);
export type TutorCommand = z.infer<typeof tutorCommand>;

export interface TutorThreadView {
  lessonId: string;
  messages: TutorMessage[];
  hintLevel: number;
  availablePrompts: string[];
}

/**
 * Target line heuristic matching mockup ai-tutor.js:
 * First `return`, else 2nd non-empty line, else line 1.
 */
export function targetLine(code: string): {
  n: number;
  text: string;
  indent: string;
} {
  const lines = code.split("\n");
  let i = lines.findIndex((s) => /\breturn\b/.test(s));
  if (i < 0) i = lines.findIndex((s, n) => n > 0 && s.trim().length > 0);
  if (i < 0) i = 0;
  const lineText = lines[i] || "";
  const indentMatch = /^\s*/.exec(lineText);
  return {
    n: i + 1,
    text: lineText,
    indent: indentMatch ? indentMatch[0] : "",
  };
}

/**
 * Locate error line heuristic matching mockup ai-tutor.js
 */
export function errorLine(
  code: string,
  err: string,
): { n: number; text: string; name?: string; loop?: boolean } | null {
  const m =
    /ReferenceError: (\S+) is not defined/.exec(err) ||
    /TypeError: (?:\S+\.)?([\w$]+) is not a function/.exec(err) ||
    /reading '([\w$]+)'/.exec(err);
  const lines = code.split("\n");
  if (m) {
    const re = new RegExp(
      "(^|[^\\w$])" + m[1].replace(/\$/g, "\\$") + "([^\\w$]|$)",
    );
    const i = lines.findIndex((s) => re.test(s) && !/^\s*\/\//.test(s));
    if (i >= 0) return { n: i + 1, text: lines[i], name: m[1] };
  }
  if (/quá .* giây|timeout/i.test(err)) {
    const i = lines.findIndex((s) => /\b(while|for)\b/.test(s));
    if (i >= 0) return { n: i + 1, text: lines[i], loop: true };
  }
  return null;
}

const shortStr = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > 60 ? s.slice(0, 57) + "…" : String(s || "");
};

/**
 * Generate Socratic answer matching mockup ai-tutor.js:
 * Never provides full solution. Guides learner to reflect and test.
 */
export function generateSocraticAnswer(
  ctx: TutorContext,
  userText: string,
  removedChips: Set<string> = new Set(),
): { text: string; lines: number[] } {
  const parts: string[] = [];
  const lines: number[] = [];

  const sel = ctx.selection && !removedChips.has("sel") ? ctx.selection : "";
  if (sel) {
    parts.push(`Về đoạn bạn chọn: \`${shortStr(sel.split("\n")[0])}\``);
  }

  if (ctx.isCodeLesson) {
    const ft =
      !removedChips.has("test") && ctx.testName
        ? {
            name: ctx.testName,
            expected: ctx.expected ?? "",
            actual: ctx.actual ?? "",
          }
        : null;

    const runErr = !removedChips.has("err") && ctx.runError ? ctx.runError : null;
    const code = ctx.code || "";
    const el = runErr ? errorLine(code, runErr) : null;
    const tl = el || targetLine(code);

    if (ft) {
      parts.push(
        `Ở test **${ft.name}**, kết quả mong đợi là \`${shortStr(ft.expected)}\` nhưng code đang trả về \`${shortStr(ft.actual)}\`.`,
      );
    }

    if (runErr) {
      const kind =
        ctx.runPhase === "syntax"
          ? "Lỗi cú pháp — code chưa chạy được dòng nào"
          : ctx.runPhase === "timeout"
            ? "Code chạy quá lâu nên bị dừng"
            : "Code bị dừng giữa chừng vì lỗi khi chạy";
      parts.push(`**${kind}.** Thông báo: \`${shortStr(runErr)}\``);

      if (el && el.name) {
        parts.push(
          `Tên \`${el.name}\` xuất hiện lần đầu ở **dòng ${el.n}**: \`${shortStr(el.text.trim())}\`. So tên này với chỗ bạn khai báo — sai chính tả, sai hoa/thường, hoặc khai báo sau khi dùng là các nguyên nhân hay gặp.`,
        );
      } else if (el && el.loop) {
        parts.push(
          `Vòng lặp ở **dòng ${el.n}** có thể không bao giờ dừng. Kiểm tra điều kiện dừng và biến đếm có thay đổi sau mỗi vòng không.`,
        );
      } else if (ctx.runPhase === "syntax") {
        parts.push(
          "Đếm lại cặp ngoặc `(` `)` `{` `}` `[` `]`, dấu nháy và dấu phẩy giữa các phần tử — thường lỗi nằm ngay trước chỗ trình soạn báo.",
        );
      }
    }

    if (!ft && !runErr) {
      parts.push(
        "Mình chưa thấy test nào chưa đạt ở lần chạy gần nhất. Bấm **Chạy** rồi hỏi lại nếu có test sai.",
      );
    }

    if (!runErr) {
      parts.push(
        "Thử tự trả lời mấy câu này trước:\n- Với input của test, bạn tự tính tay thì ra kết quả gì?\n- Giá trị nào trong code khác với kết quả bạn tính tay?\n- Trường hợp đặc biệt (mảng rỗng, số âm) code đã xử lý chưa?",
      );
    }

    if (!removedChips.has("code") && runErr && ctx.runPhase === "syntax") {
      if (el) lines.push(el.n);
    } else if (!removedChips.has("code") && code.trim()) {
      parts.push(
        `Bắt đầu từ **dòng ${tl.n}** — đặt một \`console.log\` ngay trước đó để xem giá trị thật.`,
      );
      lines.push(tl.n);
    }

    parts.push(
      "Mình không viết sẵn lời giải. Cần thêm trợ giúp thì bấm **Gợi ý tiếp theo**.",
    );
  } else {
    const title = ctx.lessonTitle || "Bài học";
    const idea = (ctx.summary || "").split(".")[0].trim();
    if (idea) {
      parts.push(`Ý chính của bài **${title}**: ${idea}.`);
    } else {
      parts.push(
        `Bài **${title}**${ctx.chapterTitle ? ` thuộc chương “${ctx.chapterTitle}”` : ""}${ctx.concepts?.length ? `, tập trung vào ${ctx.concepts.join(", ")}` : ""}. Mình tóm tắt dựa trên tiêu đề và vị trí của bài.`,
      );
    }
    parts.push(
      "Để chắc là bạn đã nắm bài, thử:\n- Nói lại bằng lời của bạn điều bài muốn bạn làm được\n- Làm lại ví dụ trong video mà không nhìn màn hình\n- Ghi ra một chỗ bạn còn chưa chắc rồi hỏi mình cụ thể chỗ đó",
    );
  }

  return { text: parts.join("\n\n"), lines };
}

/**
 * Generate Hint ladder step matching mockup ai-tutor.js
 */
export function generateHint(
  ctx: TutorContext,
  level: number,
): { text: string; lines?: number[]; diff?: TutorDiff } {
  const code = ctx.code || "";
  const tl = targetLine(code);
  const testName = ctx.testName;

  if (level === 1) {
    return {
      text: `**Gợi ý 1/3 · ${HINT_NAMES[0]}**\n\n${testName ? `Test **${testName}** đang sai. ` : ""}Đọc lại yêu cầu và tự hỏi: hàm cần trả về kiểu dữ liệu gì, và trong trường hợp nào? Viết ra 2–3 cặp input → output trước khi sửa code.`,
    };
  }

  if (level === 2) {
    return {
      text: `**Gợi ý 2/3 · ${HINT_NAMES[1]}**\n\nGiá trị sai nhiều khả năng hình thành ở **dòng ${tl.n}**. So sánh giá trị ở đó với kết quả bạn tính tay ở gợi ý 1.`,
      lines: [tl.n],
    };
  }

  // Level 3: Proposal of ≤ 3 lines (in prototype: 1 line console.log inspection)
  const returnMatch = /\breturn\s+(.+?);?\s*$/.exec(tl.text);
  const inspectVar = returnMatch ? returnMatch[1] : "arguments";
  const addLine = `${tl.indent}console.log('Kiểm tra trước dòng ${tl.n}:', ${inspectVar});`;

  return {
    text: `**Gợi ý 3/3 · ${HINT_NAMES[2]}**\n\nThêm một dòng in giá trị ngay trước **dòng ${tl.n}**, chạy lại và đối chiếu với kết quả mong đợi. Phần sửa logic vẫn do bạn tự viết.`,
    lines: [tl.n],
    diff: {
      at: tl.n,
      ctx: tl.text,
      add: addLine,
      state: null,
      original: null,
    },
  };
}

/**
 * Apply diff to code
 */
export function applyDiff(
  code: string,
  diff: TutorDiff,
): { newCode: string; original: string } {
  const lines = code.split("\n");
  const insertIndex = Math.min(Math.max(diff.at - 1, 0), lines.length);
  lines.splice(insertIndex, 0, diff.add);
  return {
    newCode: lines.join("\n"),
    original: code,
  };
}

/**
 * Undo diff from code
 */
export function undoDiff(original: string): string {
  return original;
}
