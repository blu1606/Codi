/**
 * Pure, deterministic AI grading draft (no store, no React), shared by the grading job runner and the legacy
 * Codi.lecturerAI.getAiGradingDraft. The same submission + rubric always gives the same result.
 *
 * gradingResult(submission, assignment?) → {
 *   total, max,                 sum over the criteria the AI could assess (max likewise)
 *   assessed, criteria,         coverage: how many criteria got a score, out of how many
 *   scores: { [criterionId]: { score, max, rationale, evidence } }   ('overall' when the assignment has no rubric)
 *   feedback, confidence (0..1), flags: [{ code, label }]
 * }
 * Scores are 0..max rounded to 0.5, or null when the criterion could not be assessed (missing is not zero; the
 * rationale says why). total is rounded to 0.1. evidence is a short quote from the submission or null.
 */

const half = (n) => Math.round(n * 2) / 2;
const clamp = (n, max) => Math.min(max, Math.max(0, n));
const trimEnd = (t) => String(t || '').trim().replace(/[.\s]+$/, '');
// lower-case the first letter for mid-sentence use, but keep acronyms such as README or API intact
const lower = (t) => trimEnd(t).replace(/^(\p{Lu})(?=\p{Ll}|\s|$)/u, (c) => c.toLowerCase());
const quote = (t, n = 140) => { const s = String(t || '').trim().replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

const SHORT_NOTE = 20;
const UNFINISHED_RE = /chưa\s+(làm|xong|hoàn thành|hoàn thiện|kịp)/i;
// criteria about the write-up need a note or an attached file; a bare link is not enough to judge them
const WRITEUP_RE = /readme|ghi chú|trình bày|giải thích/i;
const NOTHING = 'Không có liên kết, tệp hay ghi chú để đánh giá tiêu chí này.';
const NO_WRITEUP = 'Chỉ có liên kết, không có ghi chú hay tệp mô tả cách làm nên chưa đánh giá được.';

/** Evidence pieces the simulated reader can quote, in a stable order. */
export function evidenceOf(sub) {
  const out = [];
  const note = String(sub.note || '').trim();
  if (note) out.push(`Ghi chú: “${quote(note)}”`);
  if (sub.link) out.push(`Liên kết: ${quote(sub.link, 90)}`);
  if (sub.fileName) out.push(`Tệp: ${quote(sub.fileName, 90)}`);
  return out;
}

export function gradingFlags(sub, a) {
  const flags = [];
  const note = String(sub.note || '').trim();
  if (!sub.fileName && note.length < SHORT_NOTE) flags.push({ code: 'short', label: 'Bài nộp quá ngắn' });
  if (a && a.requiresFile && !sub.fileName) flags.push({ code: 'missing-file', label: 'Thiếu file' });
  if (a && a.requiresLink && !sub.link) flags.push({ code: 'missing-link', label: 'Thiếu liên kết' });
  if (UNFINISHED_RE.test(note)) flags.push({ code: 'unfinished', label: 'Học viên ghi chú còn phần chưa làm' });
  return flags;
}

function rationaleFor(ratio, criterion) {
  const what = criterion && criterion.desc ? lower(criterion.desc) : 'yêu cầu của bài';
  if (ratio >= 0.8) return `Bài nộp thể hiện tốt tiêu chí này: ${what}.`;
  if (ratio >= 0.6) return `Đáp ứng phần lớn, nhưng chưa thấy rõ: ${what}.`;
  return `Còn thiếu bằng chứng cho: ${what}.`;
}

export function gradingResult(sub, a) {
  if (!sub) throw new Error('submission required');
  const rubric = (a && Array.isArray(a.rubric) && a.rubric.filter((k) => k && k.id)) || [];
  const note = String(sub.note || '').trim();
  const evidenceCount = (sub.link ? 1 : 0) + (sub.fileName ? 1 : 0) + (note.length > SHORT_NOTE ? 1 : 0);
  const base = evidenceCount >= 2 ? 0.85 : evidenceCount === 1 ? 0.7 : 0.5;
  const flags = gradingFlags(sub, a);
  const unfinished = flags.some((f) => f.code === 'unfinished');
  const pieces = evidenceOf(sub);
  const scores = {};

  if (rubric.length) {
    rubric.forEach((k, i) => {
      const pts = Number(k.points) || 0;
      const blocked = !pieces.length ? NOTHING : (!note && !sub.fileName && WRITEUP_RE.test(`${k.name || ''} ${k.desc || ''}`)) ? NO_WRITEUP : null;
      if (blocked) { scores[k.id] = { score: null, max: pts, rationale: blocked, evidence: null }; return; }
      // the first criterion (usually "does it work") loses more when the learner says part is unfinished
      const adj = [0, 0.1, 0.05, 0.15][i % 4] + (unfinished && i === 0 ? 0.15 : 0);
      const score = clamp(half(pts * (base - adj)), pts);
      scores[k.id] = { score, max: pts, rationale: rationaleFor(pts ? score / pts : 0, k), evidence: pieces[i % pieces.length] };
    });
  } else {
    const max = Number(sub.maxScore) || 10;
    if (!pieces.length) scores.overall = { score: null, max, rationale: NOTHING, evidence: null };
    else {
      const score = clamp(half(max * (base - (unfinished ? 0.15 : 0))), max);
      scores.overall = { score, max, rationale: rationaleFor(score / max, null), evidence: pieces[0] };
    }
  }

  const ids = Object.keys(scores);
  const done = ids.filter((id) => scores[id].score != null);
  const max = done.reduce((t, id) => t + scores[id].max, 0);
  const total = Math.round(done.reduce((t, id) => t + scores[id].score, 0) * 10) / 10;
  const weakest = rubric.filter((k) => scores[k.id].score != null)
    .sort((x, y) => scores[x.id].score / (scores[x.id].max || 1) - scores[y.id].score / (scores[y.id].max || 1))[0];
  const evidenceNote = evidenceCount ? '' : ' Bài nộp chưa có liên kết, tệp hay ghi chú mô tả, nên mình chưa kiểm tra được hết yêu cầu.';
  const improve = weakest ? `${String(weakest.name || '').toLowerCase()} — ${lower(weakest.desc) || 'xem lại yêu cầu của tiêu chí'}` : 'trình bày bài nộp';
  const feedback = `Bài làm đáp ứng phần lớn yêu cầu${note ? ', ghi chú của bạn giúp mình hiểu cách làm' : ''}.${evidenceNote} Điểm cần cải thiện nhất: ${improve}. Gợi ý: kiểm tra lại các trường hợp biên trước khi nộp lần sau.`;
  const gaps = ids.length - done.length;
  const confidence = Math.max(0.3, Math.round((base - flags.length * 0.08 - gaps * 0.05) * 100) / 100);
  return { total, max, assessed: done.length, criteria: ids.length, scores, feedback, confidence, flags };
}

export const confidenceLabel = (c) => (c >= 0.75 ? 'Cao' : c >= 0.55 ? 'Trung bình' : 'Thấp');
