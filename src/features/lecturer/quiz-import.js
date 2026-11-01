/**
 * Parser for batch-importing quiz questions pasted from a text box or a spreadsheet. Port of the real app's pure
 * module (apps/web/src/lib/quiz-import.ts); messages are verbatim.
 *
 * Block format — one question per block, blocks separated by a blank line (or `;`):
 *     Thủ đô của Việt Nam?
 *     A. Huế
 *     * B. Hà Nội
 *     - Đà Nẵng
 *     Giải thích: Hà Nội là thủ đô.
 * Tab rows — one question per line, cells separated by tabs: question, option…, correct, [explanation].
 *   The correct cell is a letter (A–F) or a 1-based index. When the last cell is not a valid answer, the cell
 *   before it is read as the answer and the last cell as the explanation.
 *
 * parseQuizImport(raw, { termSeparator: 'auto'|'tab'|'line', questionSeparator: 'blank'|'semicolon', maxOptions })
 *   → [{ index, draft: { text, options[], correctIndex, explanation }, errors[] }]
 */
export const DEFAULT_MAX_QUIZ_OPTIONS = 6;

const MARKED_OPTION = /^\*\s*(?:[-•]\s*)?(?:[A-Fa-f][.)]\s*)?(.*)$/;
const PLAIN_OPTION = /^(?:[-•]\s*(?:[A-Fa-f][.)]\s*)?|[A-Fa-f][.)]\s*)(.*)$/;
const EXPLANATION = /^(?:giải thích|giai thich)\s*:\s*(.*)$/i;
const QUESTION_NUMBER = /^(?:câu|cau)\s*\d+\s*[.:)]\s*|^\d+\s*[.)]\s+/i;

/** Validates a draft against the builder's rules; an empty array means it can be added. */
export function validateQuestionDraft(draft, maxOptions = DEFAULT_MAX_QUIZ_OPTIONS) {
  const errors = [];
  if (!draft.text.trim()) errors.push('Thiếu nội dung câu hỏi.');
  const filled = draft.options.filter((o) => o.trim().length > 0);
  if (draft.options.length < 2 || filled.length < 2) errors.push('Cần ít nhất 2 phương án.');
  if (draft.options.length > maxOptions) errors.push(`Tối đa ${maxOptions} phương án mỗi câu.`);
  if (draft.options.some((o) => o.trim().length === 0)) errors.push('Có phương án còn trống.');
  const correct = draft.options[draft.correctIndex];
  if (draft.correctIndex < 0 || correct === undefined || !correct.trim()) {
    errors.push('Chưa có đáp án đúng (đánh dấu * ở đầu phương án hoặc ghi A–D trong cột đáp án).');
  }
  return errors;
}

const normalizeInput = (raw) => String(raw || '').normalize('NFC').replace(/^﻿/, '').replace(/ /g, ' ').replace(/\r\n?/g, '\n');
const stripQuestionNumber = (text) => text.replace(QUESTION_NUMBER, '').trim();

function parseBlock(lines) {
  const errors = []; const questionLines = []; const options = []; const explanationLines = [];
  let correctIndex = -1; let inExplanation = false;
  lines.forEach((rawLine, lineNo) => {
    const line = rawLine.trim();
    if (lineNo === 0) { questionLines.push(stripQuestionNumber(line)); return; }
    const explanation = line.match(EXPLANATION);
    if (explanation) { inExplanation = true; explanationLines.push(explanation[1].trim()); return; }
    if (inExplanation) { explanationLines.push(line); return; }
    const marked = line.startsWith('*');
    const option = marked ? line.match(MARKED_OPTION) : line.match(PLAIN_OPTION);
    if (option) {
      if (marked) {
        if (correctIndex >= 0) errors.push('Có nhiều hơn một đáp án được đánh dấu *.');
        else correctIndex = options.length;
      }
      options.push(option[1].trim());
      return;
    }
    if (options.length === 0) { questionLines.push(line); return; }
    errors.push(`Dòng không nhận dạng: "${line}" (phương án bắt đầu bằng "-" hoặc "A.", đáp án đúng có dấu "*").`);
  });
  return { draft: { text: questionLines.join(' ').trim(), options, correctIndex, explanation: explanationLines.join(' ').trim() }, errors };
}

function resolveAnswerCell(cell, optionCount) {
  if (!cell) return -1;
  if (/^\d+$/.test(cell)) { const p = Number(cell); return p >= 1 && p <= optionCount ? p - 1 : -1; }
  const letter = cell.replace(/[.)]$/, '');
  if (/^[A-Fa-f]$/.test(letter)) { const i = letter.toUpperCase().charCodeAt(0) - 65; return i < optionCount ? i : -1; }
  return -1;
}
function resolveRow(options, answerCell) {
  const correctIndex = resolveAnswerCell(answerCell, options.length);
  return { options, correctIndex, valid: correctIndex >= 0 && options.length >= 2 };
}

function parseTabRow(line) {
  const cells = line.split('\t').map((c) => c.trim());
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  const [questionCell = '', ...rest] = cells;
  const errors = [];
  const withoutExplanation = resolveRow(rest.slice(0, -1), rest[rest.length - 1]);
  const withExplanation = rest.length >= 4 ? resolveRow(rest.slice(0, -2), rest[rest.length - 2]) : null;
  let chosen = withoutExplanation.valid ? withoutExplanation : withExplanation;
  let explanation = '';
  if (!withoutExplanation.valid && withExplanation && withExplanation.valid) explanation = rest[rest.length - 1];
  if (!chosen) {
    const answerCell = rest[rest.length - 1] ?? '';
    if (rest.length < 3) errors.push('Dòng cần có câu hỏi, ít nhất 2 phương án và cột đáp án đúng.');
    else errors.push(`Đáp án "${answerCell}" không khớp phương án nào (dùng A–F hoặc số thứ tự).`);
    chosen = { options: rest.slice(0, -1), correctIndex: -1, valid: false };
  }
  return { draft: { text: stripQuestionNumber(questionCell), options: chosen.options, correctIndex: chosen.correctIndex, explanation }, errors };
}

/** Parses pasted text into numbered question drafts with per-question errors. */
export function parseQuizImport(raw, options = {}) {
  const termSeparator = options.termSeparator || 'auto';
  const maxOptions = options.maxOptions || DEFAULT_MAX_QUIZ_OPTIONS;
  const text = normalizeInput(raw);
  const chunks = options.questionSeparator === 'semicolon' ? text.split(';') : text.split(/\n\s*\n/);
  const items = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    const useTabRows = termSeparator === 'tab' || (termSeparator === 'auto' && lines.some((l) => l.includes('\t')));
    const parsed = useTabRows ? lines.map(parseTabRow) : [parseBlock(lines)];
    for (const { draft, errors } of parsed) {
      items.push({ index: items.length + 1, draft, errors: [...errors, ...validateQuestionDraft(draft, maxOptions)] });
    }
  }
  return items;
}
