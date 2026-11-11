// "Hội đồng AI" (War Room) for one lesson: '/teach/courses/:courseId/warroom/:lessonId'. Ported from the DRE War Room:
// the council (Cô Lam, Bo, Trí, Linh Chi, Minh Khang) reads the lesson transcript or reading text and streams each
// turn live; the lecturer reviews and edits the draft checkpoints, then applies them to the lesson. Backend:
// /api/lecturer/courses/:courseId/lessons/:lessonId/council (GET overview, POST stream, DELETE checkpoints),
// /council/:runId (GET run), /council/:runId/apply (POST).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Alert, Icon } from '../../components/ui/primitives';
import { shell, notMine, Loading, LoadError } from './teach-api';
import { CLASSMATES, ClassmateAvatar } from '../classroom/avatars';
import { councilApi } from '../classroom/classroom-api';
import { RichText } from '../classroom/rich-text';
import '../classroom/classroom.css';
import './war-room.css';

const COUNCIL = ['colam', 'bo', 'tri', 'linhchi', 'minhkhang'];
const PHASES = [
  { id: 'source', label: 'Đọc bài' },
  { id: 'moments', label: 'Chọn mốc' },
  { id: 'trap', label: 'Gài bẫy' },
  { id: 'crosscheck', label: 'Rà soát chéo' },
  { id: 'notes', label: 'Ghi chú' },
  { id: 'question', label: 'Soạn câu hỏi' },
  { id: 'final', label: 'Thẩm định' },
];
const ROLE_IN_COUNCIL = { colam: 'Chủ trì, chọn mốc', bo: 'Gài bẫy ngộ nhận', tri: 'Rà soát chéo', linhchi: 'Gợi ý bậc thang', minhkhang: 'Ví dụ đời thường' };
const STATUS = { running: ['badge-info', 'Đang họp'], completed: ['badge-accent', 'Có bản nháp'], applied: ['badge-success', 'Đã áp dụng'], failed: ['badge-danger', 'Thất bại'] };
const clock = (s) => { const t = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const parseClock = (v) => {
  const m = String(v).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$|^(\d+)$/);
  if (!m) return null;
  if (m[4] !== undefined) return Number(m[4]);
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
};
const when = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
let keySeq = 0;
// Editable copy of a draft; _k keeps each card's inputs attached to it when another card is removed.
const editable = (list) => list.map((c) => ({ ...c, misconception: { ...c.misconception }, _k: (keySeq += 1) }));
const sourceLabel = (s) => (s.kind === 'transcript' ? `Transcript video · ${s.cues} câu thoại` : s.kind === 'body' ? `Bài đọc · ${s.chars.toLocaleString('vi-VN')} ký tự` : 'Chưa có nội dung');

export function WarRoomPage({ params }) {
  useCodi();
  const { courseId, lessonId } = params;
  const overview = useApi(councilApi.url(courseId, lessonId));
  if (!overview.data) {
    if (overview.error && (overview.error.status === 403 || overview.error.status === 404)) return notMine();
    return shell('/teach/courses', overview.error ? <LoadError error={overview.error} onRetry={overview.reload} /> : <Loading rows={4} label="Đang mở phòng họp…" />);
  }
  return <WarRoom courseId={courseId} lessonId={lessonId} overview={overview} />;
}

function WarRoom({ courseId, lessonId, overview }) {
  const o = overview.data;
  const [count, setCount] = useState(2);
  const [run, setRun] = useState(null); // { id, status, events[], draft, error }
  const [streaming, setStreaming] = useState(false);
  const [startError, setStartError] = useState(null);
  const [draft, setDraft] = useState(null); // editable copy of run.draft.checkpoints
  const [applying, setApplying] = useState(false);
  const ctrl = useRef(null);

  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);

  const loadRun = async (runId) => {
    try {
      const res = await councilApi.run(courseId, lessonId, runId);
      setRun(res.run);
      setDraft(res.run.draft ? editable(res.run.draft.checkpoints) : null);
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
    }
  };

  const convene = async () => {
    if (streaming) return;
    setStartError(null);
    setDraft(null);
    setRun({ id: null, status: 'running', events: [], draft: null, error: null });
    setStreaming(true);
    const c = new AbortController();
    ctrl.current = c;
    let runId = null;
    let ended = false;
    try {
      await councilApi.stream(courseId, lessonId, {
        count, signal: c.signal,
        onData: (msg) => {
          if (msg.type === 'run') { runId = msg.runId; setRun((r) => ({ ...r, id: msg.runId })); }
          else if (msg.type === 'event') setRun((r) => ({ ...r, events: [...r.events, msg.event] }));
          else if (msg.type === 'draft') {
            ended = true;
            setRun((r) => ({ ...r, status: 'completed', draft: msg.draft }));
            setDraft(editable(msg.draft.checkpoints));
          } else if (msg.type === 'error') { ended = true; setRun((r) => ({ ...r, status: 'failed', error: msg.error })); }
        },
      });
      // The stream can drop (network, server restart) while the run goes on or ends server-side: read the saved run.
      if (!ended && runId && !c.signal.aborted) await loadRun(runId);
    } catch (e) {
      setRun(null);
      setStartError(e);
    } finally {
      setStreaming(false);
      ctrl.current = null;
      overview.reload();
    }
  };

  const stopWatching = () => { if (ctrl.current) ctrl.current.abort(); };

  const apply = async () => {
    if (!run || !run.id || !draft || !draft.length) return;
    const issue = validateDraft(draft);
    if (issue) { Codi.ui.toast(issue, { type: 'danger' }); return; }
    const r = await Codi.ui.confirm({
      title: 'Áp dụng điểm dừng cho bài học?',
      consequence: o.checkpoints.length
        ? `${draft.length} điểm dừng mới sẽ thay ${o.checkpoints.length} điểm dừng hiện có. Phần thảo luận của học viên ở các điểm dừng cũ sẽ bị xoá.`
        : `Video bài "${o.lesson.title}" sẽ dừng ở ${draft.length} mốc để học viên trả lời và tranh luận với Bo.`,
      reversible: 'Bạn có thể gỡ hoặc áp dụng bản nháp khác bất cứ lúc nào.', confirmLabel: 'Áp dụng',
    });
    if (!r.ok) return;
    setApplying(true);
    try {
      const next = await councilApi.apply(courseId, lessonId, run.id, draft.map(({ _k, ...c }) => c));
      overview.setData(next);
      setRun((x) => ({ ...x, status: 'applied' }));
      Codi.ui.toast(`Đã áp dụng ${next.checkpoints.length} điểm dừng cho bài học.`, { type: 'success' });
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
    } finally {
      setApplying(false);
    }
  };

  const clearAll = async () => {
    const r = await Codi.ui.confirm({
      title: 'Gỡ tất cả điểm dừng?',
      consequence: `Video bài "${o.lesson.title}" sẽ không dừng nữa và phần thảo luận của học viên ở các điểm dừng này bị xoá.`,
      reversible: 'Bạn có thể áp dụng lại một bản nháp của hội đồng.', confirmLabel: 'Gỡ điểm dừng', danger: true,
    });
    if (!r.ok) return;
    try { overview.setData(await councilApi.clear(courseId, lessonId)); Codi.ui.toast('Đã gỡ các điểm dừng.'); } catch (e) { Codi.ui.toast(e.message, { type: 'danger' }); }
  };

  const ro = o.readOnly;
  const noSource = o.source.kind === 'none';
  return shell('/teach/courses', <>
    <div className="stack-2 wr-head">
      <Link className="small" to={`/teach/courses/${courseId}/content`}><Icon name="arrow-left" className="icon-sm" /> Quay lại khoá học: {o.course.title}</Link>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h1>Hội đồng AI: {o.lesson.title}</h1>
        {ro && <span className="badge badge-warn">Đang chờ duyệt — Chỉ đọc</span>}
      </div>
      <p className="small muted wr-intro">Năm nhân vật AI đọc bài giảng, chọn mốc dừng video, gài bẫy ngộ nhận và rà soát chéo lẫn nhau. Kết quả là bản nháp: học viên chỉ thấy điểm dừng sau khi bạn duyệt và áp dụng.</p>
    </div>

    <div className="wr-grid">
      <div className="stack-4">
        <section className="card" aria-labelledby="wr-convene">
          <div className="card-body stack-3">
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="stack-1">
                <h2 id="wr-convene" className="wr-h2">Triệu tập hội đồng</h2>
                <p className="small muted row" style={{ gap: 6 }}><Icon name={o.source.kind === 'transcript' ? 'video' : 'file-text'} className="icon-sm" />
                  {sourceLabel(o.source)}{o.source.durationSeconds ? ` · video ${clock(o.source.durationSeconds)}` : ''}</p>
              </div>
              <div className="row wr-controls">
                <label className="small strong" htmlFor="wr-count">Số điểm dừng</label>
                <select id="wr-count" className="select wr-count" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={streaming || ro}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {streaming
                  ? <button type="button" className="btn btn-secondary" onClick={stopWatching}><Icon name="eye-off" className="icon-sm" /> Ngừng theo dõi</button>
                  : <button type="button" className="btn btn-primary" onClick={convene} disabled={ro || noSource}><Icon name="users" className="icon-sm" /> Triệu tập hội đồng</button>}
              </div>
            </div>
            {noSource && <Alert type="warn" title="Chưa có gì để hội đồng đọc" body="Bài học cần transcript video hoặc nội dung bài đọc. Thêm nội dung trong mục Chi tiết bài học rồi quay lại." />}
            {!noSource && !o.source.hasVideo && <Alert type="info" body="Bài học chưa có video: mốc dừng được ước lượng theo vị trí trong bài đọc và học viên sẽ mở điểm dừng từ danh sách." />}
            {o.source.kind === 'body' && o.source.hasVideo && <Alert type="info" body="Video chưa có transcript: hội đồng đọc bài đọc và ước lượng mốc dừng, hãy kiểm tra lại mốc thời gian trước khi áp dụng." />}
            {startError && <Alert type="danger" title="Không triệu tập được hội đồng" body={startError.message}
              actions={<button type="button" className="btn btn-secondary btn-sm" onClick={convene}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />}
            {streaming && <p className="small muted" role="status">Hội đồng đang họp, mỗi lượt nói hiện ngay khi xong. Nếu rời trang, phiên họp vẫn chạy và được lưu lại.</p>}
          </div>
        </section>

        {run && <CouncilLog run={run} streaming={streaming} />}
        {run && run.status === 'failed' && !streaming && (
          <Alert type="danger" title="Hội đồng chưa có bản nháp" body={run.error || 'Phiên họp thất bại.'}
            actions={!ro && !noSource ? <button type="button" className="btn btn-secondary btn-sm" onClick={convene}><Icon name="refresh" className="icon-sm" /> Họp lại</button> : null} />
        )}
        {draft && run && (
          <DraftEditor draft={draft} setDraft={setDraft} summary={run.draft && run.draft.summary} ro={ro} applying={applying} onApply={apply}
            applied={run.status === 'applied'} duration={o.source.durationSeconds} />
        )}
      </div>

      <aside className="stack-4" aria-label="Điểm dừng và lịch sử họp">
        <section className="card" aria-labelledby="wr-applied">
          <div className="card-body stack-3">
            <div className="row-between"><h2 id="wr-applied" className="wr-h2">Đang áp dụng</h2><span className="badge badge-neutral">{o.checkpoints.length} điểm dừng</span></div>
            {o.checkpoints.length === 0
              ? <p className="small muted">Video của bài này chưa dừng ở đâu. Áp dụng một bản nháp của hội đồng để bật lớp học AI.</p>
              : <ol className="wr-applied">{o.checkpoints.map((c) => (
                  <li key={c.id}><span className="mono strong">{clock(c.timestampSeconds)}</span><span className="small">{c.concept}</span></li>))}</ol>}
            {o.checkpoints.length > 0 && !ro && <button type="button" className="btn btn-danger-outline btn-sm" onClick={clearAll}><Icon name="trash" className="icon-sm" /> Gỡ tất cả điểm dừng</button>}
          </div>
        </section>
        <section className="card" aria-labelledby="wr-runs">
          <div className="card-body stack-3">
            <h2 id="wr-runs" className="wr-h2">Các phiên họp gần đây</h2>
            {o.runs.length === 0 ? <p className="small muted">Chưa có phiên họp nào.</p> : (
              <ul className="wr-runs">
                {o.runs.map((r) => {
                  const [cls, label] = STATUS[r.status] || ['badge-neutral', r.status];
                  return (
                    <li key={r.id}>
                      <button type="button" className={`wr-run ${run && run.id === r.id ? 'is-active' : ''}`} onClick={() => loadRun(r.id)} disabled={streaming}>
                        <span className="small">{when(r.createdAt)}</span>
                        <span className={`badge ${cls}`}>{label}</span>
                        <span className="xsmall muted">{r.checkpointCount ? `${r.checkpointCount} điểm dừng` : r.error || ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </aside>
    </div>
  </>);
}

function CouncilLog({ run, streaming }) {
  const events = run.events;
  const last = events[events.length - 1];
  const reached = new Set(events.map((e) => e.phase));
  const current = streaming ? (last ? last.phase : 'source') : null;
  const speaking = streaming && last && COUNCIL.includes(last.agent) ? last.agent : null;
  const spoke = new Set(events.map((e) => e.agent));
  const [showThoughts, setShowThoughts] = useState(true);
  const end = useRef(null);
  useEffect(() => {
    if (streaming && end.current && typeof end.current.scrollIntoView === 'function') end.current.scrollIntoView({ block: 'nearest' });
  }, [events.length, streaming]);
  const visible = useMemo(() => events.filter((e) => showThoughts || e.kind !== 'thought'), [events, showThoughts]);

  return (
    <section className="card" aria-labelledby="wr-log">
      <div className="card-body stack-3">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 id="wr-log" className="wr-h2">Biên bản họp</h2>
          <label className="check wr-thoughts"><input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} /> Hiện suy nghĩ của từng nhân vật</label>
        </div>
        <ol className="wr-phases" aria-label="Tiến trình họp">
          {PHASES.map((p) => {
            const state = current === p.id ? 'current' : reached.has(p.id) ? 'done' : 'todo';
            return (
              <li key={p.id} className={`wr-phase is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <Icon name={state === 'done' ? 'check-circle' : state === 'current' ? 'loader' : 'circle'} className="icon-sm" />{p.label}
              </li>
            );
          })}
        </ol>
        <ul className="wr-agents" aria-label="Thành viên hội đồng">
          {COUNCIL.map((id) => (
            <li key={id} className={speaking === id ? 'is-speaking' : ''}>
              <ClassmateAvatar id={id} size={40} state={speaking === id ? 'speaking' : undefined} />
              <span className="stack-1"><span className="small strong">{CLASSMATES[id].name}</span>
                <span className="xsmall muted">{speaking === id ? 'Đang phát biểu' : spoke.has(id) ? ROLE_IN_COUNCIL[id] : 'Chờ lượt'}</span></span>
            </li>
          ))}
        </ul>
        <ol className="wr-log" aria-live="polite" aria-busy={streaming || undefined}>
          {events.length === 0 && streaming && <li className="small muted">Hội đồng đang mở tài liệu…</li>}
          {visible.map((e) => <LogEntry key={e.id} e={e} />)}
          <li ref={end} aria-hidden="true" />
        </ol>
      </div>
    </section>
  );
}

function LogEntry({ e }) {
  if (e.agent === 'system') {
    return <li className={`wr-sys ${e.kind === 'error' ? 'is-error' : ''}`}><Icon name={e.kind === 'error' ? 'alert-triangle' : 'info'} className="icon-sm" /><span>{e.text}</span></li>;
  }
  const meta = CLASSMATES[e.agent];
  const tag = e.kind === 'verdict' ? 'Phán quyết' : e.kind === 'checkpoint' ? 'Điểm dừng' : null;
  return (
    <li className={`wr-entry is-${e.kind}`}>
      <ClassmateAvatar id={e.agent} size={28} />
      <div className="wr-entry-body">
        <span className="cr-who">{meta ? meta.name : e.agent}{e.kind === 'thought' && <span className="xsmall muted">suy nghĩ</span>}{tag && <span className="badge badge-neutral">{tag}</span>}</span>
        <RichText text={e.text} className="cr-text" />
      </div>
    </li>
  );
}

function validateDraft(list) {
  for (const [i, c] of list.entries()) {
    const n = `Điểm dừng ${i + 1}`;
    if (!Number.isFinite(c.timestampSeconds) || c.timestampSeconds < 0) return `${n}: mốc thời gian không hợp lệ (dạng mm:ss).`;
    if (!c.question.trim()) return `${n}: hãy nhập câu hỏi.`;
    if (c.options) {
      if (c.options.length < 2 || c.options.some((x) => !x.trim())) return `${n}: mỗi phương án cần có nội dung.`;
      if (c.correctIndex === null || c.correctIndex >= c.options.length) return `${n}: hãy chọn đáp án đúng.`;
    }
    const m = c.misconception;
    if (![c.answerKey, c.keyIdea, m.boClaim, m.description, m.hint1, m.hint2].every((x) => String(x || '').trim())) return `${n}: các ô đáp án, ý then chốt, lời Bo và gợi ý không được để trống.`;
  }
  return null;
}

function DraftEditor({ draft, setDraft, summary, ro, applying, onApply, applied, duration }) {
  const update = (i, fn) => setDraft((list) => list.map((c, j) => (j === i ? fn({ ...c, misconception: { ...c.misconception } }) : c)));
  const remove = (i) => setDraft((list) => list.filter((_, j) => j !== i));
  return (
    <section className="card" aria-labelledby="wr-draft">
      <div className="card-body stack-4">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 id="wr-draft" className="wr-h2">Bản nháp điểm dừng ({draft.length})</h2>
          {applied && <span className="badge badge-success"><Icon name="check" /> Đã áp dụng</span>}
        </div>
        {summary && <div className="wr-summary"><ClassmateAvatar id="colam" size={28} /><RichText text={summary} className="cr-text" /></div>}
        {draft.length === 0 && <p className="small muted">Bạn đã bỏ hết điểm dừng trong bản nháp. Triệu tập lại hội đồng để có bản nháp mới.</p>}
        {draft.map((c, i) => (
          <fieldset key={c._k} className="wr-cp" disabled={ro || applying}>
            <legend className="wr-cp-title">Điểm dừng {i + 1} · {c.concept}</legend>
            <div className="wr-cp-row">
              <div className="field wr-time"><label htmlFor={`wr-t-${i}`}>Dừng ở (mm:ss)</label>
                <input id={`wr-t-${i}`} className="input mono" defaultValue={clock(c.timestampSeconds)}
                  onBlur={(e) => { const t = parseClock(e.target.value); update(i, (x) => ({ ...x, timestampSeconds: t === null ? NaN : t })); }} />
                {duration ? <p className="field-help">Video dài {clock(duration)}</p> : null}</div>
              <div className="field" style={{ flex: 1 }}><label htmlFor={`wr-q-${i}`}>Câu hỏi</label>
                <textarea id={`wr-q-${i}`} className="textarea" rows={3} value={c.question} maxLength={600} onChange={(e) => update(i, (x) => ({ ...x, question: e.target.value }))} /></div>
            </div>
            {c.options && (
              <div className="stack-2" role="radiogroup" aria-label={`Phương án của điểm dừng ${i + 1}, chọn đáp án đúng`}>
                <span className="field-label">Phương án (chọn đáp án đúng)</span>
                {c.options.map((opt, k) => (
                  <div key={k} className="wr-opt">
                    <input type="radio" name={`wr-correct-${i}`} id={`wr-c-${i}-${k}`} checked={c.correctIndex === k} onChange={() => update(i, (x) => ({ ...x, correctIndex: k }))} />
                    <label htmlFor={`wr-c-${i}-${k}`} className="sr-only">Phương án {String.fromCharCode(65 + k)} là đáp án đúng</label>
                    <input className="input" aria-label={`Phương án ${String.fromCharCode(65 + k)}`} value={opt} maxLength={240}
                      onChange={(e) => update(i, (x) => ({ ...x, options: x.options.map((o, j) => (j === k ? e.target.value : o)) }))} />
                  </div>
                ))}
              </div>
            )}
            <div className="wr-cp-grid">
              <Text label="Đáp án và giải thích" value={c.answerKey} max={1200} onChange={(v) => update(i, (x) => ({ ...x, answerKey: v }))} />
              <Text label="Ý then chốt Cô Lam chốt lại" value={c.keyIdea} max={600} onChange={(v) => update(i, (x) => ({ ...x, keyIdea: v }))} />
              <Text label="Lời gài bẫy của Bo" value={c.misconception.boClaim} max={400} onChange={(v) => update(i, (x) => { x.misconception.boClaim = v; return x; })} />
              <Text label="Ngộ nhận mà bẫy nhắm tới" value={c.misconception.description} max={400} onChange={(v) => update(i, (x) => { x.misconception.description = v; return x; })} />
              <Text label="Gợi ý cấp 1" value={c.misconception.hint1} max={400} onChange={(v) => update(i, (x) => { x.misconception.hint1 = v; return x; })} />
              <Text label="Gợi ý cấp 2" value={c.misconception.hint2} max={400} onChange={(v) => update(i, (x) => { x.misconception.hint2 = v; return x; })} />
            </div>
            {c.misconception.analogy && <p className="small muted row" style={{ gap: 6, alignItems: 'flex-start' }}><ClassmateAvatar id="minhkhang" size={22} /><span>{c.misconception.analogy}</span></p>}
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)}><Icon name="trash" className="icon-sm" /> Bỏ điểm dừng này</button></div>
          </fieldset>
        ))}
        {!ro && draft.length > 0 && (
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={onApply} disabled={applying} aria-busy={applying || undefined}>
              <Icon name="check-circle" className="icon-sm" /> {applied ? 'Áp dụng lại bản đã sửa' : 'Áp dụng cho bài học'}</button>
            <span className="small muted">Mốc dừng được sắp theo thời gian và cách nhau ít nhất 20 giây.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Text({ label, value, max, onChange }) {
  const id = useId();
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <textarea id={id} className="textarea wr-text" rows={2} value={value || ''} maxLength={max} onChange={(e) => onChange(e.target.value)} /></div>
  );
}
