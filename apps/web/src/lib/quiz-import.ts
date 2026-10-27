/**
 * Parser for batch-importing quiz questions pasted from a text box or a
 * spreadsheet (Quizlet-style). Pure: no React, no server imports.
 *
 * Two layouts are understood:
 *
 * 1. Block format — one question per block, separated by a blank line (or `;`):
 *      Thủ đô của Việt Nam?
 *      A. Huế
 *      * B. Hà Nội
 *      - Đà Nẵng
 *      Giải thích: Hà Nội là thủ đô.
 *
 * 2. Tab rows — one question per line, cells separated by tabs (copied from
 *    Excel / Sheets): question, option…, correct, [explanation]
 *      Thủ đô của Việt Nam?<TAB>Huế<TAB>Hà Nội<TAB>B<TAB>Hà Nội là thủ đô.
 *    The correct cell is a letter (A–F) or a 1-based index. When the last cell
 *    is not a valid answer, the cell before it is read as the answer and the
 *    last cell as the explanation.
 */

export const DEFAULT_MAX_QUIZ_OPTIONS = 6;

export type ImportTermSeparator = "auto" | "tab" | "line";
export type ImportQuestionSeparator = "blank" | "semicolon";

export interface ParseQuizImportOptions {
  /** Auto-detect (default), force tab rows, or force block format. */
  termSeparator?: ImportTermSeparator;
  /** Blank line (default) or `;` between questions. */
  questionSeparator?: ImportQuestionSeparator;
  maxOptions?: number;
}

export interface QuizImportDraft {
  text: string;
  options: string[];
  /** Index into `options`, or -1 when no valid answer was found. */
  correctIndex: number;
  explanation: string;
}

export interface ParsedQuizImportItem {
  /** 1-based position in the pasted text. */
  index: number;
  draft: QuizImportDraft;
  errors: string[];
}

// Option prefixes: "-", "A." / "A)", or both ("- A. text"). A "*" right before
// the prefix marks the correct option.
const MARKED_OPTION = /^\*\s*(?:[-•]\s*)?(?:[A-Fa-f][.)]\s*)?(.*)$/;
const PLAIN_OPTION = /^(?:[-•]\s*(?:[A-Fa-f][.)]\s*)?|[A-Fa-f][.)]\s*)(.*)$/;
const EXPLANATION = /^(?:giải thích|giai thich)\s*:\s*(.*)$/i;
const QUESTION_NUMBER = /^(?:câu|cau)\s*\d+\s*[.:)]\s*|^\d+\s*[.)]\s+/i;

/**
 * Validates a question draft against the builder's rules. Returns Vietnamese
 * messages; an empty array means the draft can be added to the editor.
 */
export function validateQuestionDraft(
  draft: Pick<QuizImportDraft, "text" | "options" | "correctIndex">,
  maxOptions: number = DEFAULT_MAX_QUIZ_OPTIONS,
): string[] {
  const errors: string[] = [];
  if (!draft.text.trim()) errors.push("Thiếu nội dung câu hỏi.");

  const filled = draft.options.filter((option) => option.trim().length > 0);
  if (draft.options.length < 2 || filled.length < 2) {
    errors.push("Cần ít nhất 2 phương án.");
  }
  if (draft.options.length > maxOptions) {
    errors.push(`Tối đa ${maxOptions} phương án mỗi câu.`);
  }
  if (draft.options.some((option) => option.trim().length === 0)) {
    errors.push("Có phương án còn trống.");
  }

  const correct = draft.options[draft.correctIndex];
  if (draft.correctIndex < 0 || correct === undefined || !correct.trim()) {
    errors.push("Chưa có đáp án đúng (đánh dấu * ở đầu phương án hoặc ghi A–D trong cột đáp án).");
  }
  return errors;
}

/** Parses pasted text into numbered question drafts with per-question errors. */
export function parseQuizImport(
  raw: string,
  options: ParseQuizImportOptions = {},
): ParsedQuizImportItem[] {
  const termSeparator = options.termSeparator ?? "auto";
  const maxOptions = options.maxOptions ?? DEFAULT_MAX_QUIZ_OPTIONS;
  const text = normalizeInput(raw);
  const chunks =
    options.questionSeparator === "semicolon" ? text.split(";") : text.split(/\n\s*\n/);

  const items: ParsedQuizImportItem[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const useTabRows =
      termSeparator === "tab" ||
      (termSeparator === "auto" && lines.some((line) => line.includes("\t")));

    const parsed = useTabRows
      ? lines.map(parseTabRow)
      : [parseBlock(lines)];

    for (const { draft, errors } of parsed) {
      items.push({
        index: items.length + 1,
        draft,
        errors: [...errors, ...validateQuestionDraft(draft, maxOptions)],
      });
    }
  }
  return items;
}

function normalizeInput(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/^﻿/, "")
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n");
}

function stripQuestionNumber(text: string): string {
  return text.replace(QUESTION_NUMBER, "").trim();
}

function parseBlock(lines: string[]): { draft: QuizImportDraft; errors: string[] } {
  const errors: string[] = [];
  const questionLines: string[] = [];
  const options: string[] = [];
  const explanationLines: string[] = [];
  let correctIndex = -1;
  let inExplanation = false;

  lines.forEach((rawLine, lineNo) => {
    const line = rawLine.trim();
    if (lineNo === 0) {
      questionLines.push(stripQuestionNumber(line));
      return;
    }

    const explanation = line.match(EXPLANATION);
    if (explanation) {
      inExplanation = true;
      explanationLines.push(explanation[1]!.trim());
      return;
    }
    if (inExplanation) {
      explanationLines.push(line);
      return;
    }

    const marked = line.startsWith("*");
    const option = marked ? line.match(MARKED_OPTION) : line.match(PLAIN_OPTION);
    if (option) {
      if (marked) {
        if (correctIndex >= 0) errors.push("Có nhiều hơn một đáp án được đánh dấu *.");
        else correctIndex = options.length;
      }
      options.push(option[1]!.trim());
      return;
    }

    if (options.length === 0) {
      questionLines.push(line);
      return;
    }
    errors.push(
      `Dòng không nhận dạng: "${line}" (phương án bắt đầu bằng "-" hoặc "A.", đáp án đúng có dấu "*").`,
    );
  });

  return {
    draft: {
      text: questionLines.join(" ").trim(),
      options,
      correctIndex,
      explanation: explanationLines.join(" ").trim(),
    },
    errors,
  };
}

function parseTabRow(line: string): { draft: QuizImportDraft; errors: string[] } {
  const cells = line.split("\t").map((cell) => cell.trim());
  while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();

  const [questionCell = "", ...rest] = cells;
  const questionText = stripQuestionNumber(questionCell);
  const errors: string[] = [];

  // Without an explanation: the last cell is the answer.
  const withoutExplanation = resolveRow(rest.slice(0, -1), rest[rest.length - 1]);
  // With an explanation: the second-to-last cell is the answer.
  const withExplanation =
    rest.length >= 4 ? resolveRow(rest.slice(0, -2), rest[rest.length - 2]) : null;

  let chosen: ReturnType<typeof resolveRow> | null = withoutExplanation.valid
    ? withoutExplanation
    : withExplanation;
  let explanation = "";
  if (!withoutExplanation.valid && withExplanation?.valid) {
    explanation = rest[rest.length - 1]!;
  }

  if (!chosen) {
    const answerCell = rest[rest.length - 1] ?? "";
    if (rest.length < 3) {
      errors.push("Dòng cần có câu hỏi, ít nhất 2 phương án và cột đáp án đúng.");
    } else {
      errors.push(`Đáp án "${answerCell}" không khớp phương án nào (dùng A–F hoặc số thứ tự).`);
    }
    chosen = { options: rest.slice(0, -1), correctIndex: -1, valid: false };
  }

  return {
    draft: {
      text: questionText,
      options: chosen.options,
      correctIndex: chosen.correctIndex,
      explanation,
    },
    errors,
  };
}

function resolveRow(
  options: string[],
  answerCell: string | undefined,
): { options: string[]; correctIndex: number; valid: boolean } {
  const correctIndex = resolveAnswerCell(answerCell, options.length);
  return { options, correctIndex, valid: correctIndex >= 0 && options.length >= 2 };
}

function resolveAnswerCell(cell: string | undefined, optionCount: number): number {
  if (!cell) return -1;
  if (/^\d+$/.test(cell)) {
    const position = Number(cell);
    return position >= 1 && position <= optionCount ? position - 1 : -1;
  }
  const letter = cell.replace(/[.)]$/, "");
  if (/^[A-Fa-f]$/.test(letter)) {
    const index = letter.toUpperCase().charCodeAt(0) - 65;
    return index < optionCount ? index : -1;
  }
  return -1;
}
