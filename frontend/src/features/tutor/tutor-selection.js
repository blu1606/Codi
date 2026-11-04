/**
 * S11a' selection toolbar (port of Codi develop's components/ai-tutor/tutor-selection-toolbar.tsx): selecting lesson
 * text or code in a lesson shows a small toolbar that opens the Tutor with that selection, and maybe a question.
 * Text: Giải thích · Cho ví dụ · Hỏi thêm; code: Giải thích đoạn này · Vì sao lỗi?. Escape, scrolling or a new
 * selection hides it. Only shown while the lesson's Tutor tab is mounted; never for text inside the Tutor itself.
 */
import { Codi } from '../../lib/codi';
import { CONTEXT_LIMITS } from './tutor-contract';
import { tutorStore } from './tutor-store';

const ACTIONS = {
  code: [['Giải thích đoạn này', 'Giải thích giúp mình đoạn code này.'], ['Vì sao lỗi?', 'Vì sao đoạn code này bị lỗi hoặc cho kết quả sai?']],
  text: [['Giải thích', 'Giải thích giúp mình đoạn này.'], ['Cho ví dụ', 'Cho mình một ví dụ khác về đoạn này.'], ['Hỏi thêm', '']],
};
const lessonRoute = () => {
  const m = /^\/learn\/([^/?]+)\/([^/?]+)/.exec(window.location.pathname || '');
  return m && m[2] !== 'tutor' && m[2] !== 'onboarding' ? { courseId: decodeURIComponent(m[1]), lessonId: decodeURIComponent(m[2]) } : null;
};

let selected = '';
let bar = null;
function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'tc-seltool';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Hỏi AI về đoạn đã chọn');
  bar.hidden = true;
  bar.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection while clicking
  bar.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    const at = lessonRoute();
    if (!button || !at || !selected) return;
    const text = selected;
    hide();
    Codi.tutor.open(at.courseId, at.lessonId, { selection: text, ...(button.dataset.ask ? { ask: button.dataset.ask } : {}) });
  });
  document.body.appendChild(bar);
  return bar;
}
function hide() { if (bar) bar.hidden = true; selected = ''; }
function paint(kind) {
  const el = ensureBar();
  el.textContent = '';
  ACTIONS[kind].forEach(([label, ask], n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${n === 0 ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    b.textContent = label;
    b.dataset.ask = ask;
    el.appendChild(b);
  });
}

function read(event) {
  const at = lessonRoute();
  if (!at || !tutorStore.hosts(at.lessonId)) { hide(); return; }
  const active = document.activeElement;
  let text = '';
  let rect = null;
  let kind = 'text';
  if (active && active.classList && active.classList.contains('cp-textarea') && active.selectionEnd > active.selectionStart) {
    text = active.value.slice(active.selectionStart, active.selectionEnd);
    kind = 'code';
    const box = active.getBoundingClientRect();
    rect = event && event.clientX ? { left: event.clientX, top: event.clientY - 12 } : { left: box.left + 80, top: box.top };
  } else {
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    if (host && host.closest('#app-main') && !host.closest('.tc-panel, .tc-seltool, .overlay, input, textarea, button, [role="dialog"]')) {
      text = sel.toString();
      const box = sel.getRangeAt(0).getBoundingClientRect();
      rect = { left: box.left + box.width / 2, top: box.top };
    }
  }
  text = text.trim();
  if (text.length < 3 || !rect) { hide(); return; }
  selected = text.slice(0, CONTEXT_LIMITS.selection);
  paint(kind);
  const el = ensureBar();
  el.hidden = false;
  const width = el.offsetWidth || 270;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left - width / 2))}px`;
  el.style.top = `${Math.max(8, rect.top - 52)}px`;
}

if (typeof document !== 'undefined') {
  const up = (e) => { if (!bar || !bar.contains(e.target)) setTimeout(() => read(e instanceof MouseEvent ? e : null), 0); };
  document.addEventListener('mouseup', up);
  document.addEventListener('touchend', up);
  document.addEventListener('keyup', (e) => { if (e.key === 'Escape') hide(); else if (e.shiftKey) read(null); });
  window.addEventListener('popstate', hide);
  window.addEventListener('scroll', hide, true);
}
