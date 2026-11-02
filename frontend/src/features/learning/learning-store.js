/**
 * Learning loop state + course logic (port of docs/mockup/js/learner-learning.js, PRODUCT.md L4–L10, S08–S14).
 * State: Codi.state.learning[userId][courseId] (see newRecord). Grades/questions/reviews live in Codi.db().
 * Importing this module overrides Codi.courseProgress so other features show the same progress.
 */
import { Codi, syncStatus } from '../../lib/codi';

// ───────────────────────── state ─────────────────────────
export const uid = () => Codi.state.currentUserId;
const store = () => Codi.ensure('learning', () => ({}));
export const save = (render) => Codi.set(() => {}, { render: render !== false });
/** Re-render without changing persisted data (module-level view state changed). */
export const rerender = () => Codi.set(() => {});
/**
 * Sends pending changes to the server now and reports whether they were stored. Drives the real app's save-error
 * states ("Chưa lưu được tiến độ tài liệu", "Không thể lưu đáp án…") from the actual sync result.
 */
export async function persistNow() {
  try { await Codi.flush(); } catch { return false; }
  return !syncStatus.error;
}

/*
 * Record fields (Codi.state.learning[userId][courseId]):
 *  bkt          { [conceptId]: { p, n, correct } }  BKT probability, evidence count, correct count (real enrollment_skill_mastery)
 *  mastery      { [conceptId]: 0..4 }               level derived from bkt (kept so every reader shares one scale)
 *  diagMastery  { [conceptId]: 0..4 } | null        levels right after the entry test (stats C4 marker)
 *  completedAt  { [lessonId]: iso }                  completion time (stats C1 "Bài hoàn thành")
 *  evidence     { [key]: number }                    ledger so one submission is never counted twice
 *  video        { [materialId]: pct }                simulated player position
 *  videoPos     { [materialId]: seconds }            YouTube position
 *  pdf          { [materialId]: { pages:[n], pageCount, lastPage } }
 *  quiz         { [lessonId]: { status:'draft'|'graded', answers, questions?, submitted, score, passed, attempts, previousScore } }
 */
function newRecord() {
  return {
    goal: null, goalDraft: {}, goalStep: 0, goalEditing: false,
    diag: { status: 'none', index: 0, answers: {}, diagCardDismissed: false },
    pathStatus: 'none', pathSource: null, order: [], skippable: [],
    completed: [], studied: [], video: {}, videoPos: {}, pdf: {}, quiz: {}, draft: {},
    mastery: {}, bkt: {}, diagMastery: null, completedAt: {}, evidence: {},
    highlight: [], lastUpdate: null, lastActive: null,
    offer: null, adjustment: null,
  };
}

export const aiOrder = (c) => (c.aiPath && c.aiPath.length ? c.aiPath.map((p) => p.lessonId) : c.defaultOrder.slice());

// Seed the demo learner's owned course from db.learnerSeed the first time it is read.
function seedRecord(courseId, c) {
  const r = newRecord();
  const seed = Codi.db().learnerSeed;
  const s = seed && seed.userId === uid() && seed.courses && seed.courses[courseId];
  if (s && c) {
    r.goal = { goal: s.goal.goal, level: s.goal.level, hours: s.goal.hours };
    r.diag = { status: 'done', index: 0, answers: {} };
    r.pathStatus = 'ready'; r.pathSource = 'ai';
    r.order = aiOrder(c);
    r.skippable = (c.aiPath || []).filter((p) => p.skippable).map((p) => p.lessonId);
    r.completed = s.completed.slice(); r.studied = s.studied.slice();
    Object.keys(s.quizScores).forEach((lid) => {
      const l = Codi.lesson(c, lid); const pass = l && l.quiz ? l.quiz.passingScore : 70;
      r.quiz[lid] = { status: 'graded', answers: {}, submitted: true, score: s.quizScores[lid], passed: s.quizScores[lid] >= pass, attempts: 1 };
    });
    r.mastery = { ...s.mastery };
    // BKT state and timestamps come from the seed (patches/30-learning.js); without them levels stay as seeded.
    r.bkt = s.bkt ? JSON.parse(JSON.stringify(s.bkt)) : {};
    r.diagMastery = s.diagnosticMastery ? { ...s.diagnosticMastery } : null;
    r.completedAt = s.completedAt ? { ...s.completedAt } : {};
    r.lastActive = '2026-10-10T20:00:00Z';
  }
  return r;
}

// Records created before BKT/materials were ported lack the new fields; fill them without touching existing data.
function upgrade(r) {
  if (!r.bkt) r.bkt = {};
  if (!r.completedAt) r.completedAt = {};
  if (!r.evidence) r.evidence = {};
  if (!r.videoPos) r.videoPos = {};
  if (r.diagMastery === undefined) r.diagMastery = null;
  Object.keys(r.pdf || {}).forEach((k) => { if (typeof r.pdf[k] === 'number') r.pdf[k] = { pages: [], pageCount: 0, lastPage: r.pdf[k] }; });
  return r;
}

export function rec(courseId) {
  const all = store();
  if (!all[uid()]) all[uid()] = {};
  if (!all[uid()][courseId]) all[uid()][courseId] = seedRecord(courseId, Codi.course(courseId));
  return upgrade(all[uid()][courseId]);
}

// ───────────────────────── BKT mastery (real lib/onboarding-contract.ts updateBkt, D16) ─────────────────────────
// Defaults of packages/db schema/knowledge-map.ts; a concept may carry its own { bkt: { pInit, pLearn, pGuess, pSlip } }.
export const BKT_DEFAULTS = { pInit: 0.1, pLearn: 0.2, pGuess: 0.2, pSlip: 0.1 };
const bktParams = (c, conceptId) => {
  const k = ((c && c.concepts) || []).find((x) => x.id === conceptId);
  return { ...BKT_DEFAULTS, ...((k && k.bkt) || {}) };
};
export function updateBkt(prior, correct, params) {
  const p = params || BKT_DEFAULTS;
  const values = [prior, p.pInit, p.pLearn, p.pGuess, p.pSlip];
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1) || p.pGuess + p.pSlip >= 1) throw new Error('Tham số BKT của khái niệm không hợp lệ.');
  const knows = prior * (correct ? 1 - p.pSlip : p.pSlip);
  const guesses = (1 - prior) * (correct ? p.pGuess : 1 - p.pGuess);
  // A zero-likelihood observation leaves the prior unchanged before the learning step.
  const posterior = knows + guesses === 0 ? prior : knows / (knows + guesses);
  return Math.min(1, Math.max(0, posterior + (1 - posterior) * p.pLearn));
}
/** Real learner-insights masteryLevel: 0 no evidence, 1 < 0.40, 2 < 0.60, 3 < 0.85, 4 ≥ 0.85. */
export function masteryLevel(p, evidenceCount) {
  if (!evidenceCount || p == null) return 0;
  if (p < 0.4) return 1;
  if (p < 0.6) return 2;
  if (p < 0.85) return 3;
  return 4;
}
export const conceptState = (r, conceptId) => (r.bkt && r.bkt[conceptId]) || null;
/**
 * Applies observations [{ conceptId, correct, cap? }] in order. cap limits the posterior (0.7 after the solution was
 * viewed, real learning-path-service). Unknown answers must not be passed in (they give no evidence).
 */
export function applyObservations(c, r, observations) {
  observations.forEach((o) => {
    const prior = r.bkt[o.conceptId] || { p: bktParams(c, o.conceptId).pInit, n: 0, correct: 0 };
    const p = Math.min(o.cap != null ? o.cap : 1, updateBkt(prior.p, !!o.correct, bktParams(c, o.conceptId)));
    r.bkt[o.conceptId] = { p, n: prior.n + 1, correct: prior.correct + (o.correct ? 1 : 0) };
    r.mastery[o.conceptId] = masteryLevel(p, prior.n + 1);
  });
}
// Coding evidence: one observation per completed "Nộp bài" (failed submits are incorrect, the passing one correct).
// The ledger keeps the count already applied, so calling this again only adds new submits.
export function syncCodeEvidence(c, r, l) {
  if (!l || !l.code || l.code.kind === 'tutorial' || !l.conceptIds.length) return false;
  const s = codeStatus(l);
  const key = l.id + ':code';
  const applied = r.evidence[key] || 0;
  const submits = s.submits || 0;
  if (submits <= applied) return false;
  const obs = [];
  for (let i = applied; i < submits; i++) {
    const correct = !!s.done && i === submits - 1;
    l.conceptIds.forEach((k) => obs.push({ conceptId: k, correct, cap: s.solutionViewed ? 0.7 : null }));
  }
  applyObservations(c, r, obs);
  r.evidence[key] = submits;
  return true;
}

// ───────────────────────── course logic ─────────────────────────
// Lessons added after the path was generated (e.g. new practice lessons) are appended so they stay reachable.
export const orderOf = (c, r) => {
  const base = r.order && r.order.length ? r.order : c.defaultOrder;
  const extra = c.defaultOrder.filter((id) => !base.includes(id));
  return extra.length ? base.concat(extra) : base;
};
export const conceptName = (c, id) => ((c.concepts || []).find((x) => x.id === id) || { name: id }).name;
const lessonsTeaching = (c, conceptId) => Codi.lessons(c).filter((l) => l.conceptIds.includes(conceptId));
export const reasonFor = (c, r, lessonId) => {
  if (r.pathSource !== 'ai') return 'Theo thứ tự mặc định của khoá học (thứ tự bài học tiên quyết).';
  const p = (c.aiPath || []).find((x) => x.lessonId === lessonId);
  return p ? p.reason : 'Theo thứ tự bài học tiên quyết.';
};

// Advisory prerequisite check (decision 65): every prerequisite concept should be completed in at least one lesson,
// or already mastered (≥3). It never blocks opening or completing the lesson; it only drives the warning.
export function lockInfo(c, r, lesson) {
  for (const e of c.prerequisites || []) {
    if (!lesson.conceptIds.includes(e.to) || lesson.conceptIds.includes(e.from)) continue;
    const teach = lessonsTeaching(c, e.from).filter((l) => l.id !== lesson.id);
    if (!teach.length) continue;
    const ok = teach.some((l) => r.completed.includes(l.id)) || (r.mastery[e.from] || 0) >= 3;
    if (!ok) return { concept: conceptName(c, e.from), lesson: teach[0] };
  }
  return null;
}

export function lessonStatus(c, r, lesson, currentId) {
  if (r.completed.includes(lesson.id)) return 'done';
  if (lesson.id === currentId) return (r.studied.includes(lesson.id) || r.quiz[lesson.id]) ? 'active' : 'next';
  if (lockInfo(c, r, lesson)) return 'locked';
  if (r.skippable.includes(lesson.id)) return 'skippable';
  return 'todo';
}
export const STATUS = {
  done: ['Đã học', 'badge-success', 'check-circle'],
  active: ['Đang học', 'badge-accent', 'circle-dot'],
  next: ['Tiếp theo', 'badge-accent', 'arrow-right'],
  skippable: ['Có thể bỏ qua', 'badge-neutral', 'skip-forward'],
  locked: ['Chưa đủ tiên quyết', 'badge-outline', 'alert-circle'],
  todo: ['Chưa học', 'badge-neutral', 'circle'],
};

export function currentLessonId(c, r) {
  const order = orderOf(c, r);
  const open = (id) => { const l = Codi.lesson(c, id); return l && !r.completed.includes(id); };
  return order.find((id) => open(id) && !r.skippable.includes(id)) || order.find(open) || null;
}
const requiredLessons = (c, r) => orderOf(c, r).filter((id) => !r.skippable.includes(id));
export const isCourseComplete = (c, r) => requiredLessons(c, r).every((id) => r.completed.includes(id));

// Adaptive offer after a lesson completion (decisions 66–67). r.offer = {afterLessonId, strong, weak, evidence}.
// Options are derived from the current path, so an option disappears once it no longer applies.
export const MASTERED = 3;
const isOpenLesson = (c, r, id, afterId) => !!Codi.lesson(c, id) && !r.completed.includes(id) && id !== afterId;
// A lesson may move up only when each prerequisite concept is completed, mastered, or placed before the insertion point.
function prereqsBefore(c, r, order, lesson, pos) {
  for (const e of c.prerequisites || []) {
    if (!lesson.conceptIds.includes(e.to) || lesson.conceptIds.includes(e.from)) continue;
    if ((r.mastery[e.from] || 0) >= MASTERED) continue;
    const teach = lessonsTeaching(c, e.from).filter((l) => l.id !== lesson.id);
    if (!teach.length) continue;
    const ok = teach.some((l) => r.completed.includes(l.id) || (order.indexOf(l.id) >= 0 && order.indexOf(l.id) < pos));
    if (!ok) return false;
  }
  return true;
}
export function offerChoices(c, r) {
  const off = r.offer;
  if (!off) return null;
  const order = orderOf(c, r);
  const pos = order.indexOf(off.afterLessonId) + 1;
  const open = (id) => isOpenLesson(c, r, id, off.afterLessonId);
  const movable = (id) => open(id) && order.indexOf(id) > pos && prereqsBefore(c, r, order, Codi.lesson(c, id), pos);
  return {
    skip: order.filter((id) => {
      const l = Codi.lesson(c, id);
      return open(id) && !r.skippable.includes(id) && l.conceptIds.length > 0 && l.conceptIds.every((k) => (r.mastery[k] || 0) >= MASTERED);
    }),
    practice: off.weak.length ? order.filter((id) => movable(id) && Codi.lesson(c, id).conceptIds.some((k) => off.weak.includes(k))) : [],
    harder: order.filter((id) => movable(id) && Codi.lesson(c, id).code && Codi.lesson(c, id).code.kind === 'challenge'),
  };
}
// Applies one option at once (learner's own data, decision 67). Returns the affected lesson ids or null.
export function applyOffer(c, r, kind) {
  const ch = offerChoices(c, r);
  const ids = ch && ch[kind] ? ch[kind] : [];
  if (!ids.length) return null;
  const pos = orderOf(c, r).indexOf(r.offer.afterLessonId) + 1;
  r.adjustment = { kind, at: new Date().toISOString(), before: { order: r.order.slice(), skippable: r.skippable.slice() }, offer: r.offer, ids };
  if (kind === 'skip') {
    r.skippable = r.skippable.concat(ids.filter((id) => !r.skippable.includes(id)));
  } else {
    // ids all sit after the insertion point, so removing them does not shift it.
    const order = orderOf(c, r).filter((id) => !ids.includes(id));
    order.splice(pos, 0, ...ids);
    r.order = order;
  }
  r.highlight = ids.slice();
  r.offer = null;
  return ids;
}

// ───────────────────────── coding practice bridge (Codi.code, owned by the coding feature) ─────────────────────────
export function codeStatus(lesson) {
  if (Codi.code && typeof Codi.code.status === 'function') return Codi.code.status(lesson);
  const cd = lesson.code || {};
  return cd.kind === 'tutorial'
    ? { kind: 'tutorial', done: false, step: 0, total: (cd.steps || []).length }
    : { kind: 'challenge', done: false, passedCount: 0, total: (cd.tests || []).length, submits: 0, solutionViewed: false, score: 0 };
}
export const codeScore = (lesson) => (Codi.code && typeof Codi.code.score === 'function' ? Codi.code.score(lesson) : 0);

// Lesson checklist mirrors the UC precondition: study + quiz + assignment before completion.
export function mySubmission(lessonId) {
  return Codi.db().submissions.filter((s) => s.userId === uid() && s.lessonId === lessonId).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0] || null;
}
export const scoreText = (n) => String(n).replace('.', ',');
const pctText = (n) => String(Number(Number(n).toFixed(2))).replace('.', ',');
/**
 * Port of real lib/lesson-player-contract.ts lessonChecklist (D6/D7): the latest quiz attempt must be submitted AND
 * pass; coding counts the latest submission; an assignment counts once submitted.
 */
export function checklist(r, lesson) {
  let items;
  if (lesson.code) {
    const s = codeStatus(lesson);
    items = s.kind === 'tutorial'
      ? [{ key: 'code', tutorial: true, label: 'Đi hết các bước hướng dẫn', done: !!s.done, note: s.done ? 'Đã đi hết hướng dẫn' : 'Đi tới bước cuối để hoàn thành hướng dẫn' }]
      : [{ key: 'code', label: 'Hoàn thành bài code', done: !!s.done, note: s.done ? 'Đạt tất cả test' : s.submits ? 'Lần nộp gần nhất chưa đạt' : 'Nộp bài để chấm' }];
  } else {
    const studied = r.studied.includes(lesson.id);
    items = [{ key: 'study', label: 'Học nội dung', done: studied, note: studied ? 'Đã học xong nội dung' : 'Xem nội dung hoặc đánh dấu đã học xong' }];
  }
  if (lesson.quiz) {
    const q = r.quiz[lesson.id]; const pass = lesson.quiz.passingScore != null ? lesson.quiz.passingScore : 70;
    const graded = !!(q && q.submitted);
    const done = graded && q.score >= pass;
    items.push({
      key: 'quiz', label: `Đạt quiz (≥ ${pass}%)`, done,
      note: q && q.status === 'draft' ? 'Lần làm hiện tại chưa nộp' : !graded ? 'Chưa làm quiz' : `${pctText(q.score)}%${done ? ' · Đạt' : ' · Chưa đạt, làm lại'}`,
    });
  }
  if (lesson.assignment) {
    const s = mySubmission(lesson.id);
    items.push({ key: 'assignment', label: 'Nộp bài tập', done: !!s, note: s ? (s.status === 'graded' ? `Đã chấm ${scoreText(s.score)}/${s.maxScore}` : 'Chờ chấm') : 'Chưa nộp bài tập' });
  }
  return items;
}

// ───────────────────────── quiz (real lib/assessment-contract.ts) ─────────────────────────
/** null when the quiz can be taken, else the real requireQuizQuestions message. */
export function quizUnavailable(questions) {
  const bad = !questions || !questions.length || questions.some((q) => !Array.isArray(q.options) || q.options.length < 2
    || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length);
  return bad ? 'Quiz chưa có bộ câu hỏi hợp lệ. Vui lòng liên hệ giảng viên.' : null;
}
/** Grades by number of correct questions (real gradeQuiz: Math.round percent, pass when percent ≥ passingScore). */
export function gradeQuiz(questions, answers, passingScore) {
  const right = questions.filter((q) => answers[q.id] === q.correctIndex).length;
  const percent = Math.round((right / questions.length) * 100);
  return { right, percent, passed: percent >= passingScore };
}
/** Questions of the attempt: an open or graded attempt keeps the revision it started with (real quiz revisions). */
export const attemptQuestions = (lesson, st) => (st && st.questions && st.questions.length ? st.questions : lesson.quiz.questions);

// ───────────────────────── assignment (real assessment-contract + lesson-assessment) ─────────────────────────
/** Real assignmentFileLimit: the per-assessment limit, between 1 and 20 MB (default 20). */
export const assignmentFileLimitMb = (a) => Math.min(20, Math.max(1, Number(a && a.maxFileSizeMb) || 20));
/** 'file' | 'link' | 'text' | 'file_or_link' from the seed flags (real submissionFormat). */
export function submissionFormat(a) {
  if (a.submissionFormat) return a.submissionFormat;
  if (a.requiresFile && !a.requiresLink) return 'file';
  if (a.requiresLink && !a.requiresFile) return 'link';
  return 'file_or_link';
}
/** Real requireAssignment link rule: http(s) only, no credentials. */
export function linkValid(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch { return false; }
}

// ───────────────────────── materials (real lesson-player-contract LessonMaterial) ─────────────────────────
/**
 * Materials of a lesson: lesson.materials from the seed, else one simulated material derived from the lesson type
 * (url null = the prototype's simulated player/slides, which keep working as the real tracking rules).
 */
export function materialsOf(l) {
  if (Array.isArray(l.materials) && l.materials.length) return l.materials;
  if (l.type === 'video') return [{ id: l.id, type: 'video', title: l.title, url: null, durationSeconds: (l.durationMin || 0) * 60 }];
  if (l.type === 'pdf') return [{ id: l.id, type: 'pdf', title: l.title, url: null, pages: 8 }];
  return [];
}
export const VIDEO_STUDY_RATIO = 0.9; // owner decision: 90% watched counts as studied
/** Real videoStudied: without a duration only the native ended event decides. */
export const videoStudied = (seconds, duration, ended) => (duration && duration > 0 ? seconds >= duration * VIDEO_STUDY_RATIO : !!ended);
/** Real recordPdfPage: a changed page count resets the seen list; studied once every page was seen. */
export function recordPdfPage(prev, page, pages) {
  const seen = prev && prev.pageCount === pages ? prev.pages || [] : [];
  const visited = Array.from(new Set([...seen, page])).sort((a, b) => a - b);
  return { progress: { pages: visited, pageCount: pages, lastPage: page }, studied: visited.length === pages };
}

// Override the shared progress selector so dashboard, profile and course detail agree.
const baseProgress = Codi.courseProgress;
Codi.courseProgress = (courseId, userId) => {
  if (userId && userId !== uid()) return baseProgress(courseId, userId);
  const c = Codi.course(courseId);
  if (!c || !Codi.isEnrolled(courseId)) return baseProgress(courseId, userId);
  const r = rec(courseId);
  const total = Codi.lessons(c).length;
  const done = r.completed.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, completed: total > 0 && isCourseComplete(c, r), currentLessonId: currentLessonId(c, r) };
};


// AI path generation (simulated). Failure falls back to the default prerequisite order — learner never blocked.
export const genPending = new Set();
export function generatePath(courseId) {
  const c = Codi.course(courseId);
  const r = rec(courseId);
  r.pathStatus = 'generating'; r.highlight = [];
  genPending.add(courseId);
  save(false);
  setTimeout(() => {
    genPending.delete(courseId);
    const rr = rec(courseId);
    // An applied adaptive adjustment wins over a regenerated order until the next lesson completion (decision 67).
    const keepAdjustment = !!rr.adjustment;
    if (Codi.state.scenario.pathAI === 'fail') {
      rr.pathStatus = 'failed'; rr.pathSource = 'default';
      if (!keepAdjustment) { rr.order = c.defaultOrder.slice(); rr.skippable = []; }
    } else {
      rr.pathStatus = 'ready'; rr.pathSource = c.aiPath && c.aiPath.length ? 'ai' : 'default';
      if (!keepAdjustment) { rr.order = aiOrder(c); rr.skippable = (c.aiPath || []).filter((p) => p.skippable).map((p) => p.lessonId); }
    }
    save(true);
  }, 2800);
}

// ───────────────────────── shared constants ─────────────────────────
export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code' };
// Real lib/lesson-kind.ts LESSON_KIND_LABELS.
export const TYPE_LABEL = { video: 'Video', pdf: 'PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code', quiz: 'Quiz' };
export const GOALS = [
  ['project', 'Làm được dự án', 'Ưu tiên bài thực hành và dự án cuối khoá.'],
  ['finish', 'Hoàn thành khóa học', 'Học đủ mọi bài theo thứ tự khoá học.'],
  ['interview', 'Chuẩn bị phỏng vấn', 'Ưu tiên khái niệm cốt lõi hay được hỏi.'],
];
export const LEVELS = [
  ['new', 'Mới bắt đầu', 'Chưa từng học chủ đề này.'],
  ['basic', 'Đã biết cơ bản', 'Đã đọc hoặc làm thử vài ví dụ.'],
  ['solid', 'Khá vững', 'Đã dùng trong dự án nhỏ.'],
];
export const HOURS = [2, 5, 10];
export const goalLabel = (g) => (GOALS.find((x) => x[0] === (g && g.goal)) || [0, 'Chưa đặt mục tiêu'])[1];
export const weeksFor = (c, h) => Math.max(1, Math.ceil((c.durationMin * 2.5) / (h * 60)));
export const enrolledCoursesOf = (userId) => Codi.db().enrolments.filter((e) => e.userId === userId).map((e) => Codi.course(e.courseId)).filter(Boolean);

// ───────────────────────── lesson completion (no auto-advance) ─────────────────────────
export function completeLesson(c, l) {
  const r = rec(c.id);
  if (checklist(r, l).some((x) => !x.done)) return;
  r.completed.push(l.id);
  r.completedAt[l.id] = new Date().toISOString();
  if (!r.studied.includes(l.id)) r.studied.push(l.id);
  const q = r.quiz[l.id];
  // Mastery is BKT (D16): quiz answers were applied at submit; coding submits are applied here. Studying a
  // material alone is no evidence, so it leaves mastery unchanged (real learning-path-service).
  syncCodeEvidence(c, r, l);
  const evidence = l.code && l.code.kind !== 'tutorial' ? codeScore(l) : q && q.submitted ? q.score : null;
  // Apply the AI path update for this lesson (prerequisite order stays intact).
  const upd = (c.pathUpdates || []).find((u) => u.afterLessonId === l.id) || (c.pathUpdates || []).find((u) => u.afterLessonId === '*');
  const changes = [];
  if (upd && r.pathSource === 'ai') {
    upd.changes.forEach((ch) => {
      if (ch.lessonId && r.completed.includes(ch.lessonId)) return;
      if (ch.type === 'moved-up' && ch.lessonId) {
        const order = r.order.filter((x) => x !== ch.lessonId);
        const at = order.findIndex((x) => !r.completed.includes(x));
        order.splice(at < 0 ? order.length : at, 0, ch.lessonId); r.order = order;
      }
      if (ch.type === 'now-skippable' && ch.lessonId && !r.skippable.includes(ch.lessonId)) r.skippable.push(ch.lessonId);
      changes.push(ch);
    });
  }
  if (!changes.length) changes.push({ type: 'info', lessonId: null, text: r.pathSource === 'ai' ? 'Thứ tự các bài còn lại giữ nguyên; mức thành thạo đã được cập nhật.' : 'Bạn đang học theo thứ tự mặc định; mức thành thạo đã được cập nhật.' });
  if (l.code && l.code.kind === 'challenge') {
    const s = codeStatus(l);
    changes.push({ type: 'info', lessonId: null, text: `Kết quả bài code (${s.submits} lần nộp${s.solutionViewed ? ', đã xem lời giải' : ''}) được dùng để cập nhật mức thành thạo "${l.conceptIds.map((k) => conceptName(c, k)).join(', ')}".` });
  }
  const nextId = currentLessonId(c, r);
  r.lastUpdate = { afterLessonId: l.id, changes, nextLessonId: nextId };
  r.highlight = changes.map((x) => x.lessonId).filter(Boolean);
  // A new completion ends any applied adjustment (decision 67) and opens a fresh offer for this lesson (decision 66).
  const strong = l.conceptIds.filter((k) => (r.mastery[k] || 0) >= MASTERED);
  const weak = evidence !== null ? l.conceptIds.filter((k) => (r.mastery[k] || 0) < MASTERED) : [];
  r.adjustment = null;
  r.offer = { afterLessonId: l.id, strong, weak, evidence: evidence !== null };
  Codi.notify(uid(), { title: 'Lộ trình đã được cập nhật', body: `Sau bài "${l.title}".`, link: '/learn/' + c.id });
  save();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
