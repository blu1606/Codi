/**
 * S08–S09 Onboarding ('/learn/:courseId/onboarding'), port of real app/learn/[courseId]/onboarding/*.
 * Goal (one question per screen, choices stay local until the last step; leaving midway offers to keep a draft),
 * start fork, diagnostic (answers saved after each choice, resumable), result (BKT, D16), ready screen.
 * Data: GET/POST /api/learn/:courseId/onboarding (OnboardingView); every transition is a server command.
 * The real app has no GitHub level suggestion in onboarding, so none is shown here: the level step only offers a quiet
 * "Kết nối GitHub" entry (account step /onboarding/github, returning to this step) or notes that a saved skill profile
 * exists. The learner still picks the level and the entry test decides the starting point.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Alert, Icon, Mastery } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { GOALS, HOURS, LEVELS, errorText, invalidateOverview, learnBase, postOnboarding } from './learning-store';
import { LoadState } from './learning-shared';
import { api } from '../../lib/api';

/** Real masteryLevel from a BKT probability (null = no evidence). */
const levelOfP = (p) => (p == null ? 0 : p < 0.4 ? 1 : p < 0.6 ? 2 : p < 0.85 ? 3 : 4);

/** Level-step GitHub entry. Keeps the unsaved choices as a server draft so the learner returns to the same step. */
function GithubEntry({ step, draft, send, courseId }) {
  const g = Codi.github;
  const uid = Codi.state.currentUserId;
  if (!g || !uid || typeof g.stateFor !== 'function' || typeof g.onboardingHref !== 'function') return null;
  const s = g.stateFor(uid);
  if (s.hasProfile) {
    return (
      <p className="small muted ln-gh-entry"><Icon name="link" className="icon-sm" />
        <span>Hồ sơ năng lực đã lưu (ước tính từ GitHub). Bạn vẫn tự chọn trình độ; bài kiểm tra đầu vào quyết định điểm bắt đầu. <Link to="/profile?tab=nang-luc">Xem hồ sơ năng lực</Link></span></p>
    );
  }
  const open = async () => {
    if (await send({ type: 'goal-save-draft', step, draft })) Codi.go(g.onboardingHref(`/learn/${courseId}/onboarding`));
  };
  return (
    <p className="small muted ln-gh-entry"><Icon name="link" className="icon-sm" />
      <span>Có code trên GitHub? <button type="button" className="btn-link" onClick={open}>{s.linked ? 'Phân tích GitHub' : 'Kết nối GitHub'}</button> để Codi hiểu bạn nhanh hơn. Không bắt buộc.</span></p>
  );
}

const PROMPTS = ['Bạn muốn đạt được gì với khoá học này?', 'Bạn đang ở mức nào với chủ đề này?', 'Mỗi tuần bạn dành được bao nhiêu thời gian?'];
const KEYS = ['goal', 'level', 'hours'];

function Steps({ value, total, label }) {
  return (
    <div className="stack-2"><span className="small muted">{label}</span>
      <div className="progress-segments" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < value ? 'done' : ''} />)}</div></div>
  );
}

function GoalStep({ data, busy, send }) {
  const e = data.enrollment;
  const courseId = data.course.id;
  const [step, setStep] = useState(e.goalStep || 0);
  const [draft, setDraft] = useState(() => ({ ...(e.goalDraft || {}) }));
  const [leaveTo, setLeaveTo] = useState(null);
  const dirty = step !== (e.goalStep || 0) || JSON.stringify(draft) !== JSON.stringify(e.goalDraft || {});
  // Leave guard: an in-app link click while the choices are unsaved asks to keep them as a draft.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      ev.preventDefault(); ev.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    const onUnload = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('beforeunload', onUnload); };
  }, [dirty]);
  const leave = async (keep) => {
    const to = leaveTo;
    const saved = keep ? await send({ type: 'goal-save-draft', step, draft }) : !e.goalEditing || await send({ type: 'goal-cancel' });
    setLeaveTo(null);
    if (saved) Codi.go(to);
  };
  const choices = step === 0 ? GOALS : step === 1 ? LEVELS : HOURS.map((h) => [h, `${h} giờ mỗi tuần`, null]);
  const selected = draft[KEYS[step]];
  const pick = (v) => setDraft((d) => ({ ...d, [KEYS[step]]: v }));
  const cancelEdit = async () => { if (await send({ type: 'goal-cancel' })) Codi.go('/learn/' + courseId); };
  const next = async () => {
    if (step < 2) { setStep(step + 1); return; }
    const { goal, level, hours } = draft;
    if (!goal || !level || !hours) return;
    const editing = e.goalEditing;
    if (await send({ type: 'goal-commit', draft: { goal, level, hours } }) && editing) {
      // A goal edit is newer explicit intent: the path is regenerated (Q39).
      Codi.ui.toast('Đã lưu mục tiêu. Codi đang xếp lại lộ trình.', { type: 'success' });
      Codi.go('/learn/' + courseId);
    }
  };
  return (
    <div className="page page-focus stack-6">
      <Steps value={step + 1} total={3} label={`${e.goalEditing ? 'Chỉnh mục tiêu' : 'Thiết lập lộ trình'} · Bước ${step + 1}/3`} />
      <div className="stack-2"><h1 tabIndex={-1}>{PROMPTS[step]}</h1><p className="muted">{data.course.title}</p></div>
      <fieldset className="choice-list ln-fieldset" disabled={busy}><legend className="sr-only">{PROMPTS[step]}</legend>{choices.map(([v, t, s]) => (
        <label key={v} className={`choice ${selected === v ? 'is-selected' : ''}`}><input type="radio" name="goal-choice" checked={selected === v} onChange={() => pick(v)} />
          <span className="choice-body"><span className="choice-title">{t}</span>{s && <span className="choice-desc">{s}</span>}</span>
          {selected === v && <Icon name="check" className="text-accent" />}</label>
      ))}</fieldset>
      {step === 1 && <GithubEntry step={step} draft={draft} send={send} courseId={courseId} />}
      <div className="row-between ln-wrap">
        {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={busy}>Quay lại</button> : <span />}
        <div className="row ln-wrap" style={{ gap: 'var(--space-2)' }}>
          {e.goalEditing
            ? <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={busy}>Huỷ chỉnh sửa</button>
            : <button type="button" className="btn btn-secondary" onClick={() => send({ type: 'goal-skip' })} disabled={busy}>Bỏ qua</button>}
          <button type="button" className="btn btn-primary" onClick={next} disabled={busy || selected === undefined} aria-busy={busy || undefined}>{step === 2 && e.goalEditing ? 'Lưu và xếp lại lộ trình' : step === 2 ? 'Lưu mục tiêu' : 'Tiếp tục'}</button></div>
      </div>
      <Modal open={leaveTo !== null} onClose={() => setLeaveTo(null)} title="Lưu lựa chọn trước khi rời đi?"
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setLeaveTo(null)}>Ở lại</button><button type="button" className="btn btn-secondary" onClick={() => leave(false)} disabled={busy}>Bỏ thay đổi</button><button type="button" className="btn btn-primary" onClick={() => leave(true)} disabled={busy}>Lưu nháp</button></>}>
        <p className="muted">{e.goalEditing
          ? 'Mục tiêu đang dùng chưa thay đổi. Lưu nháp để lần sau tiếp tục chỉnh từ bước này; bỏ thay đổi để giữ nguyên mục tiêu cũ.'
          : 'Mục tiêu chưa được lưu. Lưu nháp để lần sau tiếp tục từ bước này; bỏ thay đổi để xoá các lựa chọn vừa chọn.'}</p>
      </Modal>
    </div>
  );
}

// S08b: choose between default order or diagnostic path
function StartFork({ busy, send, courseId }) {
  const chooseDefault = async () => { if (await send({ type: 'fork-default' })) Codi.go('/learn/' + courseId); };
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><h1>Bạn muốn học như thế nào?</h1><p className="muted">Hai cách bắt đầu — chọn một và bạn có thể thay đổi sau.</p></div>
      {/* Both cards share one structure: the badge sits out of flow, the note + button sit on a common bottom line. */}
      <div className="grid-2 choice-fork">
        <div className="choice-card">
          <span className="choice-card-icon"><Icon name="list" /></span>
          <span className="choice-card-title">Học từ bài 1</span>
          <span className="choice-card-desc">Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình.</span>
          <div className="choice-card-foot">
            <span className="choice-card-note">Tất cả bài đều mở, cần tiên quyết</span>
            <button type="button" className="btn btn-secondary" onClick={chooseDefault} disabled={busy}>Học từ bài 1</button>
          </div>
        </div>
        <div className="choice-card is-recommended">
          <span className="badge badge-accent choice-card-badge">Khuyến nghị</span>
          <span className="choice-card-icon"><Icon name="sparkles" /></span>
          <span className="choice-card-title">Tìm điểm bắt đầu của tôi</span>
          <span className="choice-card-desc">~10 phút, giúp bỏ qua phần bạn đã biết.</span>
          <div className="choice-card-foot">
            <span className="choice-card-note">Codi xếp lộ trình riêng cho bạn</span>
            <button type="button" className="btn btn-primary" onClick={() => send({ type: 'fork-diagnostic' })} disabled={busy}>Tìm điểm bắt đầu của tôi</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagIntro({ data, busy, send, resume, onResume }) {
  const e = data.enrollment;
  const questions = (data.diagnostic && data.diagnostic.questions) || [];
  const hasQs = questions.length > 0;
  const start = async () => { if (await send({ type: 'diagnostic-start' })) onResume(); };
  const postpone = async () => { if (await send({ type: 'diagnostic-postpone' })) Codi.go('/learn/' + data.course.id); };
  return (
    <div className="page page-focus stack-6">
      {hasQs ? (
        <div className="stack-2"><span className="small muted">Bài kiểm tra đầu vào</span><h1>Giúp Codi xếp lộ trình phù hợp với bạn</h1>
          <p className="muted">Kết quả cho biết bạn đã nắm những khái niệm nào để bỏ qua phần đã biết và tập trung vào phần còn thiếu.</p></div>
      ) : <h1>Sẵn sàng bắt đầu</h1>}
      {hasQs ? (
        <>
          <ul className="ln-facts">
            <li><Icon name="list" className="text-accent" /><span>{questions.length} câu hỏi trắc nghiệm</span></li>
            <li><Icon name="clock" className="text-accent" /><span>Khoảng {Math.ceil(questions.length * 0.75)} phút, không giới hạn thời gian</span></li>
            <li><Icon name="shield" className="text-accent" /><span>Không tính điểm. Chưa biết thì chọn “Tôi chưa biết”.</span></li>
          </ul>
          {resume && <Alert type="info" title={`Bạn đang làm dở ở câu ${e.diagnosticQuestionIndex + 1}`} body="Các câu đã trả lời vẫn được giữ." />}
          <div><button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={busy} aria-busy={busy || undefined}>{resume ? `Tiếp tục từ câu ${e.diagnosticQuestionIndex + 1}` : 'Bắt đầu làm bài'} <Icon name="arrow-right" /></button></div>
        </>
      ) : <Alert type="info" title="Khoá học này chưa có bài kiểm tra đầu vào" body="Bạn sẽ học theo thứ tự mặc định của khoá học." />}
      {e.diagnosticStatus === 'intro' && (
        <div className="stack-2">
          <div><button type="button" className={`btn ${hasQs ? 'btn-secondary' : 'btn-primary'}`} onClick={postpone} disabled={busy}>{hasQs ? 'Để sau' : 'Xem lộ trình'}</button></div>
          <p className="small muted">Để sau giữ lộ trình AI hiện có; nếu chưa có, bạn học theo thứ tự mặc định và có thể làm bài kiểm tra sau.</p>
        </div>
      )}
    </div>
  );
}

function DiagQuestion({ data, busy, pending, send, retry }) {
  const e = data.enrollment;
  const qs = (data.diagnostic && data.diagnostic.questions) || [];
  const q = qs[e.diagnosticQuestionIndex];
  const attemptId = data.attemptId;
  if (!q || !attemptId) {
    return <div className="page page-focus"><Alert type="warn" body="Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại để tiếp tục." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Tải lại</button>} /></div>;
  }
  const a = data.answers.find((x) => x.questionId === q.id);
  const isPicked = (optionId) => !!a && (optionId === null ? a.unknown : !a.unknown && a.optionId === optionId);
  const answer = (optionId) => send({ type: 'answer', attemptId, questionId: q.id, optionId, unknown: optionId === null });
  const last = e.diagnosticQuestionIndex === qs.length - 1;
  return (
    <div className="page page-focus stack-6">
      <Steps value={data.answers.length} total={qs.length} label={`Câu ${e.diagnosticQuestionIndex + 1}/${qs.length}`} />
      <p className="small muted">Không tính điểm · không giới hạn thời gian · câu trả lời được lưu sau mỗi lựa chọn</p>
      <h1 className="ln-question" tabIndex={-1}>{q.text}</h1>
      {q.codeSnippet && <pre className="ln-code"><code>{q.codeSnippet}</code></pre>}
      <fieldset className="choice-list ln-fieldset" disabled={busy}><legend className="sr-only">Các lựa chọn</legend>
        {q.options.map((o) => (
          <label key={o.id} className={`choice ${isPicked(o.id) ? 'is-selected' : ''}`}><input type="radio" name={`diag-${q.id}`} value={o.id} checked={isPicked(o.id)} onChange={() => answer(o.id)} /><span className="choice-body"><span className="choice-title">{o.text}</span></span></label>
        ))}
        <label className={`choice ${isPicked(null) ? 'is-selected' : ''}`}><input type="radio" name={`diag-${q.id}`} value="unknown" checked={isPicked(null)} onChange={() => answer(null)} /><span className="choice-body"><span className="choice-title">Tôi chưa biết</span><span className="choice-desc">Được ghi nhận riêng, không tính là sai</span></span></label>
      </fieldset>
      <div className="row-between">
        <button type="button" className="btn btn-secondary" onClick={() => send({ type: 'previous', attemptId, questionId: q.id })} disabled={busy || e.diagnosticQuestionIndex === 0}>Câu trước</button>
        {last
          ? <button type="button" className="btn btn-primary" onClick={() => send({ type: 'submit', attemptId })} disabled={busy || !a} aria-busy={pending === 'submit' || undefined}>{pending === 'submit' ? 'Đang nộp bài…' : 'Xem kết quả'}</button>
          : <button type="button" className="btn btn-primary" onClick={() => send({ type: 'next', attemptId, questionId: q.id })} disabled={busy || !a}>Câu tiếp theo</button>}
      </div>
      <Link className="small muted" to="/dashboard">Lưu và tiếp tục sau</Link>
    </div>
  );
}

function DiagResult({ data, busy, send }) {
  const e = data.enrollment;
  const result = data.result;
  const courseId = data.course.id;
  const concepts = result.concepts.map((k) => ({ ...k, level: levelOfP(k.evidenceCount ? k.probability : null) }));
  const strengths = concepts.filter((k) => k.level >= 3);
  const gaps = concepts.filter((k) => k.level <= 1);
  const makePath = async () => {
    if (data.canRequestPath && e.pathStatus !== 'generating') { if (await send({ type: 'request-path' })) Codi.go('/learn/' + courseId); }
    else Codi.go('/learn/' + courseId);
  };
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><span className="small muted">Kết quả bài kiểm tra đầu vào</span><h1 tabIndex={-1}>Codi đã hiểu điểm xuất phát của bạn</h1></div>
      <div className="grid-3">
        <div className="stat-tile"><span className="stat-value">{result.right}</span><span className="stat-label">Đúng</span></div>
        <div className="stat-tile"><span className="stat-value">{result.wrong}</span><span className="stat-label">Sai</span></div>
        <div className="stat-tile"><span className="stat-value">{result.unknown}</span><span className="stat-label">Chưa biết</span></div>
      </div>
      <section className="card"><div className="card-body stack-3"><h2 className="ln-h">Mức thành thạo hiện tại theo khái niệm</h2>
        {concepts.length
          ? <ul className="list">{concepts.map((k) => <li key={k.id} className="list-row" style={{ paddingInline: 0 }}><span className="list-main strong">{k.name}</span><Mastery level={k.level} /></li>)}</ul>
          : <p className="small muted">Bài kiểm tra chưa được liên kết với khái niệm. Bạn vẫn có thể tiếp tục học.</p>}</div></section>
      <div className="grid-2">
        <div className="panel stack-2"><strong>Điểm mạnh</strong>{strengths.length ? <ul>{strengths.map((k) => <li key={k.id}>{k.name}</li>)}</ul> : <p className="small muted">Chưa có khái niệm ở mức Thành thạo.</p>}</div>
        <div className="panel stack-2"><strong>Cần tập trung</strong>{gaps.length ? <ul>{gaps.map((k) => <li key={k.id}>{k.name}</li>)}</ul> : <p className="small muted">Không có lỗ hổng lớn.</p>}</div>
      </div>
      <div><button type="button" className="btn btn-primary btn-lg" onClick={makePath} disabled={busy} aria-busy={busy || undefined}>Xem lộ trình của tôi</button></div>
    </div>
  );
}

function ReadyScreen({ data, busy, send }) {
  const e = data.enrollment;
  const edit = async () => {
    const res = await Codi.ui.confirm({ title: 'Chỉnh mục tiêu học tập?', consequence: 'Sau khi lưu, Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu' });
    if (res.ok) send({ type: 'goal-edit' });
  };
  const generating = e.pathStatus === 'generating';
  const hasQs = !!(data.diagnostic && data.diagnostic.questions.length);
  return (
    <div className="page page-focus stack-6">
      <div className="stack-2"><h1 tabIndex={-1}>{generating ? 'Codi đang xếp lộ trình cho bạn…' : 'Lộ trình đã sẵn sàng'}</h1><p className="muted">{data.course.title}</p></div>
      <Alert type="info" title={generating ? 'Yêu cầu xếp lộ trình đã được lưu' : e.pathSource === 'ai' ? 'Đã giữ lộ trình cá nhân hoá của bạn' : 'Bạn đang học theo thứ tự mặc định'}
        body={generating ? 'Bạn có thể rời trang; mục tiêu, kết quả và bài đã hoàn thành vẫn được giữ.' : 'Điều kiện tiên quyết vẫn áp dụng. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào.'} />
      <div className="row ln-wrap">
        <Link className="btn btn-primary" to={`/learn/${data.course.id}`}>Mở lộ trình <Icon name="arrow-right" /></Link>
        <button type="button" className="btn btn-secondary" onClick={edit} disabled={busy}>Chỉnh mục tiêu</button>
        {['skipped', 'done'].includes(e.diagnosticStatus) && hasQs && <button type="button" className="btn btn-secondary" onClick={() => send({ type: 'diagnostic-retake' })} disabled={busy}>Làm bài kiểm tra đầu vào</button>}
      </div>
      <p className="small muted row ln-top"><Icon name="help-circle" className="icon-sm" /><span>Làm bài kiểm tra muộn không đặt lại bài học đã hoàn thành hoặc điểm số.</span></p>
    </div>
  );
}

export default function OnboardingPage({ params, query }) {
  const courseId = params.courseId;
  const endpoint = `${learnBase(courseId)}/onboarding`;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [resume, setResume] = useState(false);
  const [explicitResult, setExplicitResult] = useState(!!(query && query.view === 'result'));
  const [tick, setTick] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    api.get(endpoint)
      .then((body) => { if (!live) return; setData(body); setResume(body.enrollment.diagnosticStatus === 'in-progress'); setLoadError(null); setError(null); })
      .catch((e) => { if (live) setLoadError(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [endpoint, tick]);

  /** Sends one onboarding command; resolves true when the server accepted it. */
  const send = useCallback(async (command) => {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true); setPending(command.type); setError(null);
    try {
      const body = await postOnboarding(courseId, command);
      setData(body);
      if (command.type === 'submit') setExplicitResult(true);
      else if (['request-path', 'diagnostic-retake', 'goal-cancel'].includes(command.type)) setExplicitResult(false);
      invalidateOverview();
      if (command.type !== 'answer') requestAnimationFrame(() => { const h = document.querySelector('#app-main h1'); if (h) h.focus(); });
      return true;
    } catch (e) {
      setError(errorText(e, 'Không thể lưu. Vui lòng thử lại.'));
      return false;
    } finally {
      submitting.current = false;
      setBusy(false); setPending(null);
    }
  }, [courseId]);
  const retry = () => { setLoading(true); setTick((n) => n + 1); };

  if (!data) return <LoadState loading={loading} error={loadError} courseId={courseId} onRetry={retry} text="Đang tải thiết lập của bạn…" />;
  const e = data.enrollment;
  const errorBox = error && (
    <div className="page page-focus" style={{ paddingBottom: 0 }}>
      <Alert type="danger" title="Chưa thể tiếp tục" body={error} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry} disabled={busy}>Tải lại</button>} />
    </div>
  );
  const screen = { data, busy, send };
  let body;
  if (!e.goalSet || e.goalEditing) body = <GoalStep key={e.goalEditing ? 'edit' : 'new'} {...screen} />;
  else if (e.diagnosticStatus === 'fork') body = <StartFork {...screen} courseId={courseId} />;
  else if (e.diagnosticStatus === 'intro' || (e.diagnosticStatus === 'in-progress' && resume)) body = <DiagIntro {...screen} resume={resume} onResume={() => setResume(false)} />;
  else if (e.diagnosticStatus === 'in-progress') body = <DiagQuestion {...screen} pending={pending} retry={retry} />;
  else if (e.diagnosticStatus === 'done' && data.result && (e.pathStatus === 'none' || explicitResult)) body = <DiagResult {...screen} />;
  else body = <ReadyScreen {...screen} />;
  return <>{errorBox}{body}</>;
}
