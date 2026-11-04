/**
 * Cloudflare Turnstile challenge for the sign-up form. Loads Cloudflare's script once (explicit render), draws the
 * widget and reports the token through onToken (null when it expires or errors). Remount it with a new `key` to get a
 * fresh challenge: a token is single-use, so a rejected sign-up needs a new one.
 *
 *   <TurnstileWidget siteKey={Codi.turnstileSiteKey} onToken={setToken} />
 */
import { useEffect, useRef } from 'react';
import { Codi } from '../../lib/codi';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoad = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      script.onerror = () => { scriptLoad = null; script.remove(); reject(new Error('turnstile load failed')); };
      document.head.appendChild(script);
    });
  }
  return scriptLoad;
}

export default function TurnstileWidget({ siteKey, onToken }) {
  const box = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId = null;
    let cancelled = false;
    loadTurnstile().then((turnstile) => {
      if (cancelled || !box.current) return;
      widgetId = turnstile.render(box.current, {
        sitekey: siteKey,
        language: 'vi',
        theme: Codi.state.scenario.theme === 'dark' ? 'dark' : 'light',
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    }).catch(() => {
      if (!cancelled) Codi.ui.toast('Không tải được captcha. Kiểm tra mạng rồi tải lại trang.', { type: 'danger' });
    });
    return () => {
      cancelled = true;
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={box} className="turnstile-box" />;
}
