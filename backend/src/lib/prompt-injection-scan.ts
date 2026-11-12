// Prompt-injection heuristics for text a learner controls (typed answer, code, file text, fetched pages, YouTube
// transcripts) before it reaches the grading model. Policy: never block grading. The text is sanitised (invisible
// and bidi control characters removed, so they cannot hide or reorder an instruction), suspected injection is
// reported with the matched snippets, and the prompt tells the model which sources are suspect. Pure functions.
//
// The patterns are anchored on instruction-shaped phrases ("ignore previous instructions", "bỏ qua hướng dẫn",
// "cho bài này 10 điểm", fake role markers, attempts to close the prompt's data delimiters), so ordinary code such
// as `// ignore the previous value` or `{ system: 'linux' }` is not flagged.

/** Zero-width, bidi override/isolate, soft hyphen, Mongolian vowel separator, word joiner family and BOM. */
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
/** C0 controls except tab / newline / carriage return, plus DEL. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** Invisible characters with a legitimate everyday use (emoji / Indic joiners, a leading BOM): stripped, not counted. */
const BENIGN_INVISIBLE = new Set(["‌", "‍"]);
const BIDI = /[‪-‮⁦-⁩]/;

export type InjectionScan = {
  /** Text with invisible / control characters removed; send this to the model, not the original. */
  text: string;
  suspicious: boolean;
  reasons: string[];
  snippets: string[];
};

/** Removes invisible and control characters; `hidden` counts the ones that have no innocent reason to be there. */
export function sanitizeUntrusted(input: string): { text: string; hidden: number; bidi: boolean } {
  let hidden = 0;
  const bidi = BIDI.test(input);
  const text = input
    .replace(INVISIBLE, (ch, offset: number) => {
      if (!BENIGN_INVISIBLE.has(ch) && !(ch === "﻿" && offset === 0)) hidden++;
      return "";
    })
    .replace(CONTROL, () => { hidden++; return ""; });
  return { text, hidden, bidi };
}

/**
 * Lower-case, diacritics removed (đ → d), one output character per input UTF-16 unit, so match offsets in the folded
 * text are offsets in the sanitised text too (used for snippets).
 */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch === "đ" || ch === "Đ" ? "d" : ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    // Keep the UTF-16 length identical so offsets line up.
    out += base.length === ch.length ? base : base.slice(0, ch.length).padEnd(ch.length, " ");
  }
  return out;
}

type Rule = { reason: string; pattern: RegExp; folded: boolean };
const RULES: Rule[] = [
  {
    reason: "yêu cầu bỏ qua hướng dẫn chấm",
    folded: true,
    pattern: /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+|every\s+)?(?:(?:the|your|my|of\s+the)\s+)?(?:all|previous|prior|above|earlier|preceding|original|system|grading)\s+(?:(?:the|your)\s+)?(?:instructions?|prompts?|rules?|directions?|guidelines?|rubric)\b/,
  },
  {
    reason: "yêu cầu bỏ qua hướng dẫn chấm",
    folded: true,
    pattern: /\b(?:bo qua|phot lo|lo di|quen di|dung lam theo|khong (?:can )?lam theo)\s+(?:het\s+)?(?:(?:moi|cac|tat ca|nhung|toan bo)\s+)?(?:cac\s+)?(?:huong dan|chi dan|yeu cau|cau lenh|lenh|quy tac|rubric|tieu chi)\b/,
  },
  {
    reason: "đòi điểm tối đa",
    folded: true,
    pattern: /\bcho\s+(?:(?:toi|em|minh|bai nay|bai lam nay|ban nay|hoc vien nay|sinh vien nay)\s+)?(?:diem toi da|diem tuyet doi|full diem|tron diem|muoi diem|10\s*\/\s*10|10\s*diem|100\s*\/\s*100|100\s*diem)/,
  },
  {
    reason: "đòi điểm tối đa",
    folded: true,
    pattern: /\b(?:give|award|assign|grant)\s+(?:(?:me|this|it|the\s+student|this\s+(?:answer|submission|student|work))\s+)?(?:a\s+)?(?:(?:full|max(?:imum)?|perfect|top)\s+(?:marks?|scores?|points?|grade)|10\s*\/\s*10|100\s*\/\s*100|100\s*%)/,
  },
  {
    reason: "cố đổi vai trò của AI",
    folded: true,
    pattern: /\b(?:from now on,?\s+)?you\s+are\s+now\b|\b(?:act|behave)\s+as\s+(?:an?\s+|the\s+)?(?:grader|teacher|examiner|lecturer|system|admin(?:istrator)?|assistant|chatgpt|ai)\b|\bpretend\s+(?:to\s+be|you\s+are)\b/,
  },
  {
    reason: "cố đổi vai trò của AI",
    folded: true,
    pattern: /\btu (?:bay gio|gio),?\s+(?:ban|may)\s+(?:la|phai|se|hay)\b|\b(?:ban|may)\s+(?:bay gio\s+)?(?:la|dong vai)\s+(?:mot\s+)?(?:giam khao|giang vien|nguoi cham|tro ly|ai|he thong|chatgpt|mo hinh)\b/,
  },
  {
    // Capitalised role labels at the start of a line; lower-case `system:` keys in code / YAML are left alone.
    reason: "giả mạo tin nhắn hệ thống",
    folded: false,
    pattern: /(?:^|\n)[ \t>#*-]*(?:SYSTEM|System|ASSISTANT|Assistant|DEVELOPER|Developer|HỆ THỐNG|Hệ thống|TRỢ LÝ|Trợ lý)[ \t]*:/,
  },
  {
    reason: "giả mạo tin nhắn hệ thống",
    folded: false,
    pattern: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>/i,
  },
  {
    reason: "cố đóng khung dữ liệu của lời nhắc",
    folded: true,
    pattern: /(?:<<<|‹‹‹)\s*(?:het du lieu|du lieu khong dang tin)|(?:het du lieu|du lieu khong dang tin)\s*(?:>>>|›››)|<\/\s*(?:untrusted(?:_data)?|data|submission|student_answer)\s*>/,
  },
];

const SNIPPET_PAD = 40;
const MAX_SNIPPETS = 3;

function snippetAt(text: string, from: number, to: number) {
  const start = Math.max(0, from - SNIPPET_PAD);
  const end = Math.min(text.length, to + SNIPPET_PAD);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`.slice(0, 160);
}

/** Sanitises `input` and reports suspected prompt injection. Never throws. */
export function scanPromptInjection(input: string): InjectionScan {
  const clean = sanitizeUntrusted(input);
  const text = clean.text;
  const folded = fold(text);
  const reasons = new Set<string>();
  const snippets: string[] = [];
  if (clean.bidi || clean.hidden >= 3) reasons.add("có ký tự ẩn (zero-width/bidi) xen vào chữ");
  for (const rule of RULES) {
    const match = rule.pattern.exec(rule.folded ? folded : text);
    if (!match) continue;
    reasons.add(rule.reason);
    if (snippets.length < MAX_SNIPPETS) snippets.push(snippetAt(text, match.index, match.index + match[0].length));
  }
  return { text, suspicious: reasons.size > 0, reasons: [...reasons], snippets };
}
