/**
 * The Tutor's client contract, ported from Codi develop's lib/ai-chat-contract.ts, lib/ai-tutor-contract.ts and
 * lib/learner-intake-contract.ts: limits, copy that several views share, and the pure helpers (history grouping and
 * search, starters, hint ladder, context clipping, line references, the ≤3-line suggestion).
 */

// Guests chat without stored history: the client sends its recent turns instead.
export const GUEST_TURNS = 12;
export const QUESTION_MAX = 2000;

export const HINT_MAX = 3;
export const HINT_NAMES = ['Hướng nghĩ', 'Chỗ cần xem lại', 'Khung cách làm'];
export const DOWN_REASONS = ['Chưa đúng', 'Khó hiểu', 'Lộ lời giải', 'Không liên quan bài'];
export const MODES = ['simple', 'step', 'review'];
export const MODE_LABELS = { simple: 'Giải thích đơn giản', step: 'Gợi ý từng bước', review: 'Ôn lại khái niệm' };
export const ESCALATE_MIN = 10;
// Context the learner sees as chips is exactly what the model reads; longer values are cut ("đã rút gọn").
export const CONTEXT_LIMITS = { task: 3000, selection: 1200, code: 12000, error: 1000, test: 600 };

export const RATE_LIMITED = 'Bạn đã hỏi quá nhiều trong thời gian ngắn';
export const UNAVAILABLE = 'Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.';
export const STOPPED_TEXT = 'Bạn đã dừng câu trả lời này.';
export const KEEP_HISTORY =
  'Tutor lưu lịch sử để bạn xem lại; bạn xoá từng đoạn chat bất kỳ lúc nào. Chỉ bạn thấy lịch sử; giảng viên chỉ thấy câu hỏi bạn chủ động gửi qua “Hỏi giảng viên”.';

/** A message's text parts joined (UIMessage). */
export const messageText = (m) => ((m && m.parts) || []).map((p) => (p.type === 'text' ? p.text : '')).join('').trim();

/** Cuts a value to at most `max` characters (ellipsis included). */
export const clip = (value, max) => {
  const s = String(value == null ? '' : value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
export const short = (value) => (value.length > 60 ? `${value.slice(0, 57)}…` : value);

/** "dòng 14" mentions in an answer that point at real lines of the learner's code (max 5). */
export function lineRefs(answer, lineCount) {
  const refs = new Set();
  for (const match of String(answer).matchAll(/dòng\s+(\d{1,4})/gi)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= lineCount) refs.add(n);
    if (refs.size === 5) break;
  }
  return [...refs];
}

/** Inserts the suggestion before line `at`; the caller keeps the original for "Hoàn tác". */
export function applyDiff(code, diff) {
  const lines = String(code).split('\n');
  lines.splice(Math.min(diff.at - 1, lines.length), 0, ...diff.add);
  return lines.join('\n');
}

/** Internal links an answer may cite as chips; anything else renders as an external link. */
export const isCitationHref = (href) => !!href && /^\/(learn|courses)\//.test(href);

export const formatVnd = (n) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0))}đ`;

// ───────────────────────── history ─────────────────────────
// Dates are grouped on the Bangkok calendar (UTC+7, no DST), whatever the viewer's timezone.
const DAY_MS = 86_400_000;
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKeyOf = (date) => DAY_KEY.format(date);

/** "Hôm nay", "Hôm qua", "7 ngày qua", then one group per month ("Tháng 10, 2026"), newest first. */
export function groupChats(chats, now = new Date()) {
  const today = dayKeyOf(now);
  const yesterday = dayKeyOf(new Date(now.getTime() - DAY_MS));
  const weekAgo = dayKeyOf(new Date(now.getTime() - 7 * DAY_MS));
  const groups = [];
  const byLabel = new Map();
  for (const chat of [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const day = dayKeyOf(new Date(chat.updatedAt));
    let label;
    if (day === today) label = 'Hôm nay';
    else if (day === yesterday) label = 'Hôm qua';
    else if (day > weekAgo) label = '7 ngày qua';
    else {
      const [year, month] = day.split('-');
      label = `Tháng ${Number(month)}, ${year}`;
    }
    let group = byLabel.get(label);
    if (!group) { group = { label, chats: [] }; byLabel.set(label, group); groups.push(group); }
    group.chats.push(chat);
  }
  return groups;
}

const fold = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
/** Search in the history list: title or context, case and accent insensitive. */
export function matchesChat(chat, query) {
  const q = fold(String(query || '').trim());
  return !q || fold(`${chat.title} ${chat.contextLabel}`).includes(q);
}

// ───────────────────────── starters and tool labels ─────────────────────────
export function starters({ kind, isCode, signedIn }) {
  if (kind === 'lesson') {
    return isCode
      ? ['Vì sao code của mình chưa chạy đúng?', 'Giải thích lại yêu cầu của bài', 'Lỗi hay gặp ở bài này là gì?']
      : ['Tóm tắt ý chính của bài', 'Cho mình một ví dụ khác', 'Lỗi hay gặp ở bài này là gì?'];
  }
  return signedIn
    ? ['Hôm nay mình nên học gì trước?', 'Mình đang học tới đâu rồi?', 'Gợi ý khoá học tiếp theo cho mình']
    : ['Mình mới bắt đầu, nên học khoá nào?', 'So sánh các khoá lập trình web', 'Học lập trình mỗi tuần bao nhiêu giờ là đủ?'];
}

// Tool names the UI shows as steps, present and past tense.
export const TOOL_LABELS = {
  search_course_material: { running: 'Đang tìm trong tài liệu của học phần…', done: 'Đã tìm trong tài liệu của học phần' },
  get_my_progress: { running: 'Đang xem tiến độ của bạn…', done: 'Đã xem tiến độ của bạn' },
  suggest_code_change: { running: 'Đang soạn đề xuất nhỏ cho code…', done: 'Đã soạn đề xuất cho code' },
  search_courses: { running: 'Đang tìm trong danh mục khoá học…', done: 'Đã tìm trong danh mục khoá học' },
  compare_courses: { running: 'Đang so sánh các khoá…', done: 'Đã so sánh các khoá' },
  get_my_learning: { running: 'Đang xem việc học của bạn…', done: 'Đã xem việc học của bạn' },
};

// ───────────────────────── S17 intake ─────────────────────────
// Goal, level and weekly hours are asked only when unknown; the answers are the onboarding goal draft.
export const INTAKE_FIELDS = ['goal', 'level', 'hours'];
export const INTAKE_QUESTIONS = {
  goal: {
    text: 'Mục tiêu của bạn là gì?',
    options: [{ value: 'project', label: 'Làm được dự án' }, { value: 'finish', label: 'Hoàn thành khoá học' }, { value: 'interview', label: 'Chuẩn bị phỏng vấn' }],
  },
  level: {
    text: 'Trình độ hiện tại của bạn?',
    options: [{ value: 'new', label: 'Mới bắt đầu' }, { value: 'basic', label: 'Có kinh nghiệm cơ bản' }, { value: 'solid', label: 'Trung cấp' }],
  },
  hours: {
    text: 'Bạn có thể dành bao nhiêu giờ/tuần để học?',
    options: [{ value: 2, label: '< 5 giờ' }, { value: 5, label: '5-10 giờ' }, { value: 10, label: '> 10 giờ' }],
  },
};
const optionLabel = (field, value) => (INTAKE_QUESTIONS[field].options.find((o) => o.value === value) || {}).label || String(value);
/** The known answers with their labels. */
export function intakeLabels(draft) {
  const out = [];
  if (draft.goal) out.push({ field: 'goal', label: optionLabel('goal', draft.goal) });
  if (draft.level) out.push({ field: 'level', label: optionLabel('level', draft.level) });
  if (draft.hours) out.push({ field: 'hours', label: `${optionLabel('hours', draft.hours)}/tuần` });
  return out;
}
/** Fields still unknown and not skipped in this conversation, in the order the Tutor asks them. */
export const missingIntake = (draft, skipped) => INTAKE_FIELDS.filter((f) => !draft[f] && !skipped.includes(f));

// ───────────────────────── where the Tutor is open ─────────────────────────
// Screens without their own description: the context still says where the learner was.
const PATH_LABELS = [
  [/^\/$/, 'Trang chủ'],
  [/^\/courses\/[^/]+/, 'Trang khoá học'],
  [/^\/courses/, 'Danh mục khoá học'],
  [/^\/dashboard/, 'Học tập của tôi'],
  [/^\/learn\/[^/]+/, 'Lộ trình khoá học'],
  [/^\/progress/, 'Tiến độ học tập'],
  [/^\/insights/, 'Phân tích học tập'],
  [/^\/cart/, 'Giỏ hàng'],
  [/^\/checkout/, 'Thanh toán'],
  [/^\/profile/, 'Hồ sơ'],
  [/^\/settings/, 'Cài đặt'],
];
export const pathLabel = (pathname) => (PATH_LABELS.find(([re]) => re.test(pathname)) || [null, 'Codi'])[1];
export const pathPage = (pathname) => ({ kind: 'general', label: pathLabel(pathname), href: pathname });
