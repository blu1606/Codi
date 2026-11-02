/**
 * Six-box OTP input — port of the real app's components/otp-input.tsx: 2-minute validity with a visible
 * countdown, expired state ("Mã OTP đã hết hạn (2 phút)") that disables the boxes, resend allowed after 30 s,
 * resend clears the code and refocuses box 1, paste fills all boxes, Backspace walks back.
 *
 * Controlled: value / onChange. onResend may return false (or a promise of false) when sending failed, which keeps
 * the current timer. onDeadline(ms) reports the expiry timestamp so the caller can reject a late submit.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/ui/primitives';
import { OTP_RESEND_AFTER_S, OTP_TTL_S } from './account-store';

const fmtTime = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

export default function OtpInput({ length = 6, value, onChange, onResend, disabled = false, expiresInSeconds = OTP_TTL_S, autoFocus = false, error = null, onDeadline }) {
  const [deadline, setDeadline] = useState(() => Date.now() + expiresInSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const boxes = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const timeLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = timeLeft === 0;

  useEffect(() => { if (onDeadline) onDeadline(deadline); }, [deadline]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (expired) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expired, deadline]);
  useEffect(() => { if (autoFocus && boxes.current[0]) boxes.current[0].focus(); }, [autoFocus]);

  const focusAt = (i) => { const el = boxes.current[Math.max(0, Math.min(length - 1, i))]; if (el) el.focus(); };
  const onInput = (i, raw) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) { const next = digits.slice(); next[i] = ''; onChange(next.join('')); return; }
    if (clean.length > 1) { const pasted = clean.slice(0, length); onChange(pasted); focusAt(pasted.length); return; }
    const next = digits.slice(); next[i] = clean[0]; onChange(next.join(''));
    if (i < length - 1) focusAt(i + 1);
  };
  const onKeyDown = (i, e) => { if (e.key === 'Backspace' && !digits[i] && i > 0) focusAt(i - 1); };
  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (pasted) { onChange(pasted); focusAt(pasted.length); }
  };
  const resend = async () => {
    if (!onResend || resending) return;
    setResending(true);
    try {
      const sent = await onResend();
      if (sent === false) return;
      const d = Date.now() + expiresInSeconds * 1000;
      setDeadline(d); setNow(Date.now());
      onChange('');
      setTimeout(() => focusAt(0), 0);
    } finally {
      setResending(false);
    }
  };
  const resendLocked = resending || (!expired && timeLeft > expiresInSeconds - OTP_RESEND_AFTER_S);

  return (
    <div className="stack-3">
      <div className={`otp shell-otp ${error ? 'is-invalid' : ''}`} role="group" aria-label="Mã xác thực 6 số">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { boxes.current[i] = el; }} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            aria-label={`Chữ số ${i + 1} của mã xác thực`} autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'otp-error' : undefined}
            value={d} disabled={disabled || expired} onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()} />
        ))}
      </div>
      {error && <p id="otp-error" className="field-error shell-otp-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{error}</span></p>}
      <div className="row-between shell-otp-meta">
        <span className={`row ${expired ? 'text-danger' : ''}`} style={{ gap: 6 }}>
          <Icon name="clock" className="icon-sm" />
          {expired
            ? <strong>Mã OTP đã hết hạn (2 phút)</strong>
            : <span>Mã còn hiệu lực trong: <strong className="mono">{fmtTime(timeLeft)}</strong></span>}
        </span>
        {onResend && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={resendLocked}>
            <Icon name="refresh" className={`icon-sm ${resending ? 'shell-spin' : ''}`} />{resending ? 'Đang gửi...' : 'Gửi lại mã'}
          </button>
        )}
      </div>
      <p className="xsmall muted">Mã đúng trong bản thử nghiệm: 123456 · 000000 = mã hết hạn.</p>
    </div>
  );
}
