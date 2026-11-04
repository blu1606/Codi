/**
 * S11h: a private question to the course lecturer, pre-filled from the Tutor thread (port of Codi develop's
 * components/ai-tutor/tutor-escalate-dialog.tsx). openEscalate({ lecturerName, defaultText, hasCode, failingTest, send })
 * opens it in a modal; send(values) posts it and throws an Error with the message to show on failure.
 */
import { useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert } from '../../components/ui/primitives';
import { ESCALATE_MIN } from './tutor-contract';

function EscalateForm({ handle, lecturerName, defaultText, hasCode, failingTest, send }) {
  const [text, setText] = useState(defaultText);
  const [withCode, setWithCode] = useState(hasCode);
  const [withTest, setWithTest] = useState(!!failingTest);
  const [withSummary, setWithSummary] = useState(true);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const tooShort = text.trim().length < ESCALATE_MIN;
  const options = [
    hasCode && { key: 'code', label: 'Code hiện tại của bạn', checked: withCode, set: setWithCode },
    failingTest && { key: 'test', label: `Test chưa đạt: ${failingTest}`, checked: withTest, set: setWithTest },
    { key: 'summary', label: 'Tóm tắt trao đổi với AI trợ lý', checked: withSummary, set: setWithSummary },
  ].filter(Boolean);
  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || pending) return;
    setPending(true);
    setError(null);
    try {
      await send({ text: text.trim(), withCode, withTest, withSummary });
      handle.close();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Chưa gửi được câu hỏi. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="stack-4" noValidate onSubmit={onSubmit}>
      <p className="small muted">Chỉ bạn và {lecturerName || 'giảng viên của khoá'} xem được cuộc trao đổi này.</p>
      <div className={`field ${touched && tooShort ? 'is-invalid' : ''}`.trim()}>
        <label htmlFor="tc-escalate-text">Câu hỏi của bạn</label>
        <textarea id="tc-escalate-text" rows={4} maxLength={4000} value={text} disabled={pending}
          aria-invalid={touched && tooShort ? 'true' : undefined} aria-describedby="tc-escalate-help"
          onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} />
        <span id="tc-escalate-help" className={touched && tooShort ? 'field-error' : 'field-help'}>
          {touched && tooShort ? `Câu hỏi cần ít nhất ${ESCALATE_MIN} ký tự để giảng viên hiểu rõ.` : `Ít nhất ${ESCALATE_MIN} ký tự.`}
        </span>
      </div>
      <fieldset className="stack-1">
        <legend className="small"><strong>Gửi kèm</strong></legend>
        {options.map((o) => (
          <label key={o.key} className="check"><input type="checkbox" checked={o.checked} disabled={pending} onChange={(e) => o.set(e.target.checked)} /> {o.label}</label>
        ))}
      </fieldset>
      {error ? <Alert type="danger" body={error} /> : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => handle.close()}>Huỷ</button>
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending || undefined}>Gửi cho giảng viên</button>
      </div>
    </form>
  );
}

export function openEscalate(props) {
  Codi.ui.modal({ title: 'Hỏi riêng giảng viên', body: (handle) => <EscalateForm handle={handle} {...props} /> });
}
