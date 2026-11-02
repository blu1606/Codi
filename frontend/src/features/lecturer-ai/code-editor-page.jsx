/**
 * Coding exercise builder and lecturer preview.
 * Challenge lessons follow the real app (apps/web/.../code/[lessonId]/coding-builder-client.tsx, code/actions.ts,
 * preview/preview-client.tsx); guided tutorials are a port-only lesson kind kept from docs/mockup/js/lecturer-coding.js.
 *  - /teach/courses/:courseId/code/:lessonId — editor
 *      challenge tabs: Đề bài · Code khởi đầu · Lời giải mẫu · Test case (n) · Gợi ý (n)  + panel "Chạy thử với lời giải"
 *      Save ("Lưu bài code") re-runs the reference solution and is refused unless every test passes.
 *      Expected values: JSON when it parses, otherwise the trimmed text is stored as a string (Codi → "Codi").
 *      Test contract: ≥1 public sample test, ≤100 tests, call ≤10,000 chars, expected ≤4,096 chars (canonical JSON).
 *      Tests that learners already have results for cannot be removed on save.
 *   tutorial tab: Các bước (title, body, starter code per step, optional step tests)
 *  - /teach/courses/:courseId/code/:lessonId/preview — "Xem trước trải nghiệm học viên"; runs are stateless
 *      (nothing is written), sample tests show details, hidden tests only a count on "Nộp bài".
 * The draft lives in a module variable (keyed by course/lesson) so it survives navigation; it reaches the lesson only
 * on save. Depends on Codi.code (coding feature), Codi.teach (lecturer feature) and Codi.lecturerAI.suggestTests.
 */
import { Fragment, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Md } from '../../components/ui/primitives';
import { createViewStore } from './view-store';
import './lecturer-ai.css';

const view = createViewStore();
const rerender = view.bump;
const CC = () => Codi.code || {};
const T = () => Codi.teach || {};

const MAX_TESTS = 100;
const MAX_INPUT_CHARS = 10000;
const MAX_EXPECTED_CHARS = 4096;
const MAX_DURATION = 180;
const INVALID_SUITE = 'Bài tập chưa có bộ kiểm thử hợp lệ. Vui lòng liên hệ giảng viên.';

// Cross-feature helpers, with the mockup behaviour as fallback while Codi.teach is not installed.
const isMine = (c) => (T().isMine ? T().isMine(c) : !!c && c.lecturerId === Codi.state.currentUserId);
const shell = (active, body) => (T().shell ? T().shell(active, body) : <div className="page">{body}</div>);
const notMine = () => (T().notMine ? T().notMine() : shell('', (
  <Empty icon="lock" title="Không tìm thấy khoá học của bạn" body="Khoá học không tồn tại hoặc thuộc giảng viên khác."
    actions={<Link className="btn btn-primary" to="/teach/courses">Về danh sách khoá học</Link>} />
)));
function findLesson(c, id) {
  if (T().findLesson) return T().findLesson(c, id);
  for (const ch of c.chapters) { const i = ch.lessons.findIndex((l) => l.id === id); if (i >= 0) return { ch, i, l: ch.lessons[i] }; }
  return null;
}
const toast = (msg, type) => Codi.ui.toast(msg, { type: type || 'info' });

// ───────────────────────── expected values (real normalizeExpectedValue) ─────────────────────────
/** Expected value from the editor text: JSON when it parses, else the trimmed text as a string. */
function expectedOf(t) {
  const text = t.expectedText === undefined || t.expectedText === null ? '' : String(t.expectedText).trim();
  if (text === '') return t.expectedText === undefined && t.expected !== undefined ? t.expected : '';
  try { return JSON.parse(text); } catch { return text; }
}
const canonical = (v) => (CC().stableJSON ? CC().stableJSON(v) : JSON.stringify(v));
const toText = (v) => (v === undefined ? '' : JSON.stringify(v));

// ───────────────────────── editor draft ─────────────────────────
let ce = null; // {key, courseId, lessonId, title, durationMin, code, tab, dirty, rev, showErrors, check, stepChecks, running, saving, aiBusy, savedTestIds}
const signature = (code) => JSON.stringify([code.language, code.solution, (code.tests || []).map((t) => [t.call, canonical(expectedOf(t))])]);
function load(c, l) {
  const key = c.id + '/' + l.id;
  if (ce && ce.key === key) return ce;
  const code = JSON.parse(JSON.stringify(l.code));
  const withText = (t) => { t.expectedText = toText(t.expected); };
  if (code.kind !== 'tutorial') {
    code.language = code.language || 'javascript';
    code.fileName = code.fileName || 'main.js';
    code.instructions = Array.isArray(code.instructions) && code.instructions.length ? code.instructions : ['Viết hàm hoàn thành yêu cầu đề bài.'];
    code.hints = Array.isArray(code.hints) && code.hints.length ? code.hints : ['Đọc kỹ yêu cầu và các trường hợp biên.'];
    code.starter = code.starter || '';
    code.solution = code.solution || '';
    code.tests = Array.isArray(code.tests) && code.tests.length ? code.tests : [{ id: 'draft-default', name: 'Kiểm tra cơ bản', call: 'tinhToan(1)', expected: 1, step: 0, hidden: false }];
    code.tests.forEach(withText);
  } else if (code.steps) {
    code.steps.forEach((s) => { s.tests = (s.tests || []); s.tests.forEach(withText); });
  }
  ce = {
    key, courseId: c.id, lessonId: l.id, title: l.title, durationMin: l.durationMin || 15, code,
    tab: code.kind === 'tutorial' ? 'steps' : 'brief', dirty: false, rev: 0, showErrors: false,
    check: null, stepChecks: {}, running: false, saving: false, aiBusy: false,
    savedTestIds: ((l.code && l.code.tests) || []).map((t) => t.id),
  };
  return ce;
}
const touch = () => { ce.dirty = true; ce.rev += 1; };

/** Real test contract (lib/coding-contract.ts requireCodingTests) on the normalised suite. */
function suiteValid(tests) {
  if (!tests.length || tests.length > MAX_TESTS || !tests.some((t) => !t.hidden)) return false;
  return tests.every((t) => String(t.call || '').trim().length <= MAX_INPUT_CHARS && String(canonical(expectedOf(t)) || '').length <= MAX_EXPECTED_CHARS);
}

/** Save problems in the real order: { p: {fieldKey: msg}, list: [{ k, msg, tab }] }. */
function problems(d) {
  const p = {}; const list = [];
  const add = (k, msg, tab) => { if (!p[k]) p[k] = msg; list.push({ k, msg, tab }); };
  if (d.code.kind === 'tutorial') {
    if (!String(d.title).trim()) add('title', 'Tên bài không được để trống.', 'steps');
    if (!d.code.steps.length) add('steps', 'Cần ít nhất một bước hướng dẫn.', 'steps');
    d.code.steps.forEach((s, si) => (s.tests || []).forEach((t, i) => {
      const at = `Bước ${si + 1}, test ${i + 1}`;
      if (!String(t.name || '').trim()) add(`steps.${si}.tests.${i}.name`, `${at}: chưa có tên.`, 'steps');
      if (!String(t.call || '').trim()) add(`steps.${si}.tests.${i}.call`, `${at}: chưa có biểu thức gọi hàm.`, 'steps');
    }));
    return { p, list };
  }
  if (!String(d.title).trim()) add('title', 'Tên bài tập không được để trống.', 'brief');
  if (!d.code.instructions.some((s) => String(s).trim())) add('instructions', 'Cần ít nhất một bước yêu cầu đề bài.', 'brief');
  if (!d.code.solution.trim()) add('solution', 'Lời giải mẫu không được để trống.', 'solution');
  if (!d.code.tests.length) add('tests', 'Cần ít nhất một test case.', 'tests');
  if (String(d.code.language || '').toLowerCase() !== 'javascript') add('language', 'Ngôn ngữ Python hiện chưa được hỗ trợ chạy trong sandbox. Vui lòng chọn JavaScript.', 'brief');
  d.code.tests.forEach((t, i) => {
    if (!String(t.name || '').trim()) add(`tests.${i}.name`, `Test ${i + 1}: chưa có tên hiển thị.`, 'tests');
    if (!String(t.call || '').trim()) add(`tests.${i}.call`, `Test ${i + 1}: chưa có biểu thức gọi hàm.`, 'tests');
  });
  const ids = d.code.tests.map((t) => String(t.id));
  if (new Set(ids).size !== ids.length) add('tests', 'ID test case không được trùng nhau.', 'tests');
  if (d.code.tests.length && !list.some((x) => x.tab === 'tests') && !suiteValid(d.code.tests)) add('tests', INVALID_SUITE, 'tests');
  return { p, list };
}
function FieldErr({ pr, k }) {
  if (!ce.showErrors || !pr.p[k]) return null;
  return <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{pr.p[k]}</span></p>;
}
const invalid = (pr, k) => (ce.showErrors && pr.p[k] ? 'is-invalid' : '');

// Editors (starter / solution / tutorial step) write straight into the draft. Key: "te:starter", "te:step:2"…
function teInput(key, value) {
  if (!ce) return;
  const field = key.split(':')[1];
  if (field === 'starter') ce.code.starter = value;
  else if (field === 'solution') ce.code.solution = value;
  else if (field === 'step') ce.code.steps[Number(key.split(':')[2])].starter = value;
  touch();
  rerender();
}
/** Codi.code.editor with the draft wired in; plain textarea while the coding feature is not installed. */
function codeEditor(o) {
  if (CC().editor) return CC().editor(o);
  return (
    <div className="cp-editor">
      <textarea className="cp-textarea" id={o.id} rows={o.minRows || 12} spellCheck={false} aria-label={o.label} data-cp-input={o.key} value={o.value} readOnly={o.readonly}
        onChange={(e) => (String(o.key).startsWith('tp:') ? pvInput : teInput)(o.key, e.target.value)} />
    </div>
  );
}

// Plain fields: path like "title", "tests.2.call", "steps.0.body".
function walk(path) {
  const parts = path.split('.');
  let o = parts[0] === 'title' || parts[0] === 'durationMin' ? ce : ce.code;
  for (let i = 0; i < parts.length - 1; i++) o = o[isNaN(parts[i]) ? parts[i] : Number(parts[i])];
  const last = parts[parts.length - 1];
  return [o, isNaN(last) ? last : Number(last)];
}
function setPath(path, value) { const [o, k] = walk(path); o[k] = value; touch(); rerender(); }
const getPath = (path) => { const [o, k] = walk(path); return o[k]; };
/** Controlled-input props for a draft path. */
function bind(path, opts) {
  if (opts && opts.type === 'checkbox') return { checked: !!getPath(path), onChange: (e) => setPath(path, e.target.checked) };
  const v = getPath(path);
  return { value: v === undefined || v === null ? '' : String(v), onChange: (e) => setPath(path, e.target.value) };
}

// ───────────────────────── tabs ─────────────────────────
function TitleFields({ pr, tutorial }) {
  return (
    <div className="grid-2">
      <div className={`field ${invalid(pr, 'title')}`}><label htmlFor="te-title">{tutorial ? 'Tên bài' : 'Tên bài tập'} <span className="req">*</span></label><input id="te-title" {...bind('title')} /><FieldErr pr={pr} k="title" /></div>
      {/* Kept as typed text while editing; save stores a whole number from 1 to 180 (real default 15). */}
      <div className="field"><label htmlFor="te-dur">Thời lượng dự kiến (phút)</label><input id="te-dur" type="number" min="1" max={MAX_DURATION} {...bind('durationMin')} /></div>
    </div>
  );
}

function BriefTab({ pr }) {
  const d = ce;
  return (
    <section className="card"><div className="card-body stack-4">
      <div className="stack-1"><h2 className="tc-h">Thông tin &amp; Yêu cầu đề bài</h2>
        <p className="small muted">Thiết lập tiêu đề bài tập, thời lượng và danh sách các bước yêu cầu học viên cần đạt.</p></div>
      <TitleFields pr={pr} />
      <div className="grid-2">
        <div className={`field ${invalid(pr, 'language')}`}><label htmlFor="te-lang">Ngôn ngữ lập trình</label>
          <select id="te-lang" value={d.code.language} onChange={(e) => setPath('language', e.target.value)}>
            <option value="javascript">JavaScript</option>
            <option value="python" disabled>Python (Chưa hỗ trợ trong Sandbox)</option>
          </select><FieldErr pr={pr} k="language" /></div>
        <div className="field"><label htmlFor="te-file">Tên tệp hiển thị</label><input id="te-file" className="mono" placeholder="ví dụ: main.js" {...bind('fileName')} /></div>
      </div>
      <fieldset className="stack-3 te-fieldset lai-fieldset"><legend className="field-label">Các bước yêu cầu đề bài <span className="req">*</span></legend>
        <p className="field-help">Hiện thành danh sách checklist bên cạnh trình soạn code của học viên. Dùng <code>`tên`</code> để đánh dấu code.</p>
        {d.code.instructions.map((s, i) => (
          <div key={i} className="te-row"><label className="sr-only" htmlFor={`te-ins-${i}`}>Bước {i + 1}</label><span className="te-n">{i + 1}</span>
            <textarea id={`te-ins-${i}`} rows={2} placeholder={`Mô tả yêu cầu bước ${i + 1}...`} {...bind(`instructions.${i}`)} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('instructions', i)} aria-label={`Xoá bước ${i + 1}`} disabled={d.code.instructions.length <= 1}><Icon name="trash" className="icon-sm" /></button></div>
        ))}
        <FieldErr pr={pr} k="instructions" />
        <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => add('instructions')}><Icon name="plus" className="icon-sm" /> Thêm bước yêu cầu</button></div>
      </fieldset>
    </div></section>
  );
}

function CodeTab({ field, pr, ro }) {
  const d = ce; const isSol = field === 'solution';
  return (
    <section className="card"><div className="card-body stack-3">
      <div className="row-between">
        <div className="stack-1">
          <h2 className="tc-h">{isSol ? 'Lời giải mẫu chuẩn (Reference Solution)' : 'Mã nguồn khởi đầu (Starter Code)'}</h2>
          <p className="small muted">{isSol ? 'Lời giải này bắt buộc phải vượt qua 100% test case để bài tập đủ điều kiện lưu và xuất bản khoá học.' : 'Đoạn mã mẫu mà học viên sẽ thấy khi mở bài học lần đầu. Nên để sẵn tên hàm, tham số và chú thích hướng dẫn.'}</p>
        </div>
        {isSol && !ro ? <button type="button" className="btn btn-secondary btn-sm" onClick={check} disabled={d.running} aria-busy={d.running ? 'true' : undefined}>{d.running ? null : <Icon name="play" className="icon-sm" />} {d.running ? 'Đang chạy...' : 'Chạy thử'}</button> : null}
      </div>
      {codeEditor({ id: `te-${field}`, key: `te:${field}`, value: d.code[field] || '', fileName: d.code.fileName, language: d.code.language, label: isSol ? 'Lời giải mẫu' : 'Code khởi đầu', minRows: 14, maxRows: 24, readonly: ro })}
      {isSol ? <FieldErr pr={pr} k="solution" /> : null}
    </div></section>
  );
}

function TestsTab({ pr, ro }) {
  const d = ce; const steps = d.code.instructions;
  return (
    <div className="stack-3">
      <div className="row-between">
        <p className="small muted">Mỗi test case là một biểu thức gọi hàm kèm giá trị trả về mong đợi (định dạng JSON).</p>
        {!ro ? (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={aiTests} disabled={d.aiBusy} aria-busy={d.aiBusy ? 'true' : undefined}>{d.aiBusy ? null : <Icon name="sparkles" className="icon-sm" />} {d.aiBusy ? 'AI đang tìm...' : 'Gợi ý test biên'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => add('tests')}><Icon name="plus" className="icon-sm" /> Thêm test</button>
          </div>
        ) : null}
      </div>
      <FieldErr pr={pr} k="tests" />
      <ol className="te-tests">{d.code.tests.map((t, i) => (
        <li key={t.id} className="te-test">
          <div className="row-between">
            <span className="row" style={{ gap: 8 }}><strong className="small">Test #{i + 1}</strong>
              <span className={`badge ${t.hidden ? 'badge-neutral' : 'badge-accent'}`}>{t.hidden ? 'Test ẩn (chỉ chấm khi Nộp bài)' : 'Mẫu công khai (học viên nhìn thấy)'}</span></span>
            {!ro ? (
              <span className="row" style={{ gap: 8 }}><label className="check"><input type="checkbox" {...bind(`tests.${i}.hidden`, { type: 'checkbox' })} /> Ẩn test</label>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('tests', i)} aria-label={`Xoá test ${i + 1}`} disabled={d.code.tests.length <= 1}><Icon name="trash" className="icon-sm" /></button></span>
            ) : null}
          </div>
          <div className="grid-2">
            <div className={`field ${invalid(pr, `tests.${i}.name`)}`}><label htmlFor={`te-tn-${i}`}>Tên test case</label><input id={`te-tn-${i}`} placeholder="Ví dụ: Kiểm tra số nguyên tố hoặc trường hợp mảng rỗng" {...bind(`tests.${i}.name`)} /><FieldErr pr={pr} k={`tests.${i}.name`} /></div>
            <div className="field"><label htmlFor={`te-ts-${i}`}>Thuộc bước</label>
              <select id={`te-ts-${i}`} value={String(t.step || 0)} onChange={(e) => setPath(`tests.${i}.step`, Number(e.target.value))}>{steps.map((_, k) => <option key={k} value={String(k)}>Bước {k + 1}</option>)}</select></div>
          </div>
          <div className="grid-2">
            <div className={`field ${invalid(pr, `tests.${i}.call`)}`}><label htmlFor={`te-tc-${i}`}>Biểu thức gọi hàm (Call expression)</label><input id={`te-tc-${i}`} className="mono" placeholder="ví dụ: tinhTong(2, 3)" {...bind(`tests.${i}.call`)} /><FieldErr pr={pr} k={`tests.${i}.call`} /></div>
            <div className="field"><label htmlFor={`te-te-${i}`}>Giá trị mong đợi JSON (Expected Output)</label><input id={`te-te-${i}`} className="mono" placeholder={'ví dụ: 5, "Hello", hoặc [1, 2]'} {...bind(`tests.${i}.expectedText`)} /></div>
          </div>
        </li>
      ))}</ol>
    </div>
  );
}

function HintsTab() {
  const d = ce;
  return (
    <section className="card"><div className="card-body stack-3">
      <div className="stack-1"><h2 className="tc-h">Gợi ý mở dần cho học viên</h2>
        <p className="small muted">Gợi ý sẽ mở dần khi học viên nộp bài nhiều lần chưa đạt, giúp học viên tự tìm ra lỗi mà không xem trước toàn bộ lời giải.</p></div>
      {d.code.hints.map((h, i) => (
        <div key={i} className="te-row"><label className="sr-only" htmlFor={`te-h-${i}`}>Gợi ý {i + 1}</label><span className="te-n">{i + 1}</span>
          <textarea id={`te-h-${i}`} rows={2} placeholder={`Gợi ý ${i + 1}...`} {...bind(`hints.${i}`)} />
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('hints', i)} aria-label={`Xoá gợi ý ${i + 1}`} disabled={d.code.hints.length <= 1}><Icon name="trash" className="icon-sm" /></button></div>
      ))}
      <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => add('hints')}><Icon name="plus" className="icon-sm" /> Thêm gợi ý</button></div>
    </div></section>
  );
}

function StepsTab({ pr, ro }) {
  const d = ce;
  return (
    <div className="stack-4">
      <TitleFields pr={pr} tutorial />
      <p className="small muted">Học viên đi qua từng bước với mục lục bên trái, trình soạn code và Console bên phải. Bước đánh dấu "Lời giải" được che cho đến khi học viên chủ động mở.</p>
      <FieldErr pr={pr} k="steps" />
      {d.code.steps.map((s, i) => (
        <details key={i} className="card te-step" open={i === 0}>
          <summary className="card-body compact row-between"><span className="row"><span className="te-n">{i + 1}</span><strong className="small">{s.title || 'Bước chưa đặt tên'}</strong>{s.isSolution ? <span className="badge badge-neutral">Lời giải</span> : null}{s.tests && s.tests.length ? <span className="badge badge-neutral">{s.tests.length} test</span> : null}</span><Icon name="chevron-down" className="icon-sm" /></summary>
          <div className="card-body stack-3">
            <div className="field"><label htmlFor={`te-st-${i}`}>Tiêu đề bước</label><input id={`te-st-${i}`} {...bind(`steps.${i}.title`)} /></div>
            <div className="field"><label htmlFor={`te-sb-${i}`}>Nội dung hướng dẫn</label><textarea id={`te-sb-${i}`} rows={5} {...bind(`steps.${i}.body`)} /><span className="field-help">Hỗ trợ **in đậm**, `code` và danh sách bắt đầu bằng "- ".</span></div>
            <label className="check"><input type="checkbox" {...bind(`steps.${i}.isSolution`, { type: 'checkbox' })} /> Đây là bước lời giải (che cho đến khi học viên mở)</label>
            <span className="field-label">Code của bước</span>
            {codeEditor({ id: `te-step-${i}`, key: `te:step:${i}`, value: s.starter || '', fileName: d.code.fileName, language: d.code.language, label: `Code của bước ${i + 1}`, minRows: 8, maxRows: 16, readonly: ro })}
            <StepTestsEditor s={s} si={i} pr={pr} />
            <div><button type="button" className="btn btn-danger-outline btn-sm" onClick={() => remove('steps', i)} disabled={d.code.steps.length < 2}><Icon name="trash" className="icon-sm" /> Xoá bước</button></div>
          </div>
        </details>
      ))}
      <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => add('steps')}><Icon name="plus" className="icon-sm" /> Thêm bước</button></div>
    </div>
  );
}

// Tests attached to one tutorial step (e.g. "Sửa code của mình!", "Thử thách"). Learners see them as
// "Kiểm tra bước này" and run them with the Chạy button of that step.
const solutionCode = (d) => { const s = d.code.steps.find((x) => x.isSolution); return s ? s.starter || '' : ''; };
function StepTestsEditor({ s, si, pr }) {
  const d = ce; const tests = s.tests || [];
  const chk = d.stepChecks[si];
  const sol = solutionCode(d);
  const pass = chk ? chk.outcomes.filter((o) => o.pass).length : 0;
  return (
    <fieldset className="te-fieldset stack-3 lai-fieldset"><legend className="field-label">Test kiểm tra của bước</legend>
      <p className="field-help">Không bắt buộc. Có test thì học viên thấy mục "Kiểm tra bước này" và bước được tick khi đạt. Mỗi test là một biểu thức chạy sau code của học viên, so với giá trị mong đợi (JSON, hoặc chữ thường sẽ được lưu thành chuỗi).</p>
      {tests.length ? (
        <ol className="te-tests">{tests.map((t, i) => {
          const base = `steps.${si}.tests.${i}`;
          return (
            <li key={t.id} className="te-test">
              <div className="row-between"><strong className="small">Test {i + 1}</strong><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('steptests', si, i)} aria-label={`Xoá test ${i + 1} của bước ${si + 1}`}><Icon name="trash" className="icon-sm" /></button></div>
              <div className={`field ${invalid(pr, `${base}.name`)}`}><label htmlFor={`te-sn-${si}-${i}`}>Tên hiển thị</label><input id={`te-sn-${si}-${i}`} {...bind(`${base}.name`)} /><FieldErr pr={pr} k={`${base}.name`} /></div>
              <div className="grid-2">
                <div className={`field ${invalid(pr, `${base}.call`)}`}><label htmlFor={`te-sc-${si}-${i}`}>Biểu thức gọi</label><input id={`te-sc-${si}-${i}`} className="mono" {...bind(`${base}.call`)} placeholder="xepLoai(9)" /><FieldErr pr={pr} k={`${base}.call`} /></div>
                <div className="field"><label htmlFor={`te-se-${si}-${i}`}>Giá trị mong đợi (JSON)</label><input id={`te-se-${si}-${i}`} className="mono" {...bind(`${base}.expectedText`)} placeholder={'"Giỏi"'} /></div>
              </div>
            </li>
          );
        })}</ol>
      ) : null}
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => add('steptests', si)}><Icon name="plus" className="icon-sm" /> Thêm test</button>
        {tests.length ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => stepCheck(si)} disabled={!sol.trim()}><Icon name="play" className="icon-sm" /> Chạy thử với code ở bước lời giải</button> : null}
      </div>
      {tests.length && !sol.trim() ? <p className="xsmall muted">Thêm code vào bước đánh dấu "Lời giải" để chạy thử test.</p> : null}
      {chk ? (
        <>
          <p className={`te-check-sum ${pass === chk.outcomes.length ? 'is-pass' : 'is-fail'}`} role="status"><Icon name={pass === chk.outcomes.length ? 'check-circle' : 'x-circle'} className="icon-sm" /> Code lời giải đạt {pass}/{chk.outcomes.length} test của bước này</p>
          <ul className="cp-tests">{tests.map((t) => <Fragment key={t.id}>{CC().testRow ? CC().testRow({ id: t.id, name: t.name || 'Test chưa đặt tên', call: t.call }, chk.outcomes.find((o) => o.id === t.id)) : null}</Fragment>)}</ul>
        </>
      ) : null}
    </fieldset>
  );
}

function CheckPanel({ ro }) {
  const d = ce; const chk = d.check; const tests = d.code.tests;
  const fresh = chk && chk.sig === signature(d.code);
  return (
    <section className="card te-check" aria-labelledby="te-check-h"><div className="card-body stack-3">
      <h2 className="tc-h" id="te-check-h"><Icon name="play" className="icon-sm" /> Chạy thử với lời giải</h2>
      <p className="small muted">Chạy lời giải mẫu với toàn bộ {tests.length} test case (kể cả test ẩn). Bài chỉ đủ điều kiện lưu và xuất bản khi đạt 100%.</p>
      {!ro ? <button type="button" className="btn btn-primary" data-cp-run="" onClick={check} disabled={d.running} aria-busy={d.running ? 'true' : undefined}>{d.running ? null : <Icon name="play" className="icon-sm" />} {d.running ? 'Đang thực thi...' : 'Chạy thử nghiệm ngay'}</button> : null}
      {chk ? (
        <>
          <div className={`te-check-sum lai-check-sum ${chk.ok ? 'is-pass' : 'is-fail'}`} role="status">
            <span className="row" style={{ gap: 6 }}><Icon name={chk.ok ? 'check-circle' : 'x-circle'} className="icon-sm" /> {chk.ok ? `Lời giải đạt ${chk.passed}/${chk.total} test` : `Chưa đạt: ${chk.passed}/${chk.total} test`}</span>
            <span className="xsmall">{chk.ok ? 'Đủ điều kiện lưu' : 'Không thể lưu bài'}</span>
          </div>
          {!fresh ? <p className="xsmall text-warn"><Icon name="alert-triangle" className="icon-sm" /> Đã có thay đổi sau lần chạy này, hãy chạy lại.</p> : null}
          <ul className="cp-tests">{chk.tests.map((t) => <Fragment key={t.id}>{CC().testRow ? CC().testRow({ id: t.id, name: `${t.name || 'Test'}${t.hidden ? ' (ẩn)' : ''}`, call: t.call }, chk.outcomes.find((o) => o.id === t.id)) : null}</Fragment>)}</ul>
          {chk.res && chk.res.logs && chk.res.logs.length ? <details className="cp-console-details"><summary className="small strong">Console</summary>{CC().consoleView ? CC().consoleView(chk.res) : null}</details> : null}
        </>
      ) : (
        <div className="lai-empty-run small muted"><Icon name="terminal" /><p>Chưa có kết quả chạy thử gần đây.</p><p className="xsmall">Bấm nút bên trên để kiểm tra lời giải mẫu.</p></div>
      )}
    </div></section>
  );
}

// ───────────────────────── actions ─────────────────────────
function add(w, si) {
  const code = ce.code;
  if (w === 'instructions') code.instructions.push('');
  if (w === 'hints') code.hints.push('');
  if (w === 'tests') code.tests.push({ id: 'draft-' + Codi.uid('t'), name: `Kiểm tra ${code.tests.length + 1}`, call: '', expected: '', expectedText: '', step: 0, hidden: false });
  if (w === 'steps') { const last = code.steps[code.steps.length - 1]; code.steps.splice(Math.max(0, code.steps.length - (last && last.isSolution ? 1 : 0)), 0, { title: 'Bước mới', body: '', starter: '', tests: [] }); }
  if (w === 'steptests') {
    code.steps[si].tests.push({ id: 'st-' + Codi.uid('t'), name: '', call: '', expected: '', expectedText: '' });
    delete ce.stepChecks[si];
  }
  touch(); rerender();
}
async function remove(w, i, j) {
  const d = ce;
  if (w === 'instructions' && d.code.instructions.length <= 1) { toast('Bài tập cần ít nhất một bước yêu cầu.', 'danger'); return; }
  if (w === 'tests' && d.code.tests.length <= 1) { toast('Bài tập cần ít nhất một test case.', 'danger'); return; }
  if (w === 'steps') {
    const r = await Codi.ui.confirm({ title: 'Xoá bước này?', body: 'Thay đổi chỉ được lưu khi bạn bấm "Lưu bài".', confirmLabel: 'Xoá', danger: true });
    if (!r.ok || ce !== d) return;
  }
  if (w === 'steptests') { d.code.steps[i].tests.splice(j, 1); delete d.stepChecks[i]; }
  else { d.code[w].splice(i, 1); if (w === 'steps') d.stepChecks = {}; }
  touch(); rerender();
}

async function aiTests() {
  const d = ce;
  if (!d || d.aiBusy || !Codi.lecturerAI || !Codi.lecturerAI.suggestTests) return;
  if (!d.code.solution.trim()) {
    toast('Vui lòng nhập lời giải mẫu trước để AI có thể phân tích và sinh test biên.', 'danger');
    d.tab = 'solution'; rerender(); return;
  }
  d.aiBusy = true; rerender();
  try {
    const items = await Codi.lecturerAI.suggestTests(d.code);
    if (items.length) {
      items.forEach((t) => d.code.tests.push({ id: t.id, name: t.name, call: t.call, expected: expectedOf(t), expectedText: t.expectedText, step: t.step || 0, hidden: true }));
      touch(); d.tab = 'tests';
      toast(`Đã gợi ý thành công ${items.length} test case biên mới!`, 'success');
    } else {
      toast('Không tìm thêm được trường hợp biên mới cho bài này.');
    }
  } catch (e) {
    toast((e && e.message) || 'Không thể sinh test case biên bằng AI lúc này.', 'danger');
  } finally {
    d.aiBusy = false; rerender();
  }
}

const runnable = (list) => list.map((t) => ({ id: t.id, name: t.name, call: String(t.call || '').trim(), expected: expectedOf(t) }));
async function runSafely(code, tests, opts) {
  try { return await CC().run(code, tests, opts); }
  catch (e) { return { phase: 'runtime', error: String((e && e.message) || e), logs: [], results: [] }; }
}
/** Real verifySolutionCode: runs the solution against every test; ok only when all pass and the run finished. */
async function verifySolution(d) {
  const tests = d.code.tests.map((t) => ({ ...t }));
  const prepared = runnable(tests);
  const res = await runSafely(d.code.solution, prepared, { language: 'javascript', solution: d.code.solution });
  const outcomes = CC().grade(prepared, res);
  const passed = outcomes.filter((o) => o.pass).length;
  const phase = res.phase || 'done';
  return { at: new Date().toISOString(), sig: signature(d.code), tests, outcomes, res, passed, total: outcomes.length, ok: outcomes.length > 0 && passed === outcomes.length && phase === 'done' };
}
async function stepCheck(si) {
  if (!ce || ce.running || !CC().run) return;
  const d = ce;
  const tests = runnable(d.code.steps[si].tests);
  d.running = true; rerender();
  const res = await runSafely(solutionCode(d), tests, { language: d.code.language });
  d.stepChecks[si] = { outcomes: CC().grade(tests, res), res };
  d.running = false; rerender();
}
async function check() {
  const d = ce;
  if (!d || d.running || !CC().run) return;
  if (!d.code.solution.trim()) { toast('Vui lòng nhập lời giải mẫu trước khi chạy thử.', 'danger'); d.tab = 'solution'; rerender(); return; }
  if (!d.code.tests.length) { toast('Cần có ít nhất một test case để chạy thử.', 'danger'); d.tab = 'tests'; rerender(); return; }
  if (String(d.code.language).toLowerCase() !== 'javascript') { toast(`Ngôn ngữ ${d.code.language || 'được chọn'} hiện chưa được hỗ trợ trong môi trường chạy sandbox. Vui lòng chọn JavaScript.`, 'danger'); return; }
  if (!suiteValid(d.code.tests)) { toast(INVALID_SUITE, 'danger'); d.tab = 'tests'; rerender(); return; }
  if (CC().rememberFocus) CC().rememberFocus();
  d.running = true; rerender();
  try {
    d.check = await verifySolution(d);
    if (d.check.ok) toast(`Tuyệt vời! Lời giải mẫu đã vượt qua ${d.check.passed}/${d.check.total} test case.`, 'success');
    else toast(`Lời giải mẫu chưa đạt (${d.check.passed}/${d.check.total} test). Hãy xem chi tiết lỗi bên dưới.`, 'danger');
  } catch (e) {
    toast((e && e.message) || 'Lỗi khi chạy thử lời giải mẫu.', 'danger');
  } finally {
    d.running = false; rerender();
  }
}

/** Test ids that learners already have graded results for (failed counts or the last submitted run). */
function testIdsWithResults(courseId, lessonId) {
  const ids = new Set();
  (Codi.db().codeAttempts || []).forEach((a) => {
    if (a.courseId !== courseId || a.lessonId !== lessonId) return;
    const u = Codi.user ? Codi.user(a.userId) : null;
    if (u && u.role !== 'learner') return;
    Object.keys(a.failedTests || {}).forEach((k) => ids.add(k));
    if (a.lastRun && a.lastRun.mode === 'submit') (a.lastRun.outcomes || []).forEach((o) => ids.add(String(o.id)));
  });
  return ids;
}

const storeTest = (t) => { const o = { ...t, expected: expectedOf(t) }; delete o.expectedText; delete o.isSample; return o; };
function writeLesson(d, code) {
  const c = Codi.course(d.courseId); const f = c && findLesson(c, d.lessonId);
  if (!f) { toast('Không tìm thấy bài học trong khoá học này.', 'danger'); return false; }
  const n = Math.round(Number(d.durationMin));
  Codi.set(() => {
    Object.assign(f.l, { title: String(d.title).trim(), durationMin: Math.min(MAX_DURATION, Math.max(1, Number.isFinite(n) && n > 0 ? n : 15)), code });
    if (T().contentChanged) T().contentChanged(c);
  });
  return true;
}

async function save() {
  const d = ce;
  if (!d || d.saving) return;
  const c = Codi.course(d.courseId);
  if (!c || c.status === 'pending') return;
  const pr = problems(d);
  if (pr.list.length) {
    d.showErrors = true; d.tab = pr.list[0].tab;
    toast(pr.list[0].msg, 'danger');
    rerender(); return;
  }
  if (d.code.kind === 'tutorial') {
    const code = JSON.parse(JSON.stringify(d.code));
    // Steps without tests are stored without the field, so learners see no empty "Kiểm tra bước này".
    code.steps.forEach((s) => { if (s.tests && s.tests.length) s.tests = s.tests.map(storeTest); else delete s.tests; });
    if (writeLesson(d, code)) { d.dirty = false; d.showErrors = false; toast('Đã lưu bài code.', 'success'); }
    rerender(); return;
  }

  const startRev = d.rev;
  d.saving = true; rerender();
  try {
    // The solution is verified again at save time; a client-side run is never trusted.
    const verification = await verifySolution(d);
    d.check = verification;
    if (!verification.ok) {
      toast(`Lời giải mẫu chưa vượt qua tất cả các test case (${verification.passed}/${verification.total} test đạt). Không thể lưu bài tập.`, 'danger');
      return;
    }
    const kept = new Set(verification.tests.map((t) => String(t.id)));
    const used = testIdsWithResults(d.courseId, d.lessonId);
    if (d.savedTestIds.some((id) => !kept.has(String(id)) && used.has(String(id)))) {
      toast('Không thể xoá test case đã có học viên nộp bài và chấm điểm. Bạn có thể sửa nội dung thay vì xoá test case này.', 'danger');
      return;
    }
    const code = JSON.parse(JSON.stringify({ ...d.code, tests: verification.tests }));
    code.language = 'javascript';
    code.instructions = code.instructions.filter((s) => String(s).trim());
    code.hints = code.hints.filter((h) => String(h).trim());
    code.tests = code.tests.map(storeTest);
    code.solutionVerifiedAt = verification.at;
    code.solutionCheck = { ok: true, passed: verification.passed, total: verification.total, at: verification.at };
    if (!writeLesson(d, code)) return;
    d.savedTestIds = code.tests.map((t) => t.id);
    d.dirty = d.rev !== startRev;
    d.showErrors = false;
    toast('Đã lưu bài tập thực hành code thành công!', 'success');
  } catch (e) {
    toast((e && e.message) || 'Lỗi khi lưu bài code.', 'danger');
  } finally {
    d.saving = false; rerender();
  }
}

// ───────────────────────── routes ─────────────────────────
export function CodeEditorPage({ params }) {
  useCodi();
  view.useStore();
  useEffect(() => { if (CC().restoreFocus) CC().restoreFocus(); });
  if (CC().onInput) CC().onInput('te', teInput);

  const c = Codi.course(params.courseId);
  if (!isMine(c)) return notMine();
  const f = findLesson(c, params.lessonId);
  if (!f || !f.l.code) {
    return shell('/teach/courses', <Empty icon="code" title="Không tìm thấy bài code" actions={<Link className="btn btn-primary" to={`/teach/courses/${c.id}/content`}>Về nội dung khoá học</Link>} />);
  }
  const d = load(c, f.l); const pr = problems(d);
  const isTut = d.code.kind === 'tutorial';
  const ro = c.status === 'pending';
  const tabs = isTut ? [['steps', 'Các bước']] : [['brief', 'Đề bài'], ['starter', 'Code khởi đầu'], ['solution', 'Lời giải mẫu'], ['tests', `Test case (${d.code.tests.length})`], ['hints', `Gợi ý (${d.code.hints.length})`]];
  const body = {
    brief: () => <BriefTab pr={pr} />,
    starter: () => <CodeTab key="starter" field="starter" pr={pr} ro={ro} />,
    solution: () => <CodeTab key="solution" field="solution" pr={pr} ro={ro} />,
    tests: () => <TestsTab pr={pr} ro={ro} />,
    hints: () => <HintsTab />,
    steps: () => <StepsTab pr={pr} ro={ro} />,
  }[d.tab]();
  return shell('/teach/courses', (
    <>
      <div className="stack-3" style={{ marginBottom: 16 }}>
        <Link className="small" to={`/teach/courses/${c.id}/content`}><Icon name="arrow-left" className="icon-sm" /> Quay lại khoá học: {c.title}</Link>
        <div className="row-between">
          <div className="stack-1">
            <span className="row" style={{ gap: 8 }}><span className="xsmall muted">{isTut ? 'Hướng dẫn code' : 'Bài tập code'} · JavaScript</span>
              {ro ? <span className="badge badge-warn">Đang chờ duyệt — Chỉ đọc</span> : null}</span>
            <h1>{d.title || (isTut ? 'Bài chưa đặt tên' : 'Bài tập code chưa đặt tên')}</h1>
            {!isTut ? <p className="small muted">Thiết lập đề bài, khung code ban đầu, lời giải mẫu và bộ test case tự động chấm điểm cho học viên.</p> : null}
          </div>
          <div className="row">
            <Link className="btn btn-secondary" to={`/teach/courses/${c.id}/code/${f.l.id}/preview`}><Icon name="eye" className="icon-sm" /> Xem như học viên</Link>
            {!ro && !isTut ? <button type="button" className="btn btn-secondary" onClick={check} disabled={d.running} aria-busy={d.running ? 'true' : undefined}>{d.running ? null : <Icon name="play" className="icon-sm" />} {d.running ? 'Đang chạy thử...' : 'Chạy thử với lời giải'}</button> : null}
            {!ro ? <button type="button" className="btn btn-primary" onClick={save} disabled={d.saving} aria-busy={d.saving ? 'true' : undefined}>{d.saving ? null : <Icon name="save" className="icon-sm" />} {d.saving ? 'Đang lưu...' : isTut ? 'Lưu bài' : 'Lưu bài code'}</button> : null}
          </div>
        </div>
        {d.dirty && !ro && !isTut ? <Alert type="warn" body={<>Bạn có thay đổi chưa lưu. Hãy nhớ bấm <strong>Chạy thử với lời giải</strong> rồi bấm <strong>Lưu bài code</strong>.</>} /> : null}
        {d.dirty && !ro && isTut ? <Alert type="warn" body="Bạn có thay đổi chưa lưu." /> : null}
        {ro ? <Alert type="warn" title="Khoá học đang chờ duyệt" body="Nội dung bài tập đang ở chế độ chỉ đọc trong thời gian ban quản trị kiểm duyệt." /> : null}
        {d.showErrors && pr.list.length > 1 ? <Alert type="danger" title={`Còn ${pr.list.length} lỗi cần sửa trước khi lưu`} body={<ul className="small">{pr.list.map((x, i) => <li key={i}>{x.msg}</li>)}</ul>} /> : null}
      </div>
      <div className="te-layout" data-cp-workspace="te-editor">
        <div className="stack-4">
          <div className="tabs" role="tablist">{tabs.map(([k, label]) => (
            <button key={k} type="button" className="tab" role="tab" aria-selected={d.tab === k} onClick={() => { ce.tab = k; rerender(); }}>{label}</button>
          ))}</div>
          <fieldset className="te-fieldset" disabled={ro}>{body}</fieldset>
        </div>
        {isTut ? (
          <aside className="card te-check"><div className="card-body stack-2"><h2 className="tc-h">Học viên sẽ thấy</h2>
            <p className="small muted">{d.code.steps.length} bước · {d.code.steps.filter((s) => s.tests && s.tests.length).length} bước có test · {d.code.steps.some((s) => s.isSolution) ? 'có bước lời giải được che' : 'chưa có bước lời giải'}.</p>
            <p className="small muted">Bấm "Xem như học viên" để mở bài trong trình phát bài học.</p></div></aside>
        ) : <CheckPanel ro={ro} />}
      </div>
    </>
  ));
}

// ───────────────────────── lecturer preview (stateless) ─────────────────────────
let pv = null; // {key, code, running, result, side: 'brief'|'hints', resTab: 'tests'|'console'}
const pvView = createViewStore();
function pvLoad(c, l) {
  const key = c.id + '/' + l.id + '/' + (l.code.solutionVerifiedAt || (l.code.solutionCheck && l.code.solutionCheck.at) || '');
  if (!pv || pv.key !== key) pv = { key, code: l.code.starter || '', running: false, result: null, side: 'brief', resTab: 'tests' };
  return pv;
}
// Codi.code.editor keeps its own text, so typing needs no re-render; the plain fallback textarea is controlled.
function pvInput(_key, value) { if (!pv) return; pv.code = value; if (!CC().editor) pvView.bump(); }

async function pvReset(l) {
  const r = await Codi.ui.confirm({
    title: 'Khôi phục code ban đầu?', danger: true, confirmLabel: 'Khôi phục',
    consequence: 'Code bạn đang viết trong trình xem trước sẽ được thay bằng code khởi đầu.',
    reversible: 'Bản xem trước không lưu bài nộp; code đã thay đổi chỉ có thể viết lại thủ công.',
  });
  if (!r.ok || !pv) return;
  pv.code = l.code.starter || ''; pvView.bump();
  toast('Đã khôi phục mã nguồn ban đầu.');
}

/** Real runPreviewCode: "run" uses sample tests only; "submit" runs all and reports hidden tests as a count. */
async function pvExecute(l, mode) {
  const p = pv;
  if (!p || p.running) return;
  const all = (l.code.tests || []).map((t) => ({ ...t, expectedText: toText(t.expected) }));
  if (!all.length) { toast('Bài tập chưa có bộ kiểm thử nào.', 'danger'); return; }
  if (!CC().run) { toast('Lỗi khi chạy code xem trước.', 'danger'); return; }
  const toRun = runnable(mode === 'run' ? all.filter((t) => !t.hidden) : all);
  p.running = true; pvView.bump();
  try {
    const res = await runSafely(p.code, toRun, { language: 'javascript' });
    const outcomes = CC().grade(toRun, res);
    const by = {}; outcomes.forEach((o) => { by[o.id] = o; });
    const samples = all.filter((t) => !t.hidden).map((t) => ({ test: t, outcome: by[t.id] || null }));
    const hidden = mode === 'submit' ? all.filter((t) => t.hidden) : [];
    const hiddenPassed = hidden.filter((t) => by[t.id] && by[t.id].pass).length;
    const samplePassed = samples.filter((s) => s.outcome && s.outcome.pass).length;
    const totalPassed = samplePassed + hiddenPassed; const totalTests = samples.length + hidden.length;
    p.result = { mode, res, samples, hiddenPassed, hiddenTotal: hidden.length, totalPassed, totalTests, allPass: totalPassed === totalTests && (res.phase || 'done') === 'done' };
    if (mode === 'submit') {
      if (p.result.allPass) toast('Chúc mừng! Bạn đã vượt qua tất cả test case!', 'success');
      else toast(`Chưa đạt: bạn đã đúng ${totalPassed}/${totalTests} test case.`, 'danger');
    } else {
      toast(`Chạy thử hoàn tất: ${samplePassed}/${samples.length} test mẫu đạt.`);
    }
  } catch (e) {
    toast((e && e.message) || 'Lỗi khi chạy code xem trước.', 'danger');
  } finally {
    p.running = false; pvView.bump();
  }
}

function ChallengePreview({ c, l }) {
  pvView.useStore();
  if (CC().onInput) CC().onInput('tp', pvInput);
  const p = pvLoad(c, l); const code = l.code; const r = p.result;
  const hints = (code.hints || []).filter((h) => String(h).trim());
  const samples = (code.tests || []).filter((t) => !t.hidden).slice(0, 2);
  const logs = (r && r.res && r.res.logs) || [];
  return (
    <div className="stack-4" data-cp-workspace="te-preview">
      <div className="row-between">
        <div className="stack-1">
          <Link className="small" to={`/teach/courses/${c.id}/code/${l.id}`}><Icon name="arrow-left" className="icon-sm" /> Quay lại trình soạn thảo bài code</Link>
          <span className="row" style={{ gap: 8 }}><h1>Xem trước trải nghiệm học viên</h1><span className="badge badge-accent">Chế độ mô phỏng học viên</span></span>
          <p className="small muted">Khoá học: <strong>{c.title}</strong> • Bài học: <strong>{l.title}</strong></p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pvReset(l)} disabled={p.running}><Icon name="rotate-ccw" className="icon-sm" /> Khôi phục code ban đầu</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pvExecute(l, 'run')} disabled={p.running} aria-busy={p.running ? 'true' : undefined}>{p.running ? null : <Icon name="play" className="icon-sm" />} Chạy thử (Sample tests)</button>
          <button type="button" className="btn btn-primary btn-sm" data-cp-run="" onClick={() => pvExecute(l, 'submit')} disabled={p.running} aria-busy={p.running ? 'true' : undefined}>{p.running ? null : <Icon name="send" className="icon-sm" />} Nộp bài (Tất cả tests)</button>
        </div>
      </div>
      <div className="lai-preview">
        <section className="card"><div className="card-body stack-3">
          <div className="segmented" role="tablist" aria-label="Đề bài và gợi ý">
            <button type="button" role="tab" aria-selected={p.side === 'brief'} onClick={() => { p.side = 'brief'; pvView.bump(); }}><Icon name="file-text" className="icon-sm" /> Đề bài &amp; Yêu cầu</button>
            <button type="button" role="tab" aria-selected={p.side === 'hints'} onClick={() => { p.side = 'hints'; pvView.bump(); }}><Icon name="help-circle" className="icon-sm" /> Gợi ý ({hints.length})</button>
          </div>
          <div className="stack-1"><h2 className="tc-h">{l.title}</h2><p className="xsmall muted">Ngôn ngữ: <strong>JavaScript</strong> • Thời lượng: {l.durationMin || 15} phút</p></div>
          {p.side === 'brief' ? (
            <div className="stack-3">
              <div className="stack-2"><h3 className="small strong">Các bước thực hiện</h3>
                <ol className="small lai-steps">{(code.instructions || []).map((s, i) => <li key={i}><Md text={s} /></li>)}</ol></div>
              {samples.length ? (
                <div className="stack-2"><h3 className="small strong">Ví dụ mẫu</h3>
                  {samples.map((t) => (
                    <div key={t.id} className="lai-sample mono xsmall"><div><span className="muted">Đầu vào: </span>{t.call}</div><div><span className="muted">Kỳ vọng: </span><strong>{toText(t.expected)}</strong></div></div>
                  ))}</div>
              ) : null}
            </div>
          ) : hints.length ? (
            <div className="stack-2">{hints.map((h, i) => <Alert key={i} type="info" icon="help-circle" title={`Gợi ý #${i + 1}`} body={h} />)}</div>
          ) : <p className="small muted lai-empty-run">Bài tập này chưa có gợi ý đính kèm.</p>}
        </div></section>
        <div className="stack-3">
          {codeEditor({ id: 'tp-code', key: 'tp:code', value: p.code, fileName: code.fileName || 'solution.js', language: 'javascript', label: 'Code của bạn', minRows: 14, maxRows: 24, readonly: p.running })}
          <section className="card"><div className="card-body stack-3">
            <div className="row-between">
              <div className="tabs" role="tablist">
                <button type="button" className="tab" role="tab" aria-selected={p.resTab === 'tests'} onClick={() => { p.resTab = 'tests'; pvView.bump(); }}>Kết quả kiểm thử{r ? ` ${r.totalPassed}/${r.totalTests}` : ''}</button>
                <button type="button" className="tab" role="tab" aria-selected={p.resTab === 'console'} onClick={() => { p.resTab = 'console'; pvView.bump(); }}>Console Log{logs.length ? ` (${logs.length})` : ''}</button>
              </div>
              {r ? <span className={`badge ${r.allPass ? 'badge-success' : 'badge-danger'}`}>{r.allPass ? '100% ĐẠT' : 'CHƯA ĐẠT'}</span> : null}
            </div>
            {p.resTab === 'tests' ? (
              !r ? <p className="small muted lai-empty-run">Bấm <strong>&quot;Chạy thử&quot;</strong> để kiểm tra test mẫu hoặc <strong>&quot;Nộp bài&quot;</strong> để kiểm tra toàn bộ.</p> : (
                <div className="stack-2">
                  <div className="row-between"><span className="small strong" role="status"><Icon name={r.allPass ? 'check-circle' : 'alert-circle'} className="icon-sm" /> Tổng kết: {r.totalPassed}/{r.totalTests} test đạt</span>
                    <span className="xsmall muted">{r.mode === 'submit' ? 'Chế độ Nộp bài' : 'Chế độ Chạy thử'}</span></div>
                  <ul className="cp-tests">{r.samples.map(({ test, outcome }) => <Fragment key={test.id}>{CC().testRow ? CC().testRow({ id: test.id, name: test.name, call: test.call }, outcome) : null}</Fragment>)}</ul>
                  {r.mode === 'submit' && r.hiddenTotal > 0 ? (
                    <div className="lai-hidden-card">
                      <Icon name="lock" />
                      <div className="stack-1"><span className="small strong">Bộ test case ẩn ({r.hiddenPassed}/{r.hiddenTotal} đạt)</span>
                        <span className="xsmall muted">Chi tiết test case ẩn được bảo mật đúng như trải nghiệm thực tế của học viên.</span></div>
                      <span className={`badge ${r.hiddenPassed === r.hiddenTotal ? 'badge-success' : 'badge-warn'}`}>{r.hiddenPassed === r.hiddenTotal ? 'Đạt hết' : 'Chưa đạt'}</span>
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              logs.length && CC().consoleView ? CC().consoleView(r.res) : <p className="small muted lai-empty-run">Không có đầu ra console log.</p>
            )}
          </div></section>
        </div>
      </div>
    </div>
  );
}

export function CodePreviewPage({ params }) {
  useCodi();
  const c = Codi.course(params.courseId);
  if (!isMine(c)) return notMine();
  const l = Codi.lesson(c, params.lessonId);
  if (!l || !l.code) return notMine();
  if (l.code.kind !== 'tutorial') return shell('/teach/courses', <ChallengePreview c={c} l={l} />);
  // Guided tutorials (port-only lesson kind) reuse the learner player.
  return shell('/teach/courses', (
    <div className="stack-4">
      <Link className="small" to={`/teach/courses/${c.id}/code/${l.id}`}><Icon name="arrow-left" className="icon-sm" /> Quay lại trình soạn thảo bài code</Link>
      <Alert type="info" title="Xem như học viên" body="Bạn thử bài đúng như học viên thấy. Lượt chạy của giảng viên không tính vào số liệu Tiến độ học viên." />
      <h1>{l.title}</h1>
      {CC().view ? CC().view(c, l) : null}
    </div>
  ));
}
