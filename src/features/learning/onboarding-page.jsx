/**
 * S08–S09 Onboarding ('/learn/:courseId/onboarding'), port of real app/learn/[courseId]/onboarding/*.
 * Goal (one question per screen, choices stay local until the last step; leaving midway offers to keep a draft),
 * start fork, diagnostic (answers saved after each choice, resumable), result (BKT, D16), ready screen.
 * The real app has no GitHub level suggestion in onboarding, so none is shown here.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon, Mastery } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { GOALS, HOURS, LEVELS, applyObservations, conceptName, generatePath, rec, save } from './learning-store';
import { courseGuard } from './learning-shared';

const PROMPTS = ['Bạn muốn đạt được gì với khoá học này?', 'Bạn đang ở mức nào với chủ đề này?', 'Mỗi tuần bạn dành được bao nhiêu thời gian?'];
const KEYS = ['goal', 'level', 'hours'];

function Steps({ value, total, label }) {
  return (
    <div className="stack-2"><span className="small muted">{label}</span>
      <div className="progress-segments" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < value ? 'done' : ''} />)}</div></div>
  );
}

function GoalStep({ c, r }) {
  const [step, setStep] = useState(r.goalStep || 0);
  const [draft, setDraft] = useState(() => ({ ...(r.goalDraft || {}) }));
  const [leaveTo, setLeaveTo] = useState(null);
  const dirty = step !== (r.goalStep || 0) || JSON.stringify(draft) !== JSON.stringify(r.goalDraft || {});
  // Leave guard: an in-app link click while the choices are unsaved asks to keep them as a draft.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('beforeunload', onUnload); };
  }, [dirty]);
  const leave = (keep) => {
    const to = leaveTo; setLeaveTo(null);
    const rr = rec(c.id);
    if (keep) { rr.goalDraft = { ...draft }; rr.goalStep = step; }
    else if (rr.goalEditing) { rr.goalEditing = false; rr.goalDraft = {}; rr.goalStep = 0; }
    else { rr.goalDraft = {}; rr.goalStep = 0; }
    save(false);
    Codi.go(to);
  };
  const choices = step === 0 ? GOALS.map(([v, t, s]) => [v, t, s]) : step === 1 ? LEVELS.map(([v, t, s]) => [v, t, s]) : HOURS.map((h) => [h, `${h} giờ mỗi tuần`, null]);
  const selected = draft[KEYS[step]];
  const pick = (v) => setDraft((d) => ({ ...d, [KEYS[step]]: v }));
  const skip = () => {
    const rr = rec(c.id);
    rr.goal = { goal: GOALS[1][0], level: LEVELS[0][0], hours: HOURS[1] }; rr.goalDraft = {}; rr.goalStep = 0; rr.goalEditing = false;
    rr.diag.status = 'fork';
    save();
  };
  const cancelEdit = () => { const rr = rec(c.id); rr.goalEditing = false; rr.goalDraft = {}; rr.goalStep = 0; save(false); Codi.go('/learn/' + c.id); };
  const next = () => {
    if (step < 2) { setStep(step + 1); return; }
    const { goal, level, hours } = draft;
    if (!goal || !level || !hours) return;
    const rr = rec(c.id);
    rr.goal = { goal, level, hours }; rr.goalDraft = {}; rr.goalStep = 0;
    // A goal edit is newer explicit intent: it clears any applied adjustment before regenerating (Q39).
    if (rr.goalEditing) {
      rr.goalEditing = false; rr.adjustment = null;
      generatePath(c.id);
      Codi.go('/learn/' + c.id);
      Codi.ui.toast('Đã lưu mục tiêu. Codi đang xếp lại lộ trình.', { type: 'success' });
      return;
    }
    rr.diag.status = 'fork';
    save();
  };
  return (
    <div className="page page-focus stack-6">
      <Steps value={step + 1} total={3} label={`${r.goalEditing ? 'Chỉnh mục tiêu' : 'Thiết lập lộ trình'} · Bước ${step + 1}/3`} />
      <div className="stack-2"><h1 tabIndex={-1}>{PROMPTS[step]}</h1><p className="muted">{c.title}</p></div>
      <fieldset className="choice-list ln-fieldset"><legend className="sr-only">{PROMPTS[step]}</legend>{choices.map(([v, t, s]) => (
        <label key={v} className={`choice ${selected === v ? 'is-selected' : ''}`}><input type="radio" name="goal-choice" checked={selected === v} onChange={() => pick(v)} />
          <span className="choice-body"><span className="choice-title">{t}</span>{s && <span className="choice-desc">{s}</span>}</span>
          {selected === v && <Icon name="check" className="text-accent" />}</label>
      ))}</fieldset>
      <div className="row-between ln-wrap">
        {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Quay lại</button> : <span />}
        <div className="row ln-wrap" style={{ gap: 'var(--space-2)' }}>
          {r.goalEditing ? <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Huỷ chỉnh sửa</button> : <button type="button" className="btn btn-secondary" onClick={skip}>Bỏ qua</button>}
          <button type="button" className="btn btn-primary" onClick={next} disabled={selected === undefined}>{step === 2 && r.goalEditing ? 'Lưu và xếp lại lộ trình' : step === 2 ? 'Lưu mục tiêu' : 'Tiếp tục'}</button></div>
      </div>
      <Modal open={leaveTo !== null} onClose={() => setLeaveTo(null)} title="Lưu lựa chọn trước khi rời đi?"
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setLeaveTo(null)}>Ở lại</button><button type="button" className="btn btn-secondary" onClick={() => leave(false)}>Bỏ thay đổi</button><button type="button" className="btn btn-primary" onClick={() => leave(true)}>Lưu nháp</button></>}>
        <p className="muted">{r.goalEditing
          ? 'Mục tiêu đang dùng chưa thay đổi. Lưu nháp để lần sau tiếp tục chỉnh từ bước này; bỏ thay đổi để giữ nguyên mục tiêu cũ.'
          : 'Mục tiêu chưa được lưu. Lưu nháp để lần sau tiếp tục từ bước này; bỏ thay đổi để xoá các lựa chọn vừa chọn.'}</p>
      </Modal>
    </div>
  );
}

// S08b: choose between default order or diagnostic path
function StartFork({ c, r }) {
  const chooseDefault = () => {
    r.diag.status = 'skipped'; r.pathStatus = 'ready'; r.pathSource = 'default';
    r.order = c.defaultOrder.slice(); r.skippable = []; r.adjustment = null;
    save(false); Codi.go('/learn/' + c.id);
  };
  const chooseDiagnostic = () => {
    r.diag.status = 'intro'; r.diag.index = 0; r.diag.answers = {};
    save(false); Codi.go('/learn/' + c.id + '/onboarding?view=intro');
  };
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><h1>Bạn muốn học như thế nào?</h1><p className="muted">Hai cách bắt đầu — chọn một và bạn có thể thay đổi sau.</p></div>
      <div className="grid-2 stack-3">
        <div className="choice-card">
          <span className="choice-card-icon"><Icon name="list" /></span>
          <span className="choice-card-title">Học từ bài 1</span>
          <span className="choice-card-desc">Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình.</span>
          <span className="choice-card-note">Tất cả bài đều mở, cần tiên quyết</span>
          <button type="button" className="btn btn-secondary" onClick={chooseDefault}>Học từ bài 1</button>
        </div>
        <div className="choice-card is-recommended">
          <span className="badge badge-accent" style={{ alignSelf: 'start' }}>Khuyến nghị</span>
          <span className="choice-card-icon"><Icon name="sparkles" /></span>
          <span className="choice-card-title">Tìm điểm bắt đầu của tôi</span>
          <span className="choice-card-desc">~10 phút, giúp bỏ qua phần bạn đã biết.</span>
          <span className="choice-card-note">Codi xếp lộ trình riêng cho bạn</span>
          <button type="button" className="btn btn-primary" onClick={chooseDiagnostic}>Tìm điểm bắt đầu của tôi</button>
        </div>
      </div>
    </div>
  );
}

// "Để sau" keeps an existing AI path; without one the learner studies in the default order.
function postponeDiagnostic(c, r) {
  if (r.pathStatus === 'ready' && r.pathSource === 'ai') { r.diag.status = r.diag.prevStatus || 'done'; save(false); Codi.go('/learn/' + c.id); return; }
  r.diag.status = 'skipped'; r.pathStatus = 'ready'; r.pathSource = 'default'; r.order = c.defaultOrder.slice(); r.skippable = []; r.adjustment = null;
  save(false); Codi.go('/learn/' + c.id);
}

function DiagIntro({ c, r, resume, onResume }) {
  const test = c.entryTest;
  const hasQs = !!(test && test.questions.length);
  const start = () => {
    if (resume && onResume) { onResume(); return; }
    r.diag.status = 'in-progress'; save(false); Codi.go('/learn/' + c.id + '/onboarding');
  };
  return (
    <div className="page page-focus stack-6">
      {hasQs ? (
        <div className="stack-2"><span className="small muted">Bài kiểm tra đầu vào</span><h1>Giúp Codi xếp lộ trình phù hợp với bạn</h1>
          <p className="muted">Kết quả cho biết bạn đã nắm những khái niệm nào để bỏ qua phần đã biết và tập trung vào phần còn thiếu.</p></div>
      ) : <h1>Sẵn sàng bắt đầu</h1>}
      {hasQs ? (
        <>
          <ul className="ln-facts">
            <li><Icon name="list" className="text-accent" /><span>{test.questions.length} câu hỏi trắc nghiệm</span></li>
            <li><Icon name="clock" className="text-accent" /><span>Khoảng {Math.ceil(test.questions.length * 0.75)} phút, không giới hạn thời gian</span></li>
            <li><Icon name="shield" className="text-accent" /><span>Không tính điểm. Chưa biết thì chọn “Tôi chưa biết”.</span></li>
          </ul>
          {resume && <Alert type="info" title={`Bạn đang làm dở ở câu ${r.diag.index + 1}`} body="Các câu đã trả lời vẫn được giữ." />}
          <div><button type="button" className="btn btn-primary btn-lg" onClick={start}>{resume ? `Tiếp tục từ câu ${r.diag.index + 1}` : 'Bắt đầu làm bài'} <Icon name="arrow-right" /></button></div>
        </>
      ) : <Alert type="info" title="Khoá học này chưa có bài kiểm tra đầu vào" body="Bạn sẽ học theo thứ tự mặc định của khoá học." />}
      {r.diag.status === 'intro' && (
        <div className="stack-2">
          <div><button type="button" className={`btn ${hasQs ? 'btn-secondary' : 'btn-primary'}`} onClick={() => postponeDiagnostic(c, r)}>{hasQs ? 'Để sau' : 'Xem lộ trình'}</button></div>
          <p className="small muted">Để sau giữ lộ trình AI hiện có; nếu chưa có, bạn học theo thứ tự mặc định và có thể làm bài kiểm tra sau.</p>
        </div>
      )}
    </div>
  );
}

function DiagQuestion({ c, r }) {
  const qs = c.entryTest.questions;
  const i = Math.min(r.diag.index, qs.length - 1);
  const q = qs[i];
  if (!q) {
    return <div className="page page-focus"><Alert type="warn" body="Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại để tiếp tục." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => { r.diag.index = 0; save(); }}>Tải lại</button>} /></div>;
  }
  const a = r.diag.answers[q.id];
  const answered = qs.filter((x) => r.diag.answers[x.id] !== undefined).length;
  const answer = (value) => { r.diag.answers[q.id] = value === 'unknown' ? 'unknown' : Number(value); save(); };
  const prev = () => { r.diag.index = Math.max(0, r.diag.index - 1); save(); };
  const next = () => {
    if (r.diag.index < qs.length - 1) { r.diag.index += 1; save(); return; }
    // BKT (D16): each answered question is one observation for its concept; "Tôi chưa biết" gives no evidence.
    const obs = qs.filter((x) => r.diag.answers[x.id] !== undefined && r.diag.answers[x.id] !== 'unknown')
      .map((x) => ({ conceptId: x.conceptId, correct: r.diag.answers[x.id] === x.correctIndex }));
    applyObservations(c, r, obs);
    const tested = Array.from(new Set(qs.map((x) => x.conceptId)));
    r.diagMastery = Object.fromEntries(tested.map((k) => [k, r.mastery[k] || 0]));
    r.diag.status = 'done';
    save(false); Codi.go('/learn/' + c.id + '/onboarding?view=result');
  };
  return (
    <div className="page page-focus stack-6">
      <Steps value={answered} total={qs.length} label={`Câu ${i + 1}/${qs.length}`} />
      <p className="small muted">Không tính điểm · không giới hạn thời gian · câu trả lời được lưu sau mỗi lựa chọn</p>
      <h1 className="ln-question" tabIndex={-1}>{q.text}</h1>
      {q.codeSnippet && <pre className="ln-code"><code>{q.codeSnippet}</code></pre>}
      <fieldset className="choice-list ln-fieldset"><legend className="sr-only">Các lựa chọn</legend>
        {q.options.map((o, k) => (
          <label key={k} className={`choice ${a === k ? 'is-selected' : ''}`}><input type="radio" name={`diag-${q.id}`} value={k} checked={a === k} onChange={() => answer(k)} /><span className="choice-body"><span className="choice-title">{o}</span></span></label>
        ))}
        <label className={`choice ${a === 'unknown' ? 'is-selected' : ''}`}><input type="radio" name={`diag-${q.id}`} value="unknown" checked={a === 'unknown'} onChange={() => answer('unknown')} /><span className="choice-body"><span className="choice-title">Tôi chưa biết</span><span className="choice-desc">Được ghi nhận riêng, không tính là sai</span></span></label>
      </fieldset>
      <div className="row-between">
        <button type="button" className="btn btn-secondary" onClick={prev} disabled={i === 0}>Câu trước</button>
        <button type="button" className="btn btn-primary" onClick={next} disabled={a === undefined}>{i === qs.length - 1 ? 'Xem kết quả' : 'Câu tiếp theo'}</button>
      </div>
      <Link className="small muted" to="/dashboard">Lưu và tiếp tục sau</Link>
    </div>
  );
}

function DiagResult({ c, r }) {
  const qs = c.entryTest.questions;
  let right = 0; let wrong = 0; let unknown = 0;
  qs.forEach((q) => { const a = r.diag.answers[q.id]; if (a === 'unknown' || a === undefined) unknown++; else if (a === q.correctIndex) right++; else wrong++; });
  const tested = Array.from(new Set(qs.map((q) => q.conceptId)));
  const strengths = tested.filter((id) => (r.mastery[id] || 0) >= 3);
  const gaps = tested.filter((id) => (r.mastery[id] || 0) <= 1);
  const makePath = () => { if (r.pathStatus !== 'generating') generatePath(c.id); Codi.go('/learn/' + c.id); };
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><span className="small muted">Kết quả bài kiểm tra đầu vào</span><h1 tabIndex={-1}>Codi đã hiểu điểm xuất phát của bạn</h1></div>
      <div className="grid-3">
        <div className="stat-tile"><span className="stat-value">{right}</span><span className="stat-label">Đúng</span></div>
        <div className="stat-tile"><span className="stat-value">{wrong}</span><span className="stat-label">Sai</span></div>
        <div className="stat-tile"><span className="stat-value">{unknown}</span><span className="stat-label">Chưa biết</span></div>
      </div>
      <section className="card"><div className="card-body stack-3"><h2 className="ln-h">Mức thành thạo hiện tại theo khái niệm</h2>
        {tested.length
          ? <ul className="list">{tested.map((id) => <li key={id} className="list-row" style={{ paddingInline: 0 }}><span className="list-main strong">{conceptName(c, id)}</span><Mastery level={r.mastery[id] || 0} /></li>)}</ul>
          : <p className="small muted">Bài kiểm tra chưa được liên kết với khái niệm. Bạn vẫn có thể tiếp tục học.</p>}</div></section>
      <div className="grid-2">
        <div className="panel stack-2"><strong>Điểm mạnh</strong>{strengths.length ? <ul>{strengths.map((id) => <li key={id}>{conceptName(c, id)}</li>)}</ul> : <p className="small muted">Chưa có khái niệm ở mức Thành thạo.</p>}</div>
        <div className="panel stack-2"><strong>Cần tập trung</strong>{gaps.length ? <ul>{gaps.map((id) => <li key={id}>{conceptName(c, id)}</li>)}</ul> : <p className="small muted">Không có lỗ hổng lớn.</p>}</div>
      </div>
      <div><button type="button" className="btn btn-primary btn-lg" onClick={makePath}>Xem lộ trình của tôi</button></div>
    </div>
  );
}

function ReadyScreen({ c, r }) {
  const edit = async () => {
    const res = await Codi.ui.confirm({ title: 'Chỉnh mục tiêu học tập?', consequence: 'Sau khi lưu, Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu' });
    if (!res.ok) return;
    r.goalEditing = true; r.goalStep = 0; r.goalDraft = { ...r.goal }; save();
  };
  const retake = () => { r.diag = { ...r.diag, prevStatus: r.diag.status, status: 'intro', index: 0, answers: {} }; save(false); Codi.go('/learn/' + c.id + '/onboarding?view=intro'); };
  const generating = r.pathStatus === 'generating';
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><h1 tabIndex={-1}>{generating ? 'Codi đang xếp lộ trình cho bạn…' : 'Lộ trình đã sẵn sàng'}</h1><p className="muted">{c.title}</p></div>
      <Alert type="info" title={generating ? 'Yêu cầu xếp lộ trình đã được lưu' : r.pathSource === 'ai' ? 'Đã giữ lộ trình cá nhân hoá của bạn' : 'Bạn đang học theo thứ tự mặc định'}
        body={generating ? 'Bạn có thể rời trang; mục tiêu, kết quả và bài đã hoàn thành vẫn được giữ.' : 'Điều kiện tiên quyết vẫn áp dụng. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào.'} />
      <div className="row ln-wrap">
        <Link className="btn btn-primary" to={`/learn/${c.id}`}>Mở lộ trình <Icon name="arrow-right" /></Link>
        <button type="button" className="btn btn-secondary" onClick={edit}>Chỉnh mục tiêu</button>
        {['skipped', 'done'].includes(r.diag.status) && c.entryTest && c.entryTest.questions.length > 0 && <button type="button" className="btn btn-secondary" onClick={retake}>Làm bài kiểm tra đầu vào</button>}
      </div>
      <p className="small muted row ln-top"><Icon name="help-circle" className="icon-sm" /><span>Làm bài kiểm tra muộn không đặt lại bài học đã hoàn thành hoặc điểm số.</span></p>
    </div>
  );
}

export default function OnboardingPage({ params, query }) {
  useCodi();
  const c = Codi.course(params.courseId);
  const enrolled = !!c && Codi.isEnrolled(c.id);
  const r0 = enrolled ? rec(c.id) : null;
  // Resume prompt shows once per visit when a diagnostic is in progress (real "resume").
  const [resume, setResume] = useState(() => !!(r0 && r0.diag.status === 'in-progress'));
  const guard = courseGuard(c);
  if (guard) return guard;
  const r = r0;
  const view = query && query.view;
  const hasQs = !!(c.entryTest && c.entryTest.questions.length);
  if (!r.goal || r.goalEditing) return <GoalStep key={r.goalEditing ? 'edit' : 'new'} c={c} r={r} />;
  if (r.diag.status === 'fork') return <StartFork c={c} r={r} />;
  if (r.diag.status === 'intro') return <DiagIntro c={c} r={r} resume={false} />;
  if (r.diag.status === 'in-progress' && hasQs && resume) return <DiagIntro c={c} r={r} resume onResume={() => setResume(false)} />;
  if (r.diag.status === 'in-progress' && hasQs) return <DiagQuestion c={c} r={r} />;
  if (r.diag.status === 'done' && hasQs && (r.pathStatus === 'none' || view === 'result')) return <DiagResult c={c} r={r} />;
  if (r.pathStatus === 'none') return <DiagIntro c={c} r={r} resume={false} />;
  return <ReadyScreen c={c} r={r} />;
}

