// "Gợi ý bằng AI" / "Viết lại bằng AI" under a course-information field. Suggest reads the course's lessons; rewrite
// polishes the lecturer's own text. The result is a preview the lecturer accepts or discards — never auto-applied.
// Backend: POST /api/lecturer/courses/:courseId/ai-write.
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../components/ui/primitives';

export function AiAssist({ courseId, field, value, title, level, onApply, disabled }) {
  const [st, setSt] = useState({ state: 'idle', text: '', error: '', mode: 'suggest' });
  const ctrl = useRef(null);
  const run = async (mode) => {
    if (ctrl.current) ctrl.current.abort();
    ctrl.current = new AbortController();
    setSt({ state: 'loading', text: '', error: '', mode });
    try {
      const r = await api.post(`/api/lecturer/courses/${encodeURIComponent(courseId)}/ai-write`, { field, mode, text: value, title, level }, { signal: ctrl.current.signal });
      setSt({ state: 'done', text: r.text, error: '', mode });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      setSt({ state: 'error', text: '', error: (e && e.message) || 'AI chưa viết được. Thử lại.', mode });
    }
  };
  const stop = () => { if (ctrl.current) ctrl.current.abort(); setSt((s) => ({ ...s, state: 'idle' })); };
  const busy = st.state === 'loading';
  return (
    <div className="stack-2 ai-assist">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || busy} onClick={() => run('suggest')} title="AI đọc nội dung các bài học của khoá để viết">
          <Icon name="sparkles" className="icon-sm" /> Gợi ý bằng AI</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || busy || !String(value || '').trim()} onClick={() => run('rewrite')} title="AI viết lại nội dung bạn đã nhập cho rõ và gọn hơn">
          <Icon name="refresh" className="icon-sm" /> Viết lại bằng AI</button>
        {busy && <span className="small muted row" role="status" style={{ gap: 6 }}><Icon name="loader" className="icon-sm" />{st.mode === 'suggest' ? 'AI đang đọc các bài học…' : 'AI đang viết lại…'}
          <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Dừng</button></span>}
      </div>
      {st.state === 'error' && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{st.error}</span></p>}
      {st.state === 'done' && (
        <div className="panel stack-2 ai-assist-preview" role="region" aria-label="Gợi ý của AI">
          <span className="xsmall muted"><Icon name="sparkles" className="icon-sm" /> {st.mode === 'suggest' ? 'Gợi ý dựa trên nội dung bài học' : 'Bản viết lại'} — xem lại trước khi dùng</span>
          <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{st.text}</div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply(st.text); setSt({ state: 'idle', text: '', error: '', mode: 'suggest' }); }}>Dùng gợi ý này</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(st.mode)}>Tạo lại</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSt({ state: 'idle', text: '', error: '', mode: 'suggest' })}>Bỏ</button>
          </div>
        </div>
      )}
    </div>
  );
}
