/**
 * Codi prototype runtime (window.Codi) — shared by every feature module.
 * Classic script, works from file://. Feature modules (learner-commerce.js,
 * learner-learning.js, lecturer.js, admin.js) load after this file and register
 * routes/actions; the router starts on DOMContentLoaded.
 *
 * ───────────────────────────── API ─────────────────────────────
 * TEMPLATING
 *  Codi.html`...`            → SafeHTML. Interpolated strings/numbers are escaped;
 *                              SafeHTML values are inserted as-is; arrays are joined;
 *                              null/undefined/false/true render nothing.
 *  Codi.raw(str)             → SafeHTML from trusted markup.   Codi.esc(str) → escaped string.
 *  Codi.icon(name, {cls})    → SafeHTML inline SVG (outline family, stroke 1.75). cls e.g. 'icon-sm'.
 *
 * ROUTING (hash based: #/courses/react?x=1)
 *  Codi.route(pattern, render, opts)  pattern '/learn/:course/:lesson'. Static segments win over params.
 *        render(params, query) → SafeHTML (or raw HTML string). Later registration of the same pattern wins.
 *        opts: { role: 'learner'|['lecturer','admin'], title: 'Tiêu đề', layout: 'default'|'focus',
 *                exit: { href:'/x', label:'Thoát' } (focus layout: header shows only logo + exit link) }
 *  Codi.go(path)  Codi.path()  Codi.query()  Codi.rerender()  Codi.onMount(fn)  (fn runs after DOM insert)
 *
 * STATE (persisted to localStorage 'codi-proto-v5')
 *  Codi.state                 { version, currentUserId, carts{userId:[courseId]}, scenario{...}, db, ...module slices }
 *  Codi.set(fnOrPatch, {render:true})  mutate (fn(state)) or merge (object), persist, re-render route + header.
 *        Pass {render:false} for transient UI changes you update in the DOM yourself (e.g. typing).
 *  Codi.ensure(key, defaultFn) lazily creates a persisted module slice: Codi.ensure('learning', () => ({}))
 *  Codi.db()                   mutable copy of CodiData (users, courses, orders, vouchers, submissions,
 *                              questions, reviews, enrolments, learnerProgress, learnerSeed,
 *                              knowledgeMaps, notifications, bankInfo, categories, levels)
 *  Codi.reset()                restore seed.
 *  Scenario flags: Codi.state.scenario = { paymentOutcome: 'success'|'expired'|'underpaid'|'slow'|'qrfail',
 *        pathAI: 'ok'|'fail', materials: 'ok'|'error', aiAssistant: 'ok'|'ratelimit'|'error'|'thinking', kmap: 'ok'|'fail'|'cycle',
 *        theme: 'light'|'dark' }
 *
 * SELECTORS
 *  Codi.currentUser()  Codi.role() → 'guest'|'learner'|'lecturer'|'admin'  Codi.user(id)
 *  Codi.course(idOrSlug)  Codi.lessons(course) (flat, chapter order)  Codi.lesson(course, lessonId)
 *  Codi.chapterOf(course, lessonId)  Codi.category(id)  Codi.levelLabel(level)
 *  Codi.isEnrolled(courseId, userId?)  Codi.enroll(courseId, userId?)  (adds to db.enrolments)
 *  Codi.cart() → courseIds of current user   Codi.setCart(ids)
 *  Codi.pendingOrderFor(courseId, userId?) → pending order containing the course or null
 *  Codi.ownership(courseId) → 'owned'|'pending-payment'|'in-cart'|'free'|'not-owned'
 *  Codi.courseProgress(courseId, userId?) → { done, total, pct, completed, currentLessonId }
 *        Default reads db.learnerProgress; learner-learning.js OVERRIDES this to read its own state.
 *  Codi.homeFor(role) → '/', '/dashboard', '/teach', '/admin'
 *
 * FORMAT  Codi.fmt.vnd(n) "1.290.000 ₫" · date(iso) "11/10/2026" · datetime(iso) · relative(iso) "3 giờ trước"
 *         · duration(min) "1 giờ 20 phút" · num(n)
 *
 * EVENTS (delegated on document)
 *  data-action="name"  → Codi.action('name', (el, event) => …)    click
 *  data-change="name"  → change event handler (el, event)
 *  data-input="name"   → input event handler (el, event)
 *  data-submit="name"  → form submit: handler(form, event, values)  (preventDefault is automatic)
 *  data-go="/path"     → navigate on click.   data-close → closes the enclosing modal/sheet.
 *
 * UI  (all return SafeHTML unless noted)
 *  Codi.ui.toast(msg, {type:'info'|'success'|'warn'|'danger'})                       (side effect)
 *  Codi.ui.confirm({title, body, consequence, reversible, confirmLabel, cancelLabel, danger,
 *                   requireReason, reasonLabel, reasonPlaceholder, typeToConfirm}) → Promise<{ok, reason}>
 *  Codi.ui.modal({title, body, footer, size:'md'|'lg', onMount(handle), onClose, dismissible}) → handle {el, close, setBody}
 *  Codi.ui.sheet({title, body, footer, wide, onMount(handle), onClose}) → handle   (full-screen on phones)
 *  Codi.ui.closeAll()
 *  Codi.ui.md(text) → SafeHTML (escaped Markdown subset)   Codi.ui.stream(text, onTick) → Promise (word-by-word reveal)
 *  sheet({docked:true}) → side panel beside the page on ≥1024px (no backdrop, page stays usable)
 *  Codi.ui.copy(text, buttonEl)  (shows "Đã sao chép" on the button)
 *  Codi.ui.alert({type:'info'|'success'|'warn'|'danger'|'accent', title, body, actions(SafeHTML), icon})
 *  Codi.ui.empty({icon, title, body, actions(SafeHTML)})
 *  Codi.ui.ring(pct, {size, label})   Codi.ui.progress(pct, label)
 *  Codi.ui.mastery(level0to4) chip with 5 dots + text   Codi.ui.masteryLabel(level)
 *  Codi.ui.stepper([labels], currentIndex, {doneUpTo})   Codi.ui.stars(n)   Codi.ui.avatar(user, 'sm'|'lg')
 *  Codi.ui.thumb(course, {small})   Codi.ui.courseStatus(status)   Codi.ui.orderStatus(status)
 *  Codi.ui.workspace({items:[{href,label,icon,count,section}], active:'/teach/grading', body})  (left nav shell)
 *  Codi.ui.spinnerBlock(text) loading block with skeleton lines
 *
 * AUTH / NOTIFY / MISC
 *  Codi.requireAuth(intentFn, {reason}) → runs intent now, or opens sign-in modal and runs it after success.
 *  Codi.signIn(userId)  Codi.signOut()
 *  Codi.notify(userId, {title, body, link})   ('/path' link, no #)
 *  Codi.wait(ms) → Promise
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'codi-proto-v9';
  const STATE_VERSION = 9; // v9: product decisions 14/10 (buy-now order, quiz pass, latest code score, deactivation) · v4: coding practice lessons + db.codeAttempts · v5: React coding challenge · v6: dark mode + charts + seed data · v7: seeded 180-day analytics + learner study days · v8: course reviews, assignment rubrics, review demo content

  // ───────────────────────── templating ─────────────────────────
  class SafeHTML {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const toHTML = (v) => {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (v instanceof SafeHTML) return v.s;
    if (Array.isArray(v)) return v.map(toHTML).join('');
    return esc(v);
  };
  const html = (strings, ...vals) => {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) {
      // Tolerate lit-style boolean attributes: ?disabled=${cond} -> "disabled" or nothing.
      // Only an attribute position (whitespace before "?") counts — never a URL query like "href=#/x?tab=${v}".
      const m = out.match(/\s\?([a-zA-Z-]+)=$/);
      if (m) { out = out.slice(0, -(m[0].length - 1)) + (vals[i] ? m[1] : '') + strings[i + 1]; continue; }
      out += toHTML(vals[i]) + strings[i + 1];
    }
    return new SafeHTML(out);
  };
  // Normalise any app path form ('#/x', '/#/x', '/x', 'x') to '/x'.
  const normPath = (p) => { p = String(p || '/').trim().replace(/^\/?#/, ''); if (!p.startsWith('/')) p = '/' + p; return p; };
  const raw = (s) => new SafeHTML(s == null ? '' : String(s));
  const asHTML = (v) => (typeof v === 'string' ? v : toHTML(v)); // strings returned by modules are trusted markup

  // ───────────────────────── icons ─────────────────────────
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L21.5 7H6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M22 20a7 7 0 0 0-4-6.3"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    'circle-dot': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
    pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
    'file-text': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    'book-open': '<path d="M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
    presentation: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'clipboard-check': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    'message-circle': '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/>',
    'help-circle': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    'alert-triangle': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14M18 13l-6 6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    'grip-vertical': '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    filter: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v2M13 11v2M13 16v2"/>',
    'graduation-cap': '<path d="M22 9 12 4 2 9l10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
    map: '<path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3z"/><path d="M9 4v13M15 7v13"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
    flag: '<path d="M4 21V4M4 4h12l-2 4 2 4H4"/>',
    'thumbs-up': '<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z"/>',
    'thumbs-down': '<path d="M17 14V3M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7a2 2 0 0 1 2-1.7H17v11l-4 8a3 3 0 0 1-4-3.9z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'more-horizontal': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'external-link': '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'skip-forward': '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    'bar-chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    terminal: '<path d="m4 17 6-5-6-5M12 19h8"/>',
    lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    mail: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m22 7-10 6L2 7"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    'qr-code': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    'trending-up': '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    loader: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    'git-branch': '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5a6 6 0 0 1-6 6H8.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    'book-marked': '<path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M10 2v8l2-1.5 2 1.5V2"/>',
    'eye-hidden': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>',
  };
  const icon = (name, opts) => {
    const cls = (opts && opts.cls) || '';
    const body = name === 'star-filled' ? P.star : P[name] || P.circle;
    const fill = name === 'star-filled' ? 'currentColor' : 'none';
    return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
  };

  // ───────────────────────── formatting ─────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = {
    num: (n) => Number(n || 0).toLocaleString('vi-VN'),
    vnd: (n) => Number(n || 0).toLocaleString('vi-VN') + ' ₫',
    date: (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
    datetime: (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
    relative: (iso) => {
      if (!iso) return '';
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return 'Vừa xong';
      if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
      if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
      if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' ngày trước';
      return fmt.date(iso);
    },
    duration: (min) => {
      min = Math.round(min || 0);
      const h = Math.floor(min / 60); const m = min % 60;
      if (!h) return m + ' phút';
      return m ? `${h} giờ ${m} phút` : `${h} giờ`;
    },
  };

  // ───────────────────────── state ─────────────────────────
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const seed = () => ({
    version: STATE_VERSION,
    currentUserId: null,
    carts: {},
    scenario: { paymentOutcome: 'success', pathAI: 'ok', materials: 'ok', aiAssistant: 'ok', kmap: 'ok', theme: 'light' },
    db: clone(window.CodiData),
  });
  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.version === STATE_VERSION && saved.db) return saved;
    } catch (e) { /* corrupted storage → reseed */ }
    return seed();
  };
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Codi.state)); } catch (e) { /* quota: ignore in prototype */ } };

  // ───────────────────────── router ─────────────────────────
  const routes = [];
  let mounts = [];
  let lastPath = null;
  // In-memory copy of the current route. Navigation updates it directly and only mirrors it to
  // the URL when the host page allows that, so the prototype also works inside sandboxed previews
  // that swallow anchor clicks or block hash changes.
  let currentHash = location.hash || '#/';
  const parseHash = () => {
    const h = (currentHash || '#/').slice(1) || '/';
    const [p, qs] = h.split('?');
    const query = {};
    (qs || '').split('&').filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
    });
    const path = p.length > 1 ? p.replace(/\/+$/, '') : '/';
    return { path, query };
  };
  const match = (pattern, path) => {
    const a = pattern.split('/'); const b = path.split('/');
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return params;
  };
  // Static segments outrank params, position by position (left to right).
  const specificity = (pattern) => pattern.split('/').map((s) => (s.startsWith(':') ? '1' : '2')).join('');

  function render() {
    const { path, query } = parseHash();
    const main = document.getElementById('app-main');
    let best = null;
    routes.forEach((r) => {
      const params = match(r.pattern, path);
      if (!params) return;
      const spec = specificity(r.pattern);
      if (!best || spec > best.spec || (spec === best.spec && r.order > best.order)) best = Object.assign({ params, spec }, r);
    });
    const changed = path !== lastPath;
    lastPath = path;
    // docked side panels belong to the page that opened them
    if (changed) overlays.filter((o) => o._docked).forEach((o) => o.close());
    Codi._current = best ? { pattern: best.pattern, opts: best.opts, path, query, params: best.params } : { pattern: null, opts: {}, path, query, params: {} };
    renderHeader();
    let out;
    try {
      if (!best) out = notFoundPage();
      else if (best.opts.role && !roleAllowed(best.opts.role)) out = Codi.role() === 'guest' ? signInRequiredPage() : forbiddenPage();
      else out = best.render(best.params, query);
    } catch (err) {
      console.error(err);
      out = html`<div class="page page-narrow">${Codi.ui.alert({ type: 'danger', title: 'Không thể hiển thị trang này', body: String(err && err.message ? err.message : err) })}</div>`;
    }
    const y = window.scrollY;
    main.innerHTML = asHTML(out);
    document.title = ((best && best.opts.title) || 'Codi') + ' · Codi';
    const pending = mounts; mounts = [];
    pending.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    if (/^\/(login|register)$/.test(path) && authView.mode === 'otp' && !authModal) wireOtp();
    if (changed) {
      window.scrollTo(0, 0);
      const h1 = main.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    } else {
      window.scrollTo(0, y);
    }
  }
  const roleAllowed = (role) => (Array.isArray(role) ? role : [role]).includes(Codi.role());

  // ───────────────────────── overlays ─────────────────────────
  const overlays = [];
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // Docked side panel width (desktop ≥ 1024px): a separator on the panel's left edge resizes it by
  // pointer drag or arrow keys (Shift = bigger step, Home = default). The width lives in --dock-w on
  // <html>, which the panel, the page's right padding and the lesson's container queries all read,
  // and is remembered in localStorage across panels and reloads.
  const DOCK_KEY = 'codi-dock-width';
  const DOCK_MIN = 320;
  const dockMax = () => Math.max(DOCK_MIN, Math.min(720, Math.round(window.innerWidth * 0.5)));
  const clampDock = (w) => Math.min(dockMax(), Math.max(DOCK_MIN, Math.round(w)));
  function setDockWidth(w, save) {
    const v = clampDock(w);
    document.documentElement.style.setProperty('--dock-w', v + 'px');
    const h = document.querySelector('.dock-resize');
    if (h) { h.setAttribute('aria-valuenow', String(v)); h.setAttribute('aria-valuemax', String(dockMax())); }
    if (save) { try { localStorage.setItem(DOCK_KEY, String(v)); } catch (e) { /* ignore */ } }
  }
  function resetDockWidth() {
    document.documentElement.style.removeProperty('--dock-w'); // back to the CSS default (400 / 360px)
    try { localStorage.removeItem(DOCK_KEY); } catch (e) { /* ignore */ }
  }
  function wireDockResize(panel) {
    let saved = 0;
    try { saved = Number(localStorage.getItem(DOCK_KEY)); } catch (e) { /* storage blocked: use the CSS default */ }
    if (saved) setDockWidth(saved, false);
    const cur = () => panel.getBoundingClientRect().width || 400;
    const h = document.createElement('div');
    h.className = 'dock-resize';
    h.tabIndex = 0;
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', 'Kéo hoặc dùng phím mũi tên để đổi độ rộng panel');
    h.setAttribute('aria-valuemin', String(DOCK_MIN));
    h.setAttribute('aria-valuemax', String(dockMax()));
    h.setAttribute('aria-valuenow', String(Math.round(cur())));
    h.title = 'Kéo để đổi độ rộng · Nhấp đúp để về mặc định';
    panel.prepend(h);
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      document.body.classList.add('is-dock-resizing');
      const move = (ev) => setDockWidth(window.innerWidth - ev.clientX, false);
      const up = () => {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        document.body.classList.remove('is-dock-resizing');
        setDockWidth(cur(), true);
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    h.addEventListener('dblclick', () => { resetDockWidth(); h.setAttribute('aria-valuenow', String(Math.round(cur()))); });
    h.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 64 : 16;
      // the panel sits on the right, so ArrowLeft widens it
      if (e.key === 'ArrowLeft') setDockWidth(cur() + step, true);
      else if (e.key === 'ArrowRight') setDockWidth(cur() - step, true);
      else if (e.key === 'Home') { resetDockWidth(); h.setAttribute('aria-valuenow', String(Math.round(cur()))); }
      else return;
      e.preventDefault();
    });
  }
  // keep a saved width inside the allowed range when the window shrinks
  window.addEventListener('resize', () => { if (document.documentElement.style.getPropertyValue('--dock-w')) setDockWidth(parseFloat(document.documentElement.style.getPropertyValue('--dock-w')), false); });

  function openOverlay(kind, opts) {
    const root = document.createElement('div');
    // docked sheets (lesson side panels) sit beside the page on wide screens: no backdrop, no
    // focus trap, page stays interactive. Below 1024px they behave like a normal full-screen sheet.
    const docked = kind === 'sheet' && !!opts.docked;
    // side:'left' slides the sheet in from the left (navigation lists), leaving a docked right panel visible
    root.className = kind === 'sheet' ? `overlay sheet-overlay${docked ? ' overlay-docked' : ''}${opts.side === 'left' ? ' sheet-left' : ''}` : 'overlay';
    const titleId = 'ov-' + Math.random().toString(36).slice(2, 8);
    const panelCls = kind === 'sheet' ? `sheet ${opts.wide ? 'sheet-wide' : ''}` : `dialog ${opts.size === 'lg' ? 'dialog-lg' : ''}`;
    const head = kind === 'sheet' ? 'sheet-header' : 'dialog-header';
    const bodyCls = kind === 'sheet' ? 'sheet-body' : 'dialog-body';
    const footCls = kind === 'sheet' ? 'sheet-footer' : 'dialog-footer';
    root.innerHTML = `<div class="${panelCls}" role="dialog" aria-modal="${docked ? 'false' : 'true'}" ${opts.title ? `aria-labelledby="${titleId}"` : ''}>
      ${opts.title ? `<div class="${head}"><h2 id="${titleId}">${esc(opts.title)}</h2><button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Đóng">${icon('x')}</button></div>` : ''}
      <div class="${bodyCls}" data-overlay-body>${asHTML(opts.body || '')}</div>
      ${opts.footer ? `<div class="${footCls}" data-overlay-footer>${asHTML(opts.footer)}</div>` : ''}
    </div>`;
    document.body.appendChild(root);
    const panel = root.firstElementChild;
    if (docked) wireDockResize(panel);
    const prevFocus = document.activeElement;
    let closed = false;
    const handle = {
      el: panel,
      close() {
        if (closed) return;
        closed = true;
        root.remove();
        const i = overlays.indexOf(handle);
        if (i >= 0) overlays.splice(i, 1);
        if (docked && !overlays.some((o) => o._docked)) document.body.classList.remove('has-docked-panel');
        if (opts.onClose) opts.onClose();
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
      },
      setBody(content) { panel.querySelector('[data-overlay-body]').innerHTML = asHTML(content); },
      setFooter(content) { const f = panel.querySelector('[data-overlay-footer]'); if (f) f.innerHTML = asHTML(content); },
    };
    handle._dismissible = opts.dismissible !== false;
    handle._docked = docked;
    if (docked) document.body.classList.add('has-docked-panel');
    overlays.push(handle);
    root.addEventListener('mousedown', (e) => { if (e.target === root && handle._dismissible) handle.close(); });
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (!c) return;
      if (c.tagName !== 'A') e.preventDefault(); // links still navigate after closing
      handle.close();
    });
    if (opts.onMount) opts.onMount(handle);
    const first = panel.querySelector('[autofocus]') || panel.querySelector(`[data-overlay-body] ${FOCUSABLE.split(', ').join(`, [data-overlay-body] `)}`) || panel.querySelector(FOCUSABLE);
    if (first) first.focus();
    return handle;
  }
  document.addEventListener('keydown', (e) => {
    const top = overlays[overlays.length - 1];
    if (!top) return;
    const dockedWide = top._docked && window.matchMedia('(min-width: 1024px)').matches;
    if (e.key === 'Escape' && top._dismissible && (!dockedWide || top.el.contains(document.activeElement))) { e.preventDefault(); top.close(); }
    if (e.key === 'Tab' && !dockedWide) {
      const items = Array.from(top.el.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ───────────────────────── UI helpers ─────────────────────────
  const MASTERY = ['Chưa học', 'Đang học', 'Đang học', 'Thành thạo', 'Thành thạo'];
  const MASTERY_DETAIL = ['Chưa học', 'Đang học · mới bắt đầu', 'Đang học · khá', 'Thành thạo', 'Thành thạo · vững'];
  const COURSE_STATUS = {
    draft: ['Bản nháp', 'badge-neutral', 'pencil'],
    pending: ['Chờ duyệt', 'badge-warn', 'clock'],
    rejected: ['Bị từ chối', 'badge-danger', 'x-circle'],
    published: ['Đã xuất bản', 'badge-success', 'check-circle'],
    hidden: ['Đã ẩn', 'badge-outline', 'eye-off'],
  };
  const ORDER_STATUS = {
    pending: ['Chờ thanh toán', 'badge-warn'],
    paid: ['Đã thanh toán', 'badge-success'],
    failed: ['Thất bại', 'badge-danger'],
    cancelled: ['Đã huỷ', 'badge-neutral'],
    refunded: ['Hoàn tiền', 'badge-info'],
  };
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
  // Official brand colours for the course logos (background, mark).
  const LOGO_STYLE = {
    React: { bg: '#20232a', fg: '#61dafb' },
    JavaScript: { bg: '#f7df1e', fg: '#1f1f1f' },
    'Node.js': { bg: '#233056', fg: '#8cc84b' },
    Python: { bg: '#306998', fg: '#ffd43b' },
    Git: { bg: '#f05032', fg: '#ffffff' },
    TypeScript: { bg: '#3178c6', fg: '#ffffff' },
    'Next.js': { bg: '#000000', fg: '#ffffff' },
    Jest: { bg: '#99425b', fg: '#ffffff' },
  };
  const ALERT_ICON = { info: 'info', success: 'check-circle', warn: 'alert-triangle', danger: 'alert-circle', accent: 'sparkles' };

  const ui = {
    toast(msg, opts) {
      const type = (opts && opts.type) || 'info';
      const region = document.getElementById('toast-region');
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
      // opts.actions (SafeHTML) adds a follow-up link/button; such toasts stay longer so it can be reached
      const actions = opts && opts.actions;
      el.innerHTML = `${icon(ALERT_ICON[type] || 'info')}<span>${esc(msg)}</span>${actions ? `<span class="toast-actions">${asHTML(actions)}</span>` : ''}`;
      if (actions) el.addEventListener('click', (e) => { if (e.target.closest('a, button')) el.remove(); });
      region.appendChild(el);
      setTimeout(() => el.remove(), (opts && opts.duration) || (actions ? 7000 : 3500));
    },
    // Tiny Markdown subset for AI answers: paragraphs, "- " / "1. " lists, **bold**, `code`.
    // Input is escaped first, so the output is safe to inject.
    md(text) {
      const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
      const out = []; let list = null;
      const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
      String(text || '').split('\n').forEach((line) => {
        const ul = line.match(/^\s*[-*]\s+(.*)$/); const ol = line.match(/^\s*\d+\.\s+(.*)$/);
        if (ul || ol) {
          const tag = ul ? 'ul' : 'ol';
          if (list !== tag) { closeList(); out.push(`<${tag}>`); list = tag; }
          out.push(`<li>${inline((ul || ol)[1])}</li>`);
        } else if (line.trim()) { closeList(); out.push(`<p>${inline(line)}</p>`); }
        else closeList();
      });
      closeList();
      return raw(`<div class="md">${out.join('')}</div>`);
    },
    // Reveal `text` word by word (simulated streaming). onTick(partial) runs per step;
    // resolves with the full text. Reduced-motion users get the whole answer at once.
    stream(text, onTick, step) {
      const parts = String(text).split(/(\s+)/);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onTick(text); return Promise.resolve(text); }
      return new Promise((resolve) => {
        let i = 0; let acc = '';
        const tick = () => {
          for (let n = 0; n < 4 && i < parts.length; n++) acc += parts[i++];
          onTick(acc);
          if (i < parts.length) setTimeout(tick, step || 45); else resolve(text);
        };
        tick();
      });
    },
    modal: (opts) => openOverlay('modal', opts || {}),
    sheet: (opts) => openOverlay('sheet', opts || {}),
    closeAll() { overlays.slice().reverse().forEach((o) => o.close()); },
    confirm(o) {
      o = o || {};
      return new Promise((resolve) => {
        let done = false;
        const finish = (r) => { if (!done) { done = true; resolve(r); } };
        const rev = o.reversible === undefined ? null : (o.reversible === true ? 'Có thể hoàn tác sau.' : o.reversible === false ? 'Không thể hoàn tác.' : o.reversible);
        const body = html`
          ${o.body ? html`<p>${o.body}</p>` : ''}
          ${o.consequence ? ui.alert({ type: o.danger ? 'danger' : 'warn', title: 'Điều gì sẽ xảy ra', body: o.consequence }) : ''}
          ${rev ? html`<p class="small muted">${icon(o.reversible === false ? 'alert-circle' : 'rotate-ccw', { cls: 'icon-sm' })} ${rev}</p>` : ''}
          ${o.requireReason ? html`<div class="field" data-reason-field>
              <label for="confirm-reason">${o.reasonLabel || 'Lý do'} <span class="req">*</span></label>
              <textarea id="confirm-reason" rows="3" placeholder="${o.reasonPlaceholder || ''}"></textarea>
              <p class="field-error" data-reason-error hidden>${icon('alert-circle', { cls: 'icon-sm' })}<span>Vui lòng nhập lý do.</span></p>
            </div>` : ''}
          ${o.typeToConfirm ? html`<div class="field">
              <label for="confirm-type">Nhập <code>${o.typeToConfirm}</code> để xác nhận</label>
              <input id="confirm-type" autocomplete="off">
            </div>` : ''}`;
        const footer = html`<button type="button" class="btn btn-secondary" data-confirm-cancel>${o.cancelLabel || 'Huỷ'}</button>
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok ${o.typeToConfirm ? 'disabled' : ''}>${o.confirmLabel || 'Xác nhận'}</button>`;
        ui.modal({
          title: o.title || 'Xác nhận',
          body, footer,
          onClose: () => finish({ ok: false }),
          onMount(h) {
            const ok = h.el.querySelector('[data-confirm-ok]');
            h.el.querySelector('[data-confirm-cancel]').addEventListener('click', () => h.close());
            const typeInput = h.el.querySelector('#confirm-type');
            if (typeInput) typeInput.addEventListener('input', () => { ok.disabled = typeInput.value.trim() !== o.typeToConfirm; });
            ok.addEventListener('click', () => {
              const ta = h.el.querySelector('#confirm-reason');
              const reason = ta ? ta.value.trim() : '';
              if (o.requireReason && !reason) {
                h.el.querySelector('[data-reason-error]').hidden = false;
                h.el.querySelector('[data-reason-field]').classList.add('is-invalid');
                ta.focus();
                return;
              }
              finish({ ok: true, reason });
              h.close();
            });
          },
        });
      });
    },
    copy(text, btn) {
      const done = () => {
        if (!btn) return;
        const label = btn.querySelector('[data-copy-label]') || btn;
        const prev = label.textContent;
        label.textContent = 'Đã sao chép';
        btn.classList.add('is-copied');
        setTimeout(() => { label.textContent = prev; btn.classList.remove('is-copied'); }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(String(text)).then(done, done);
      else {
        const ta = document.createElement('textarea');
        ta.value = String(text); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        ta.remove(); done();
      }
    },
    alert(o) {
      o = o || {};
      const type = o.type || 'info';
      return html`<div class="alert alert-${type}" role="${type === 'danger' ? 'alert' : 'status'}">
        ${icon(o.icon || ALERT_ICON[type] || 'info')}
        <div class="alert-body">
          ${o.title ? html`<span class="alert-title">${o.title}</span>` : ''}
          ${o.body ? html`<span>${o.body}</span>` : ''}
          ${o.actions ? html`<div class="alert-actions">${o.actions}</div>` : ''}
        </div>
      </div>`;
    },
    empty(o) {
      o = o || {};
      return html`<div class="empty-state">
        <div class="empty-icon">${icon(o.icon || 'inbox')}</div>
        ${o.title ? html`<h3>${o.title}</h3>` : ''}
        ${o.body ? html`<p>${o.body}</p>` : ''}
        ${o.actions ? html`<div class="row">${o.actions}</div>` : ''}
      </div>`;
    },
    ring(pct, o) {
      o = o || {};
      const size = o.size || 72; const sw = o.stroke || 6;
      const r = (size - sw) / 2; const c = 2 * Math.PI * r;
      const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
      return html`<span class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${o.ariaLabel || p + '%'}">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--subtle)" stroke-width="${sw}"/>
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${o.color || 'var(--accent)'}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/>
        </svg>
        <span class="ring-label" style="font-size:${Math.max(12, size / 4.5)}px">${o.label !== undefined ? o.label : p + '%'}</span>
      </span>`;
    },
    progress(pct, label) {
      const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
      return html`<div class="progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${label || 'Tiến độ'}"><span style="width:${p}%"></span></div>`;
    },
    masteryLabel: (level) => MASTERY[Math.max(0, Math.min(4, level || 0))],
    mastery(level, o) {
      const l = Math.max(0, Math.min(4, level || 0));
      const dots = [0, 1, 2, 3, 4].map((i) => raw(`<i class="${i <= l && l > 0 ? 'on' : ''}"></i>`));
      return html`<span class="mastery" data-level="${l}" title="${MASTERY_DETAIL[l]}"><span class="mastery-dots" aria-hidden="true">${dots}</span><span>${(o && o.detail) ? MASTERY_DETAIL[l] : MASTERY[l]}</span></span>`;
    },
    stepper(steps, current, o) {
      return html`<ol class="stepper">${steps.map((s, i) => {
        const st = i < current || (o && o.allDone) ? 'done' : i === current ? 'current' : 'todo';
        return html`<li class="${st}" ${st === 'current' ? raw('aria-current="step"') : ''}><span class="step-label">${st === 'done' ? icon('check-circle', { cls: 'icon-sm text-success' }) : st === 'current' ? icon('circle-dot', { cls: 'icon-sm' }) : icon('circle', { cls: 'icon-sm' })}${s}</span></li>`;
      })}</ol>`;
    },
    stars(n, o) {
      const full = Math.round(n || 0);
      return html`<span class="stars" role="img" aria-label="${(o && o.label) || `${n} trên 5 sao`}">${[1, 2, 3, 4, 5].map((i) => icon(i <= full ? 'star-filled' : 'star'))}</span>`;
    },
    avatar(user, size) {
      return html`<span class="avatar ${size ? 'avatar-' + size : ''}" aria-hidden="true">${initials(user && user.name)}</span>`;
    },
    // Course media: the technology's real logo (js/course-logos.js) on its brand colour.
    // Courses without a single technology (e.g. Clean Code) get a neutral code mark on the course hue.
    thumb(course, o) {
      const cls = `thumb ${o && o.small ? 'thumb-sm' : ''}`;
      const logo = course && window.CodiLogos && window.CodiLogos[course.id];
      if (logo) {
        const st = LOGO_STYLE[logo.name] || { bg: '#111827', fg: '#ffffff' };
        return html`<span class="${cls}" style="background:${st.bg};color:${st.fg}" aria-hidden="true"><svg class="thumb-logo" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="${logo.d}"/></svg></span>`;
      }
      const hue = course && course.hue !== undefined ? course.hue : 190;
      return html`<span class="${cls}" style="background:hsl(${hue} 40% 24%);color:#ffffff" aria-hidden="true"><svg class="thumb-logo thumb-logo-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg></span>`;
    },
    courseStatus(status) {
      const s = COURSE_STATUS[status] || [status, 'badge-neutral', 'circle'];
      return html`<span class="badge ${s[1]}">${icon(s[2])}${s[0]}</span>`;
    },
    courseStatusLabel: (status) => (COURSE_STATUS[status] || [status])[0],
    orderStatus(status) {
      const s = ORDER_STATUS[status] || [status, 'badge-neutral'];
      return html`<span class="badge ${s[1]}"><span class="status-dot"></span>${s[0]}</span>`;
    },
    orderStatusLabel: (status) => (ORDER_STATUS[status] || [status])[0],
    spinnerBlock(text) {
      return html`<div class="card"><div class="card-body stack-3" aria-busy="true">
        <p class="row muted">${icon('loader')} ${text || 'Đang tải…'}</p>
        <div class="skeleton skeleton-line" style="width:70%"></div><div class="skeleton skeleton-line" style="width:90%"></div><div class="skeleton skeleton-line" style="width:55%"></div>
      </div></div>`;
    },
    workspace(o) {
      let section = null;
      const nav = (o.items || []).map((it) => {
        const label = it.section && it.section !== section ? (section = it.section, html`<div class="nav-label">${it.section}</div>`) : '';
        const active = o.active === it.href || (it.match && it.match.test(Codi.path()));
        return html`${label}<a href="#${it.href}" ${active ? raw('aria-current="page"') : ''}>${icon(it.icon || 'circle')}<span>${it.label}</span>${it.count ? html`<span class="count count-accent nav-count">${it.count}</span>` : ''}</a>`;
      });
      return html`<div class="workspace"><nav class="workspace-nav" aria-label="${o.label || 'Điều hướng khu vực làm việc'}">${nav}</nav><div class="workspace-content">${o.body}</div></div>`;
    },
  };

  // ───────────────────────── selectors ─────────────────────────
  const db = () => Codi.state.db;
  // An inactive (deactivated) account has no valid session: it is treated as signed out everywhere.
  const currentUser = () => {
    const u = Codi.state.currentUserId ? db().users.find((x) => x.id === Codi.state.currentUserId) || null : null;
    return u && u.status === 'active' ? u : null;
  };
  const ROLE_LABEL = { learner: 'Học viên', lecturer: 'Giảng viên', admin: 'Quản trị viên' };

  // ───────────────────────── auth UI ─────────────────────────
  const DEMO = [['minhanh@codi.vn', 'Học viên'], ['quochuy@codi.vn', 'Giảng viên'], ['giabao@codi.vn', 'Quản trị viên'], ['kimoanh@codi.vn', 'Tài khoản bị vô hiệu hoá']];
  let authView = { mode: 'login', email: '', error: null, otpTries: 0, resendAt: 0, name: '', courseTitle: null };
  // Google "G" brand mark (official four colours), used on the sign-in buttons and the account chooser.
  const GOOGLE_MARK = raw('<svg class="icon google-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>');

  // Errors and notices above the sign-in / register form. Google outcomes (cancelled, permission
  // denied) carry google:true and offer a retry straight back into the account chooser.
  function authAlert(err) {
    if (!err) return '';
    return ui.alert({ type: err.type || 'danger', title: err.title, body: err.body,
      actions: err.google ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="auth-google">${GOOGLE_MARK} Thử lại với Google</button>` : '' });
  }
  function loginForm(ctx) {
    const err = authView.error;
    return html`
      <form class="stack-4" data-submit="auth-login" data-ctx="${ctx}" novalidate>
        ${authAlert(err)}
        <div class="field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="email" value="${authView.email}" required>
        </div>
        <div class="field">
          <div class="row-between"><label for="login-pass">Mật khẩu</label><a href="#/forgot-password" class="small" data-close>Quên mật khẩu?</a></div>
          <input id="login-pass" name="password" type="password" autocomplete="current-password" required>
        </div>
        <label class="check"><input type="checkbox" name="remember" checked> Ghi nhớ đăng nhập</label>
        <button class="btn btn-primary btn-block" type="submit">Đăng nhập</button>
        <div class="or-divider">hoặc</div>
        <div class="stack-2">
          <button class="btn btn-secondary btn-block" type="button" data-action="auth-google">${GOOGLE_MARK} Đăng nhập với Google</button>
          <button class="btn btn-secondary btn-block" type="button" data-action="auth-github">${icon('github')} Đăng nhập với GitHub</button>
        </div>
        <p class="small muted" style="text-align:center">Chưa có tài khoản? <button type="button" class="btn-link" data-action="auth-mode" data-mode="register">Tạo tài khoản</button></p>
        <div class="demo-accounts">
          <span class="xsmall strong">Tài khoản thử nghiệm · mật khẩu codi123</span>
          ${DEMO.map(([e, l]) => html`<button type="button" data-action="auth-fill" data-email="${e}">${l}: ${e}</button>`)}
        </div>
      </form>`;
  }
  function registerForm(ctx) {
    const err = authView.error;
    return html`
      <form class="stack-4" data-submit="auth-register" data-ctx="${ctx}" novalidate>
        ${authAlert(err)}
        <div class="field"><label for="reg-name">Họ và tên</label><input id="reg-name" name="name" autocomplete="name" value="${authView.name}" required></div>
        <div class="field"><label for="reg-email">Email</label><input id="reg-email" name="email" type="email" autocomplete="email" value="${authView.email}" required></div>
        <div class="field"><label for="reg-pass">Mật khẩu</label><input id="reg-pass" name="password" type="password" autocomplete="new-password" minlength="8" required><p class="field-help">Tối thiểu 8 ký tự.</p></div>
        <button class="btn btn-primary btn-block" type="submit">Tạo tài khoản</button>
        <div class="or-divider">hoặc</div>
        <button class="btn btn-secondary btn-block" type="button" data-action="auth-google">${GOOGLE_MARK} Đăng ký với Google</button>
        <p class="small muted" style="text-align:center">Đã có tài khoản? <button type="button" class="btn-link" data-action="auth-mode" data-mode="login">Đăng nhập</button></p>
      </form>`;
  }
  function otpForm(ctx) {
    const err = authView.error;
    const left = Math.max(0, Math.ceil((authView.resendAt - Date.now()) / 1000));
    const locked = authView.otpTries >= 3;
    return html`
      <form class="stack-4" data-submit="auth-otp" data-ctx="${ctx}" novalidate>
        <div class="stack-1">
          <h3>Nhập mã xác thực</h3>
          <p class="small muted">Chúng tôi đã gửi mã 6 số đến <strong>${authView.email}</strong> <button type="button" class="btn-link" data-action="auth-mode" data-mode="register">Sửa</button></p>
        </div>
        <div class="otp ${err ? 'is-invalid' : ''}" role="group" aria-label="Mã xác thực 6 số">
          ${[0, 1, 2, 3, 4, 5].map((i) => html`<input inputmode="numeric" maxlength="1" aria-label="Số thứ ${i + 1}" data-otp="${i}" value="${(authView.code || '')[i] || ''}" ${locked ? 'disabled' : ''}>`)}
        </div>
        ${err ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${err.body}</span></p>` : ''}
        <p class="xsmall muted">Mã đúng trong bản thử nghiệm: 123456 · 000000 = mã hết hạn.</p>
        <button class="btn btn-primary btn-block" type="submit" ${locked ? 'disabled' : ''}>Xác thực</button>
        <p class="small muted" style="text-align:center" data-resend>${left > 0 ? html`Gửi lại mã sau ${left} giây` : html`Không nhận được mã? <button type="button" class="btn-link" data-action="auth-resend">Gửi lại mã</button>`}</p>
      </form>`;
  }
  // Simulated Google OAuth account chooser (no real Google connection in the prototype).
  // An existing Codi email signs straight in; a new Google email creates a learner account without
  // OTP (Google already verified it); a deactivated account is refused like the password flow.
  const GOOGLE_ACCOUNTS = [
    { email: 'minhanh@codi.vn', name: 'Minh Anh' },
    { email: 'nam.tran.dev@gmail.com', name: 'Trần Văn Nam' },
    { email: 'kimoanh@codi.vn', name: 'Kim Oanh' },
  ];
  // Two steps, like the real OAuth screen: 1) choose an account, 2) consent ("Cho phép" / "Từ chối").
  // Leaving at either step ("Huỷ" / "Từ chối") returns to the form the learner came from with a notice.
  function googleForm() {
    const err = authView.error;
    const pick = authView.googlePick;
    if (pick) {
      return html`
      <div class="stack-4">
        <div class="google-head">${GOOGLE_MARK}<p class="small muted">Codi muốn truy cập Tài khoản Google của bạn</p></div>
        ${err ? ui.alert({ type: 'danger', title: err.title, body: err.body }) : ''}
        <div class="google-who">${ui.avatar({ name: pick.name }, 'sm')}<span class="google-account-body"><span class="google-account-name">${pick.name}</span><span class="google-account-email od-truncate">${pick.email}</span></span></div>
        <div class="stack-2"><span class="small strong">Codi sẽ được phép:</span>
          <ul class="google-scopes"><li>${icon('user', { cls: 'icon-sm' })}<span>Xem tên và ảnh đại diện của bạn</span></li><li>${icon('mail', { cls: 'icon-sm' })}<span>Xem địa chỉ email của bạn</span></li></ul>
          <p class="xsmall muted">Codi không đọc thư, danh bạ hay tệp trên Google Drive của bạn. Bản thử nghiệm không kết nối Google thật.</p></div>
        <div class="google-consent-actions">
          <button type="button" class="btn btn-secondary" data-action="auth-google-deny">Từ chối</button>
          <button type="button" class="btn btn-primary" data-action="auth-google-allow">Cho phép</button>
        </div>
        <button type="button" class="btn btn-ghost btn-block" data-action="auth-google-back">${icon('arrow-left', { cls: 'icon-sm' })} Chọn tài khoản khác</button>
      </div>`;
    }
    return html`
      <div class="stack-4">
        <div class="google-head">${GOOGLE_MARK}<p class="small muted">Chọn tài khoản Google để tiếp tục vào Codi</p></div>
        ${err ? ui.alert({ type: 'danger', title: err.title, body: err.body }) : ''}
        <ul class="google-accounts">${GOOGLE_ACCOUNTS.map((a) => {
          const u = db().users.find((x) => x.email.toLowerCase() === a.email);
          const name = u ? u.name : a.name;
          return html`<li><button type="button" class="google-account" data-action="auth-google-pick" data-email="${a.email}" data-name="${name}">
            ${ui.avatar({ name }, 'sm')}
            <span class="google-account-body"><span class="google-account-name">${name}</span><span class="google-account-email od-truncate">${a.email}</span></span>
            <span class="google-account-tag">${u ? 'Đã có tài khoản Codi' : 'Tài khoản mới'}</span>
          </button></li>`;
        })}</ul>
        <p class="xsmall muted">Codi chỉ nhận tên, email và ảnh đại diện từ Google. Bản thử nghiệm không kết nối Google thật.</p>
        <button type="button" class="btn btn-ghost btn-block" data-action="auth-google-cancel">Huỷ</button>
      </div>`;
  }
  const authBody = (ctx) => (authView.mode === 'register' ? registerForm(ctx) : authView.mode === 'otp' ? otpForm(ctx) : authView.mode === 'google' ? googleForm() : loginForm(ctx));
  const authTitle = () => (authView.mode === 'register' ? 'Tạo tài khoản Codi' : authView.mode === 'otp' ? 'Xác thực email' : authView.mode === 'google' ? 'Tiếp tục với Google' : 'Đăng nhập');

  let authModal = null;
  let authIntent = null;
  let resendTimer = null;
  function refreshAuth() {
    if (authModal) {
      authModal.el.querySelector('h2').textContent = authTitle();
      authModal.setBody(authBody('modal'));
      wireOtp();
    } else if (/^\/(login|register)$/.test(Codi.path())) {
      Codi.rerender(); // render() wires OTP boxes for the full-page flow
    }
  }
  function wireOtp() {
    clearInterval(resendTimer);
    const scope = authModal ? authModal.el : document;
    const boxes = Array.from(scope.querySelectorAll('[data-otp]'));
    if (!boxes.length) return;
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
      b.addEventListener('paste', (e) => {
        const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!t) return;
        e.preventDefault();
        t.split('').forEach((ch, k) => { if (boxes[k]) boxes[k].value = ch; });
        (boxes[t.length] || boxes[5]).focus();
      });
    });
    const target = boxes.find((b) => !b.value) || boxes[0];
    if (!target.disabled) target.focus();
    resendTimer = setInterval(() => {
      const p = scope.querySelector('[data-resend]');
      if (!p) return clearInterval(resendTimer);
      const left = Math.max(0, Math.ceil((authView.resendAt - Date.now()) / 1000));
      if (left > 0) p.textContent = `Gửi lại mã sau ${left} giây`;
      else { p.innerHTML = asHTML(html`Không nhận được mã? <button type="button" class="btn-link" data-action="auth-resend">Gửi lại mã</button>`); clearInterval(resendTimer); }
    }, 1000);
  }
  // Gated sign-in modal with optional course context (Flow L2, S03, decision 32)
  function openSignIn(intent, opts) {
    const opts2 = typeof opts === 'string' ? { reason: opts } : (opts || {});
    authIntent = intent || null;
    authView = { mode: 'login', email: '', error: null, otpTries: 0, resendAt: 0, name: '', courseTitle: opts2.courseTitle || null };
    if (authModal) authModal.close();
    authModal = ui.modal({
      title: authTitle(),
      body: html`
        ${authView.courseTitle ? html`<div class="card card-body compact" style="margin-bottom:var(--space-3)"><span class="small muted">Đăng nhập để thêm khoá học</span><strong>${authView.courseTitle}</strong></div>` : ''}
        ${opts2.reason ? html`<p class="small muted">${opts2.reason}</p>` : ''}
        ${authBody('modal')}
      `,
      onClose: () => { authModal = null; clearInterval(resendTimer); },
    });
  }
  function completeAuth(userId) {
    Codi.state.currentUserId = userId;
    persist();
    const intent = authIntent; authIntent = null;
    const wasModal = !!authModal;
    if (authModal) authModal.close();
    const u = currentUser();
    ui.toast(`Xin chào, ${u.name}!`, { type: 'success' });
    if (intent) { render(); intent(); return; }
    if (!wasModal) {
      const next = Codi.query().next;
      Codi.go(next || Codi.homeFor(u.role));
    } else render();
  }

  // ───────────────────────── header ─────────────────────────
  let openMenu = null; // 'user' | 'notif' | null
  const NAV = {
    guest: [['/courses', 'Khoá học', /^\/(courses)/], ['/ai', 'AI', /^\/ai/]],
    learner: [['/courses', 'Khoá học', /^\/(courses|cart|checkout)/], ['/dashboard', 'Học tập của tôi', /^\/(dashboard|learn|progress)/], ['/ai', 'AI', /^\/ai/]],
    lecturer: [['/teach', 'Giảng dạy', /^\/teach/], ['/courses', 'Khoá học', /^\/courses/]],
    admin: [['/admin', 'Quản trị', /^\/admin/], ['/courses', 'Khoá học', /^\/courses/]],
  };
  function myNotifications() {
    const u = currentUser();
    if (!u) return [];
    return db().notifications.filter((n) => n.userId === u.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  function renderHeader() {
    const el = document.getElementById('app-header');
    const u = currentUser();
    const role = Codi.role();
    const cur = Codi._current || { opts: {}, path: '/' };
    if (cur.opts && cur.opts.layout === 'focus') {
      const exit = cur.opts.exit || { href: Codi.homeFor(role), label: 'Thoát' };
      el.innerHTML = asHTML(html`<div class="app-header-inner">
        <a class="logo" href="#/"><span class="logo-mark">C</span>Codi</a>
        <div class="header-actions"><a class="btn btn-ghost" href="#${exit.href}">${icon('x')} ${exit.label}</a></div>
      </div>`);
      return;
    }
    const links = NAV[role].map(([href, label, re]) => html`<a href="#${href}" ${re.test(cur.path) ? raw('aria-current="page"') : ''}>${label}</a>`);
    const notifs = myNotifications();
    const unread = notifs.filter((n) => !n.read).length;
    const cartCount = role === 'learner' ? Codi.cart().length : 0;
    el.innerHTML = asHTML(html`<div class="app-header-inner">
      <button class="btn btn-ghost btn-icon mobile-only" data-action="mobile-nav" aria-label="Mở menu">${icon('menu')}</button>
      <a class="logo" href="#${role === 'guest' ? '/' : Codi.homeFor(role)}"><span class="logo-mark">C</span>Codi</a>
      <nav class="main-nav" aria-label="Điều hướng chính">${links}</nav>
      <div class="header-actions">
        ${role === 'learner' ? html`<a class="btn btn-ghost btn-icon header-icon-btn" href="#/cart" aria-label="Giỏ hàng, ${cartCount} khoá học">${icon('cart')}${cartCount ? html`<span class="count-dot">${cartCount}</span>` : ''}</a>` : ''}
        ${u ? html`<div class="popover-anchor">
            <button class="btn btn-ghost btn-icon header-icon-btn" data-action="toggle-menu" data-menu="notif" aria-expanded="${openMenu === 'notif'}" aria-label="Thông báo, ${unread} chưa đọc">${icon('bell')}${unread ? html`<span class="count-dot">${unread}</span>` : ''}</button>
            ${openMenu === 'notif' ? html`<div class="popover" role="dialog" aria-label="Thông báo">
              <div class="row-between" style="padding:6px 8px 8px"><strong>Thông báo</strong>${unread ? html`<button class="btn-link small" data-action="notif-read-all">Đánh dấu đã đọc</button>` : ''}</div>
              ${notifs.length ? notifs.slice(0, 8).map((n) => html`<a class="notif-item ${n.read ? '' : 'unread'}" href="#${n.link || '/'}" data-action="notif-open" data-id="${n.id}">
                  <span class="notif-title">${n.title}</span><span class="notif-body">${n.body}</span><span class="notif-time">${fmt.relative(n.createdAt)}</span></a>`)
                : html`<p class="small muted" style="padding:12px">Chưa có thông báo.</p>`}
            </div>` : ''}
          </div>
          <div class="popover-anchor">
            <button class="btn btn-ghost header-icon-btn" data-action="toggle-menu" data-menu="user" aria-expanded="${openMenu === 'user'}" aria-label="Tài khoản">${ui.avatar(u, 'sm')}<span class="desktop-only small">${u.name.split(' ').slice(-1)[0]}</span>${icon('chevron-down', { cls: 'icon-sm desktop-only' })}</button>
            ${openMenu === 'user' ? html`<div class="popover" style="width:280px">
              <div class="menu-head"><strong class="od-truncate">${u.name}</strong><span class="small muted od-truncate" style="display:block">${u.email}</span><span class="badge badge-neutral" style="margin-top:6px">${ROLE_LABEL[u.role]}</span></div>
              <a class="menu-item" href="#${Codi.homeFor(u.role)}">${icon('layout-dashboard')} ${u.role === 'learner' ? 'Bàn làm việc' : u.role === 'lecturer' ? 'Khu vực giảng dạy' : 'Bảng quản trị'}</a>
              <a class="menu-item" href="#/profile">${icon('user')} Hồ sơ cá nhân</a>
              <a class="menu-item" href="#/settings">${icon('settings')} Cài đặt</a>
              <button class="menu-item" data-action="sign-out">${icon('log-out')} Đăng xuất</button>
            </div>` : ''}
          </div>`
        : html`<a class="btn btn-primary" href="#/login" data-action="open-signin">${icon('user')} Đăng nhập</a>`}
      </div>
    </div>`);
  }
  document.addEventListener('click', (e) => {
    if (openMenu && !e.target.closest('.popover-anchor')) { openMenu = null; renderHeader(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { openMenu = null; renderHeader(); } });

  // ───────────────────────── core pages ─────────────────────────
  function notFoundPage() {
    return html`<div class="page page-narrow">${ui.empty({ icon: 'map', title: 'Không tìm thấy trang', body: 'Đường dẫn này không tồn tại hoặc đã thay đổi.', actions: html`<a class="btn btn-primary" href="#${Codi.homeFor(Codi.role())}">Về trang chính</a>` })}</div>`;
  }
  function forbiddenPage() {
    return html`<div class="page page-narrow">${ui.empty({ icon: 'lock', title: 'Bạn không có quyền truy cập trang này', body: `Tài khoản ${ROLE_LABEL[Codi.role()] || ''} không dùng được khu vực này.`, actions: html`<a class="btn btn-primary" href="#${Codi.homeFor(Codi.role())}">Về trang của bạn</a>` })}</div>`;
  }
  function signInRequiredPage() {
    return html`<div class="page page-narrow">${ui.empty({ icon: 'lock', title: 'Vui lòng đăng nhập', body: 'Trang này chỉ dành cho người dùng đã đăng nhập.', actions: html`<button class="btn btn-primary" data-action="open-signin" data-resume="1">Đăng nhập</button>` })}</div>`;
  }

  function authPage(mode) {
    if (authView.mode !== mode && authView.mode !== 'google' && !(mode === 'register' && authView.mode === 'otp')) authView = Object.assign({}, authView, { mode, error: null });
    return html`<div class="auth-wrap"><div class="auth-card card"><div class="card-body stack-4">
      <h1 style="font-size:var(--text-xl)">${authTitle()}</h1>
      ${authBody('page')}
    </div></div></div>`;
  }

  let forgot = { step: 'email', email: '', error: null, resendAt: 0 };
  function forgotPage() {
    if (forgot.step === 'sent') {
      return html`<div class="auth-wrap"><div class="auth-card card"><div class="card-body stack-4">
        <div class="empty-icon" style="width:48px;height:48px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center">${icon('mail')}</div>
        <h1 style="font-size:var(--text-xl)">Kiểm tra email của bạn</h1>
        <p class="muted">Nếu <strong>${forgot.email}</strong> có tài khoản Codi, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút. Hãy kiểm tra cả thư mục thư rác.</p>
        <a class="btn btn-primary btn-block" href="#/reset-password">Mở liên kết trong email (mô phỏng)</a>
        <button class="btn btn-secondary btn-block" data-action="forgot-resend">Gửi lại email</button>
        <button class="btn-link small" data-action="forgot-change">Dùng email khác</button>
      </div></div></div>`;
    }
    return html`<div class="auth-wrap"><div class="auth-card card"><div class="card-body stack-4">
      <a href="#/login" class="small">${icon('arrow-left', { cls: 'icon-sm' })} Quay lại đăng nhập</a>
      <h1 style="font-size:var(--text-xl)">Quên mật khẩu?</h1>
      <p class="muted">Nhập email bạn dùng để đăng nhập, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
      <form class="stack-4" data-submit="forgot-submit" novalidate>
        <div class="field ${forgot.error ? 'is-invalid' : ''}">
          <label for="forgot-email">Email</label>
          <input id="forgot-email" name="email" type="email" value="${forgot.email}" autocomplete="email">
          ${forgot.error ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${forgot.error}</span></p>` : ''}
        </div>
        <button class="btn btn-primary btn-block" type="submit">Gửi liên kết đặt lại</button>
      </form>
    </div></div></div>`;
  }
  let reset = { done: false, errors: {} };
  function resetPage() {
    if (reset.done) {
      return html`<div class="auth-wrap"><div class="auth-card card"><div class="card-body stack-4" style="text-align:center">
        <div style="margin:0 auto;width:48px;height:48px;border-radius:50%;background:var(--success-soft);color:var(--success);display:grid;place-items:center">${icon('check')}</div>
        <h1 style="font-size:var(--text-xl)">Đã đặt lại mật khẩu</h1>
        <p class="muted">Bạn có thể đăng nhập bằng mật khẩu mới.</p>
        <a class="btn btn-primary btn-block" href="#/login" data-action="reset-done">Đăng nhập</a>
      </div></div></div>`;
    }
    const e = reset.errors;
    return html`<div class="auth-wrap"><div class="auth-card card"><div class="card-body stack-4">
      <h1 style="font-size:var(--text-xl)">Đặt mật khẩu mới</h1>
      <form class="stack-4" data-submit="reset-submit" novalidate>
        <div class="field ${e.p1 ? 'is-invalid' : ''}"><label for="np1">Mật khẩu mới</label><input id="np1" name="p1" type="password" autocomplete="new-password"><p class="field-help">Tối thiểu 8 ký tự.</p>${e.p1 ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e.p1}</span></p>` : ''}</div>
        <div class="field ${e.p2 ? 'is-invalid' : ''}"><label for="np2">Nhập lại mật khẩu</label><input id="np2" name="p2" type="password" autocomplete="new-password">${e.p2 ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e.p2}</span></p>` : ''}</div>
        <button class="btn btn-primary btn-block" type="submit">Lưu mật khẩu</button>
      </form>
    </div></div></div>`;
  }

  // Settings
  let settingsUI = { editingName: false, nameDraft: '', showEmail: false, pw: { errors: {}, saved: false } };
  const maskEmail = (e) => { const [a, d] = String(e).split('@'); return a.slice(0, 2) + '•'.repeat(Math.max(3, a.length - 2)) + '@' + d; };
  function settingsPage(params, query) {
    const u = currentUser();
    const tab = query.tab === 'security' ? 'security' : 'account';
    const items = [
      { section: 'Tài khoản', href: '/settings', label: 'Thông tin tài khoản', icon: 'user' },
      { section: 'Tài khoản', href: '/settings?tab=security', label: 'Mật khẩu & Bảo mật', icon: 'key' },
    ];
    const dirty = settingsUI.editingName && settingsUI.nameDraft.trim() && settingsUI.nameDraft.trim() !== u.name;
    const account = html`
      <div class="page-header"><div><h1>Thông tin tài khoản</h1><p class="muted">Quản lý tên hiển thị và email đăng nhập.</p></div></div>
      <div class="card"><div class="card-body stack-6">
        <div class="stack-2">
          <span class="field-label">Họ và tên</span>
          ${settingsUI.editingName ? html`<form class="stack-3" data-submit="settings-save-name" novalidate>
              <input class="input" id="settings-name" name="name" value="${settingsUI.nameDraft}" data-input="settings-name-input" aria-label="Họ và tên" style="max-width:420px">
              <div class="row"><button class="btn btn-primary btn-sm" type="submit" data-name-save ${dirty ? '' : 'disabled'}>Lưu</button><button class="btn btn-secondary btn-sm" type="button" data-action="settings-cancel-name">Huỷ</button></div>
            </form>`
          : html`<div class="row-between" style="max-width:520px"><span>${u.name}</span><button class="btn btn-secondary btn-sm" data-action="settings-edit-name">${icon('pencil', { cls: 'icon-sm' })} Sửa</button></div>`}
        </div>
        <hr style="margin:0">
        <div class="stack-2">
          <span class="field-label">Email</span>
          <div class="row-between" style="max-width:520px">
            <span class="row"><span class="mono">${settingsUI.showEmail ? u.email : maskEmail(u.email)}</span>
              <button class="btn btn-ghost btn-icon btn-sm" data-action="settings-toggle-email" aria-label="${settingsUI.showEmail ? 'Ẩn email' : 'Hiện email'}">${icon(settingsUI.showEmail ? 'eye-off' : 'eye', { cls: 'icon-sm' })}</button>
              <span class="badge badge-success">${icon('check')}Đã xác thực</span></span>
            <button class="btn btn-secondary btn-sm" data-action="settings-change-email">Đổi email</button>
          </div>
          <p class="field-help">Khi đổi email, chúng tôi gửi mã xác thực đến địa chỉ mới. Email cũ vẫn dùng được cho đến khi bạn xác thực.</p>
        </div>
      </div></div>`;
    const e = settingsUI.pw.errors;
    const security = html`
      <div class="page-header"><div><h1>Mật khẩu & Bảo mật</h1><p class="muted">Đổi mật khẩu đăng nhập.</p></div></div>
      <div class="card"><div class="card-body">
        ${settingsUI.pw.saved ? html`<div style="margin-bottom:16px">${ui.alert({ type: 'success', title: 'Đã đổi mật khẩu', body: 'Các thiết bị khác cần đăng nhập lại.' })}</div>` : ''}
        <form class="stack-4" data-submit="settings-password" novalidate style="max-width:420px">
          <div class="field ${e.cur ? 'is-invalid' : ''}"><label for="pw-cur">Mật khẩu hiện tại</label><input id="pw-cur" name="cur" type="password" autocomplete="current-password">${e.cur ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e.cur}</span></p>` : ''}</div>
          <div class="field ${e.p1 ? 'is-invalid' : ''}"><label for="pw-new">Mật khẩu mới</label><input id="pw-new" name="p1" type="password" autocomplete="new-password"><p class="field-help">Tối thiểu 8 ký tự.</p>${e.p1 ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e.p1}</span></p>` : ''}</div>
          <div class="field ${e.p2 ? 'is-invalid' : ''}"><label for="pw-new2">Nhập lại mật khẩu mới</label><input id="pw-new2" name="p2" type="password" autocomplete="new-password">${e.p2 ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e.p2}</span></p>` : ''}</div>
          <button class="btn btn-primary" type="submit">Đổi mật khẩu</button>
        </form>
      </div></div>
      <div class="card section"><div class="card-body row-between">
        <div class="stack-1"><strong>Đăng xuất</strong><p class="small muted">Kết thúc phiên đăng nhập trên thiết bị này.</p></div>
        <button class="btn btn-secondary" data-action="sign-out">${icon('log-out')} Đăng xuất</button>
      </div></div>`;
    return ui.workspace({ items, active: tab === 'security' ? '/settings?tab=security' : '/settings', label: 'Cài đặt', body: tab === 'security' ? security : account });
  }

  // Profile
  function profilePage(params, query) {
    const u = currentUser();
    const tab = query.tab || 'overview';
    const enrolled = db().enrolments.filter((e) => e.userId === u.id).map((e) => Codi.course(e.courseId)).filter(Boolean);
    const orders = db().orders.filter((o) => o.userId === u.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const progress = enrolled.map((c) => ({ c, p: Codi.courseProgress(c.id) }));
    const ownedFilter = query.f === 'done' ? 'done' : 'active';
    const tabs = [['overview', 'Tổng quan'], ['courses', 'Khóa học'], ['transactions', 'Giao dịch']];
    let body;
    if (tab === 'courses') {
      const list = progress.filter(({ p }) => (ownedFilter === 'done' ? p.completed : !p.completed));
      body = html`<div class="row-between" style="margin-bottom:16px"><h2>Khóa học của tôi</h2>
          <div class="segmented" role="group" aria-label="Lọc khoá học">
            <button aria-pressed="${ownedFilter === 'active'}" data-go="/profile?tab=courses">Đang học</button>
            <button aria-pressed="${ownedFilter === 'done'}" data-go="/profile?tab=courses&f=done">Đã hoàn thành</button>
          </div></div>
        ${!enrolled.length ? html`<div class="card">${ui.empty({ icon: 'book-open', title: 'Bạn chưa đăng ký khóa học nào.', body: 'Khám phá khoá học phù hợp hoặc nhờ AI Codi gợi ý.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khoá học</a><a class="btn btn-secondary" href="#/ai">Hỏi AI Codi</a>` })}</div>`
        : !list.length ? html`<div class="card">${ui.empty({ icon: 'book-open', title: ownedFilter === 'done' ? 'Chưa có khoá học hoàn thành' : 'Không có khoá học đang học', body: '' })}</div>`
        : html`<div class="stack-3">${list.map(({ c, p }) => html`<a class="card card-link" href="#/learn/${c.id}"><div class="card-body compact row">
            ${ui.thumb(c, { small: true })}
            <div class="od-fill stack-1"><strong class="od-truncate">${c.title}</strong>${ui.progress(p.pct)}<span class="small muted">${p.done}/${p.total} bài · ${p.pct}%</span></div>
            <span class="btn btn-secondary btn-sm">${p.completed ? 'Xem lại' : 'Tiếp tục học'}</span></div></a>`)}</div>`}`;
    } else if (tab === 'transactions') {
      body = html`<h2 style="margin-bottom:16px">Lịch sử giao dịch</h2>
        ${!orders.length ? html`<div class="card">${ui.empty({ icon: 'receipt', title: 'Chưa có giao dịch', body: 'Các đơn hàng của bạn sẽ xuất hiện ở đây.' })}</div>`
        : html`<div class="table-wrap"><table class="table"><thead><tr><th>Mã giao dịch</th><th>Khoá học</th><th>Ngày tạo</th><th class="num">Số tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          ${orders.map((o) => html`<tr><td class="mono">${o.code}</td><td>${o.items.map((i) => (Codi.course(i.courseId) || {}).title).join(', ')}</td><td class="od-nowrap">${fmt.date(o.createdAt)}</td><td class="num">${fmt.vnd(o.total)}</td><td>${ui.orderStatus(o.status)}</td>
            <td>${o.status === 'pending' ? html`<a class="btn btn-primary btn-sm" href="#/checkout?order=${o.id}">Tiếp tục thanh toán</a>` : ''}</td></tr>`)}
        </tbody></table></div>`}`;
    } else {
      const done = progress.reduce((s, x) => s + x.p.done, 0);
      body = html`<div class="grid-3">
          <div class="stat-tile"><span class="stat-value">${enrolled.length}</span><span class="stat-label">Khoá học đã đăng ký</span></div>
          <div class="stat-tile"><span class="stat-value">${done}</span><span class="stat-label">Bài học đã hoàn thành</span></div>
          <div class="stat-tile"><span class="stat-value">${orders.filter((o) => o.status === 'paid').length}</span><span class="stat-label">Giao dịch thành công</span></div>
        </div>
        <div class="card section"><div class="card-body row-between">
          <div class="stack-1"><strong>Bảo mật tài khoản</strong><p class="small muted">Email đã xác thực. Quản lý mật khẩu trong Cài đặt.</p></div>
          <a class="btn btn-secondary" href="#/settings?tab=security">Mở cài đặt bảo mật</a>
        </div></div>`;
    }
    return html`<div class="page">
      <div class="card"><div class="card-body row">
        ${ui.avatar(u, 'lg')}
        <div class="od-fill stack-1"><h1 style="font-size:var(--text-xl)">${u.name}</h1><p class="muted">${u.email} · ${ROLE_LABEL[u.role]}</p><p class="small faint">Tham gia từ ${fmt.date(u.createdAt)}</p></div>
        <span class="badge badge-success">${icon('check')}Email đã xác thực</span>
      </div></div>
      <div class="tabs section" role="tablist">${tabs.map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${tab === k}" href="#/profile?tab=${k}">${l}</a>`)}</div>
      ${body}
    </div>`;
  }

  // [AI code moved to js/ai-advisor.js - orphaned fragments cleaned up]
  // All AI advisor routes and functions are in js/ai-advisor.js

  // Placeholder home (learner-commerce.js overrides '/').
  const homePlaceholder = () => html`<div class="page">${ui.empty({ icon: 'home', title: 'Codi', body: 'Trang chủ đang được tải.', actions: html`<a class="btn btn-primary" href="#/courses">Xem khoá học</a>` })}</div>`;

  // ───────────────────────── scenario drawer (prototype-only) ─────────────────────────
  let drawerOpen = false;
  const SCEN = [
    ['theme', 'Chế độ hiển thị', [['light', 'Sáng'], ['dark', 'Tối']]],
    ['paymentOutcome', 'Kết quả thanh toán', [['success', 'Thành công'], ['slow', 'Chậm (chờ lâu)'], ['expired', 'Mã hết hạn'], ['underpaid', 'Chuyển thiếu tiền'], ['qrfail', 'Không tải được QR']]],
    ['pathAI', 'AI xếp lộ trình', [['ok', 'Bình thường'], ['fail', 'Lỗi / quá thời gian']]],
    ['materials', 'Tài liệu bài học', [['ok', 'Tải được'], ['error', 'Lỗi tải']]],
    ['aiAssistant', 'AI (trợ lý bài học & AI Chat)', [['ok', 'Bình thường'], ['thinking', 'Đang nghĩ'], ['ratelimit', 'Vượt giới hạn (trợ lý)'], ['error', 'Không khả dụng / lỗi']]],
    ['kmap', 'Phân tích bản đồ kiến thức', [['ok', 'Thành công'], ['fail', 'Thất bại'], ['cycle', 'Phát hiện vòng lặp']]],
  ];
  function renderDrawer() {
    const d = document.getElementById('dev-drawer');
    const t = document.getElementById('dev-toggle');
    t.setAttribute('aria-expanded', String(drawerOpen));
    d.hidden = !drawerOpen;
    if (!drawerOpen) return;
    const role = Codi.role();
    d.innerHTML = asHTML(html`
      <div class="row-between"><h3>Kịch bản thử nghiệm</h3><button class="btn btn-ghost btn-icon btn-sm" data-action="dev-close" aria-label="Đóng">${icon('x')}</button></div>
      <p class="dev-note">Chỉ dùng cho bản thử nghiệm — không thuộc giao diện sản phẩm. Phím tắt Alt+K.</p>
      <fieldset><legend>Vai trò</legend><div class="dev-roles">
        ${[['guest', 'Khách'], ['learner', 'Học viên'], ['lecturer', 'Giảng viên'], ['admin', 'Quản trị viên']].map(([r, l]) => html`<button type="button" data-action="dev-role" data-role="${r}" aria-pressed="${role === r}">${l}</button>`)}
      </div></fieldset>
      ${SCEN.map(([key, label, opts]) => html`<fieldset><legend>${label}</legend>${opts.map(([v, l]) => html`<label><input type="radio" name="dev-${key}" value="${v}" data-change="dev-scenario" data-key="${key}" ${Codi.state.scenario[key] === v ? 'checked' : ''}> ${l}</label>`)}</fieldset>`)}
      <button type="button" class="btn btn-secondary btn-sm" data-action="dev-reset">${icon('rotate-ccw', { cls: 'icon-sm' })} Đặt lại dữ liệu</button>`);
  }

  // ───────────────────────── Codi object ─────────────────────────
  let routeOrder = 0;
  const actions = {};
  const Codi = {
    STATE_VERSION,
    state: null,
    _current: null,
    html, raw, esc, icon, fmt,
    SafeHTML,
    ROLE_LABEL,

    route(pattern, renderFn, opts) { routes.push({ pattern, render: renderFn, opts: opts || {}, order: routeOrder++ }); },
    go(path) {
      const target = '#' + normPath(path);
      currentHash = target;
      openMenu = null;
      if (location.hash !== target) {
        try { history.pushState(null, '', target); } catch (e) { try { location.hash = target; } catch (e2) { /* URL locked: in-memory routing still works */ } }
      }
      render();
    },
    // Delegated listener helper: Codi.on('change', 'select[name=x]', (el, e) => ...)
    on(type, selector, fn) { document.addEventListener(type, (e) => { const el = e.target.closest && e.target.closest(selector); if (el) fn(el, e); }); },
    path: () => parseHash().path,
    query: () => parseHash().query,
    rerender: () => render(),
    onMount(fn) { mounts.push(fn); },
    action(name, fn) { actions[name] = fn; },

    set(fnOrPatch, opts) {
      if (typeof fnOrPatch === 'function') fnOrPatch(Codi.state);
      else if (fnOrPatch) Object.assign(Codi.state, fnOrPatch);
      persist();
      if (!opts || opts.render !== false) render();
    },
    ensure(key, defaultFn) {
      if (Codi.state[key] === undefined) { Codi.state[key] = defaultFn(); persist(); }
      return Codi.state[key];
    },
    db,
    reset() {
      Codi.state = seed(); persist();
      ui.closeAll();
      if (Codi._onReset) Codi._onReset.forEach((fn) => fn());
    },
    _onReset: [],
    onReset(fn) { Codi._onReset.push(fn); },

    currentUser,
    role: () => { const u = currentUser(); return u ? u.role : 'guest'; },
    user: (id) => db().users.find((u) => u.id === id) || null,
    course: (idOrSlug) => db().courses.find((c) => c.id === idOrSlug || c.slug === idOrSlug) || null,
    lessons: (course) => (course ? course.chapters.flatMap((ch) => ch.lessons) : []),
    lesson: (course, lessonId) => Codi.lessons(course).find((l) => l.id === lessonId) || null,
    chapterOf: (course, lessonId) => (course ? course.chapters.find((ch) => ch.lessons.some((l) => l.id === lessonId)) : null),
    category: (id) => db().categories.find((c) => c.id === id) || { id, name: '' },
    levelLabel: (level) => db().levels[level] || level,
    homeFor: (role) => ({ guest: '/', learner: '/dashboard', lecturer: '/teach', admin: '/admin' }[role] || '/'),

    isEnrolled(courseId, userId) {
      const uid = userId || Codi.state.currentUserId;
      return !!uid && db().enrolments.some((e) => e.userId === uid && e.courseId === courseId);
    },
    enroll(courseId, userId) {
      const uid = userId || Codi.state.currentUserId;
      if (!uid || Codi.isEnrolled(courseId, uid)) return;
      db().enrolments.push({ userId: uid, courseId, enrolledAt: new Date().toISOString() });
      const c = Codi.course(courseId);
      if (c) c.learnersCount = (c.learnersCount || 0) + 1;
    },
    cart() { const uid = Codi.state.currentUserId; return uid ? (Codi.state.carts[uid] || []) : []; },
    setCart(ids) { const uid = Codi.state.currentUserId; if (uid) Codi.state.carts[uid] = ids.slice(); },
    pendingOrderFor(courseId, userId) {
      const uid = userId || Codi.state.currentUserId;
      return db().orders.find((o) => o.userId === uid && o.status === 'pending' && o.items.some((i) => i.courseId === courseId)) || null;
    },
    ownership(courseId) {
      const c = Codi.course(courseId);
      if (!c) return 'not-owned';
      if (!Codi.state.currentUserId) return c.price === 0 ? 'free' : 'not-owned';
      if (Codi.isEnrolled(courseId)) return 'owned';
      if (Codi.pendingOrderFor(courseId)) return 'pending-payment';
      if (Codi.cart().includes(courseId)) return 'in-cart';
      if (c.price === 0) return 'free';
      return 'not-owned';
    },
    courseProgress(courseId, userId) {
      const uid = userId || Codi.state.currentUserId;
      const c = Codi.course(courseId);
      const total = Codi.lessons(c).length;
      const rec = db().learnerProgress.find((p) => p.userId === uid && p.courseId === courseId);
      const done = rec ? rec.completed.length : 0;
      const next = c ? c.defaultOrder.find((id) => !(rec && rec.completed.includes(id))) : null;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0, completed: total > 0 && done >= total, currentLessonId: next || null };
    },

    requireAuth(intent, opts) {
      if (currentUser()) { intent(); return; }
      openSignIn(intent, opts);
    },
    openSignIn,
    signIn(userId) { Codi.state.currentUserId = userId; persist(); render(); },
    signOut() { Codi.state.currentUserId = null; openMenu = null; persist(); Codi.go('/'); ui.toast('Bạn đã đăng xuất.'); },
    notify(userId, n) {
      db().notifications.push({ id: 'n-' + Date.now() + Math.random().toString(36).slice(2, 5), userId, title: n.title, body: n.body || '', link: n.link || '/', read: false, createdAt: new Date().toISOString() });
      persist();
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    uid: (prefix) => (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ui,
    // Module contracts — bp-ai will overwrite these
    tutor: {
      open(courseId, lessonId, ctx) { ui.toast('Mở trợ lý bài học cho bài ' + lessonId); },
      explainError(courseId, lessonId, testId) { ui.toast('Giải thích lỗi cho bài kiểm tra'); },
    },
    charts: null, // populated by js/charts.js
    advisor: null, // populated by js/ai-advisor.js
  };
  window.Codi = Codi;

  // ───────────────────────── core actions ─────────────────────────
  Codi.action('toggle-menu', (el, e) => { e.stopPropagation(); const m = el.dataset.menu; openMenu = openMenu === m ? null : m; renderHeader(); });
  Codi.action('notif-read-all', () => { myNotifications().forEach((n) => { n.read = true; }); persist(); renderHeader(); });
  Codi.action('notif-open', (el) => {
    const n = db().notifications.find((x) => x.id === el.dataset.id);
    if (n) n.read = true;
    openMenu = null; persist();
    Codi.go(n && n.link ? n.link : '/');
  });
  Codi.action('sign-out', () => Codi.signOut());
  Codi.action('open-signin', (el) => { openSignIn(el.dataset.resume ? () => render() : null); });
  Codi.action('mobile-nav', () => {
    const role = Codi.role();
    const links = NAV[role].map(([href, label]) => html`<a class="menu-item" href="#${href}" data-close>${label}</a>`);
    ui.sheet({ title: 'Menu', body: html`<nav class="stack-1" aria-label="Điều hướng chính">${links}${role === 'learner' ? html`<a class="menu-item" href="#/cart" data-close>Giỏ hàng (${Codi.cart().length})</a>` : ''}${role === 'guest' ? html`<a class="menu-item" href="#/login" data-close>Đăng nhập</a>` : html`<a class="menu-item" href="#/profile" data-close>Hồ sơ cá nhân</a><a class="menu-item" href="#/settings" data-close>Cài đặt</a>`}</nav>` });
  });

  // Auth
  Codi.action('auth-mode', (el) => { authView.mode = el.dataset.mode; authView.error = null; if (/^\/(login|register)$/.test(Codi.path()) && !authModal) Codi.go('/' + (el.dataset.mode === 'register' ? 'register' : 'login')); else refreshAuth(); });
  Codi.action('auth-fill', (el) => {
    const scope = authModal ? authModal.el : document;
    const em = scope.querySelector('#login-email'); const pw = scope.querySelector('#login-pass');
    if (em) em.value = el.dataset.email;
    if (pw) { pw.value = 'codi123'; pw.focus(); }
  });
  Codi.action('auth-github', () => completeAuth('usr-learner-001'));
  // Google: show the chooser in place (modal or /login page) instead of leaving the current context.
  Codi.action('auth-google', () => {
    // remember where Google was started from, so cancel / deny returns to that same form
    if (authView.mode !== 'google') authView.googleFrom = authView.mode === 'register' ? 'register' : 'login';
    authView.mode = 'google'; authView.googlePick = null; authView.error = null; refreshAuth();
  });
  // Step 1 → 2: an account was chosen; ask for consent before anything is shared.
  Codi.action('auth-google-pick', (el) => { authView.googlePick = { email: el.dataset.email, name: el.dataset.name }; authView.error = null; refreshAuth(); });
  Codi.action('auth-google-back', () => { authView.googlePick = null; authView.error = null; refreshAuth(); });
  const leaveGoogle = (notice) => { authView.mode = authView.googleFrom || 'login'; authView.googlePick = null; authView.error = notice; refreshAuth(); };
  Codi.action('auth-google-cancel', () => leaveGoogle({ type: 'info', google: true, title: 'Bạn đã huỷ đăng nhập bằng Google', body: 'Chưa có thay đổi nào. Bạn có thể thử lại hoặc dùng email và mật khẩu.' }));
  Codi.action('auth-google-deny', () => leaveGoogle({ type: 'warn', google: true, title: 'Codi chưa được Google cấp quyền', body: 'Codi cần tên và email để nhận ra tài khoản của bạn. Hãy thử lại và chọn "Cho phép", hoặc dùng email và mật khẩu.' }));
  Codi.action('auth-google-allow', () => {
    const pick = authView.googlePick;
    if (!pick) return;
    let u = db().users.find((x) => x.email.toLowerCase() === pick.email);
    if (u && u.status !== 'active') {
      authView.googlePick = null;
      authView.error = { title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản Codi gắn với email này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' };
      refreshAuth(); return;
    }
    authView.error = null; authView.googlePick = null;
    if (!u) {
      u = { id: 'usr-new-' + Date.now().toString(36), name: pick.name, email: pick.email, role: 'learner', status: 'active', authProvider: 'google', createdAt: new Date().toISOString(), lastActive: new Date().toISOString() };
      db().users.push(u);
      ui.toast(`Đã tạo tài khoản Codi cho ${pick.email}.`, { type: 'success' });
    }
    completeAuth(u.id);
  });
  Codi.action('auth-login', (form, e, v) => {
    authView.email = v.email || '';
    const u = db().users.find((x) => x.email.toLowerCase() === String(v.email || '').trim().toLowerCase());
    if (!v.email || !v.password) authView.error = { title: 'Thiếu thông tin', body: 'Vui lòng nhập email và mật khẩu.' };
    else if (!u || v.password !== 'codi123') authView.error = { title: 'Email hoặc mật khẩu không đúng', body: 'Kiểm tra lại thông tin hoặc dùng "Quên mật khẩu?".' };
    else if (u.status !== 'active') authView.error = { title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' };
    else { authView.error = null; completeAuth(u.id); return; }
    refreshAuth();
  });
  Codi.action('auth-register', (form, e, v) => {
    authView.name = v.name || ''; authView.email = v.email || '';
    if (!v.name || !v.email || !/^\S+@\S+\.\S+$/.test(v.email)) authView.error = { title: 'Thông tin chưa hợp lệ', body: 'Nhập họ tên và một email hợp lệ.' };
    else if (db().users.some((u) => u.email.toLowerCase() === v.email.toLowerCase())) authView.error = { title: 'Email đã được dùng', body: 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu?".' };
    else if (!v.password || v.password.length < 8) authView.error = { title: 'Mật khẩu quá ngắn', body: 'Mật khẩu cần tối thiểu 8 ký tự.' };
    else { authView.error = null; authView.mode = 'otp'; authView.otpTries = 0; authView.code = ''; authView.resendAt = Date.now() + 30000; }
    refreshAuth();
  });
  Codi.action('auth-otp', (form) => {
    const code = Array.from(form.querySelectorAll('[data-otp]')).map((i) => i.value).join('');
    authView.code = code;
    if (code.length < 6) authView.error = { body: 'Nhập đủ 6 số.' };
    else if (code === '000000') authView.error = { body: 'Mã đã hết hạn. Hãy gửi lại mã mới.' };
    else if (code !== '123456') {
      authView.otpTries += 1;
      authView.error = { body: authView.otpTries >= 3 ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút hoặc gửi lại mã.' : `Mã không đúng. Còn ${3 - authView.otpTries} lần thử.` };
    } else {
      const id = 'usr-new-' + Date.now().toString(36);
      db().users.push({ id, name: authView.name, email: authView.email, role: 'learner', status: 'active', createdAt: new Date().toISOString(), lastActive: new Date().toISOString() });
      completeAuth(id);
      return;
    }
    refreshAuth();
  });
  Codi.action('auth-resend', () => { authView.resendAt = Date.now() + 30000; authView.otpTries = 0; authView.error = null; authView.code = ''; ui.toast(`Đã gửi mã mới đến ${authView.email}.`, { type: 'success' }); refreshAuth(); });

  Codi.action('forgot-submit', (form, e, v) => {
    if (!v.email || !/^\S+@\S+\.\S+$/.test(v.email)) { forgot.error = 'Nhập một địa chỉ email hợp lệ.'; forgot.email = v.email || ''; }
    else { forgot = { step: 'sent', email: v.email, error: null }; }
    render();
  });
  Codi.action('forgot-resend', () => ui.toast(`Đã gửi lại email đến ${forgot.email}.`, { type: 'success' }));
  Codi.action('forgot-change', () => { forgot = { step: 'email', email: '', error: null }; render(); });
  Codi.action('reset-submit', (form, e, v) => {
    const errors = {};
    if (!v.p1 || v.p1.length < 8) errors.p1 = 'Mật khẩu cần tối thiểu 8 ký tự.';
    if (v.p1 !== v.p2) errors.p2 = 'Hai mật khẩu chưa khớp.';
    reset = { done: !Object.keys(errors).length, errors };
    render();
  });
  Codi.action('reset-done', () => { reset = { done: false, errors: {} }; forgot = { step: 'email', email: '', error: null }; });

  // Settings
  Codi.action('settings-edit-name', () => { settingsUI.editingName = true; settingsUI.nameDraft = currentUser().name; render(); const i = document.getElementById('settings-name'); if (i) i.focus(); });
  Codi.action('settings-cancel-name', () => { settingsUI.editingName = false; render(); });
  Codi.action('settings-name-input', (el) => {
    settingsUI.nameDraft = el.value;
    const btn = document.querySelector('[data-name-save]');
    if (btn) btn.disabled = !(el.value.trim() && el.value.trim() !== currentUser().name);
  });
  Codi.action('settings-save-name', (form, e, v) => {
    if (!v.name || !v.name.trim()) return;
    currentUser().name = v.name.trim(); settingsUI.editingName = false;
    Codi.set(() => {}); ui.toast('Đã lưu họ và tên.', { type: 'success' });
  });
  Codi.action('settings-toggle-email', () => { settingsUI.showEmail = !settingsUI.showEmail; render(); });
  Codi.action('settings-change-email', () => {
    let step = 'email'; let newEmail = ''; let err = null;
    const body = () => (step === 'email'
      ? html`<form class="stack-4" id="chg-email-form" novalidate><div class="field ${err ? 'is-invalid' : ''}"><label for="new-email">Email mới</label><input id="new-email" type="email" value="${newEmail}">${err ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${err}</span></p>` : ''}</div><p class="field-help">Mã xác thực sẽ được gửi đến địa chỉ mới.</p><div class="row"><button class="btn btn-primary" type="submit">Gửi mã</button><button class="btn btn-secondary" type="button" data-close>Huỷ</button></div></form>`
      : html`<form class="stack-4" id="chg-email-form" novalidate><p class="small muted">Nhập mã 6 số đã gửi đến <strong>${newEmail}</strong>. (Mã thử nghiệm: 123456)</p><div class="field ${err ? 'is-invalid' : ''}"><label for="email-code">Mã xác thực</label><input id="email-code" inputmode="numeric" maxlength="6" class="mono">${err ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${err}</span></p>` : ''}</div><div class="row"><button class="btn btn-primary" type="submit">Xác thực và đổi email</button><button class="btn btn-secondary" type="button" data-close>Huỷ</button></div></form>`);
    const m = ui.modal({
      title: 'Đổi email', body: body(),
      onMount(h) {
        h.el.addEventListener('submit', (ev) => {
          ev.preventDefault();
          if (step === 'email') {
            newEmail = h.el.querySelector('#new-email').value.trim();
            if (!/^\S+@\S+\.\S+$/.test(newEmail)) err = 'Nhập một địa chỉ email hợp lệ.';
            else if (db().users.some((u) => u.email === newEmail)) err = 'Email này đã được dùng cho tài khoản khác.';
            else { err = null; step = 'code'; }
          } else {
            const c = h.el.querySelector('#email-code').value.trim();
            if (c !== '123456') err = 'Mã không đúng.';
            else { currentUser().email = newEmail; persist(); h.close(); render(); ui.toast('Đã đổi email đăng nhập.', { type: 'success' }); return; }
          }
          h.setBody(body());
          const f = h.el.querySelector('input'); if (f) f.focus();
        });
      },
    });
    return m;
  });
  Codi.action('settings-password', (form, e, v) => {
    const errors = {};
    if (v.cur !== 'codi123') errors.cur = 'Mật khẩu hiện tại không đúng.';
    if (!v.p1 || v.p1.length < 8) errors.p1 = 'Mật khẩu cần tối thiểu 8 ký tự.';
    if (v.p1 !== v.p2) errors.p2 = 'Hai mật khẩu chưa khớp.';
    settingsUI.pw = { errors, saved: !Object.keys(errors).length };
    render();
  });

  // AI advisor actions registered in js/ai-advisor.js

  // Scenario drawer
  Codi.action('dev-close', () => { drawerOpen = false; renderDrawer(); });
  Codi.action('dev-role', (el) => {
    const map = { guest: null, learner: 'usr-learner-001', lecturer: 'usr-lecturer-001', admin: 'usr-admin-001' };
    Codi.state.currentUserId = map[el.dataset.role];
    persist(); ui.closeAll();
    Codi.go(Codi.homeFor(el.dataset.role));
    renderDrawer();
  });
  Codi.action('dev-scenario', (el) => {
    Codi.state.scenario[el.dataset.key] = el.value;
    if (el.dataset.key === 'theme') {
      const html = document.documentElement;
      if (el.value === 'dark') html.setAttribute('data-theme', 'dark');
      else html.removeAttribute('data-theme');
    }
    persist();
    ui.toast('Đã đổi kịch bản thử nghiệm.');
  });
  Codi.action('dev-reset', async () => {
    const r = await ui.confirm({ title: 'Đặt lại dữ liệu thử nghiệm?', body: 'Mọi thao tác bạn đã làm trong bản thử nghiệm (giỏ hàng, đơn hàng, tiến độ học, chấm bài…) sẽ bị xoá.', reversible: false, confirmLabel: 'Đặt lại', danger: true });
    if (!r.ok) return;
    Codi.reset();
    Codi.go('/');
    renderDrawer();
    ui.toast('Đã đặt lại dữ liệu.', { type: 'success' });
  });

  // ───────────────────────── delegation ─────────────────────────
  // Sandboxed preview frames without "allow-forms" cancel form submission before the submit
  // event fires, so every form would go dead there. Submit buttons and Enter-in-input therefore
  // dispatch the submit event themselves; the native submission is always prevented.
  const SUBMITTER = 'button[type="submit"], button:not([type]), input[type="submit"]';
  function fireSubmit(form, submitter) {
    let ev;
    try { ev = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }); } catch (_) { ev = new Event('submit', { bubbles: true, cancelable: true }); }
    form.dispatchEvent(ev);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented) return; // isComposing: Vietnamese IME (Telex/VNI)
    const t = e.target;
    if (!t || t.tagName !== 'INPUT' || !t.form || /^(checkbox|radio|file|button|submit|reset)$/.test(t.type)) return;
    e.preventDefault();
    const btn = t.form.querySelector(SUBMITTER);
    if (btn && btn.disabled) return; // a disabled default button means "not submittable yet"
    fireSubmit(t.form, btn || null);
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a && actions[a.dataset.action] && !a.disabled) {
      const tag = a.tagName;
      if (tag === 'A' || tag === 'BUTTON') e.preventDefault();
      actions[a.dataset.action](a, e);
      return;
    }
    const sub = e.target.closest(SUBMITTER);
    if (sub && sub.form && !sub.disabled && !e.defaultPrevented) { e.preventDefault(); fireSubmit(sub.form, sub); return; }
    const g = e.target.closest('[data-go]');
    if (g && !g.disabled) { e.preventDefault(); Codi.go(g.dataset.go); return; }
    // Every in-app link ("#/x", "/#/x", "/x") is routed here, so navigation never depends on the
    // browser's default anchor behaviour (blocked in some preview frames, broken under file://).
    const link = e.target.closest('a[href]');
    if (link && !link.target && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const href = link.getAttribute('href');
      if (/^#\//.test(href) || /^\/(#\/)?[a-z]/i.test(href) || href === '/' || href === '/#/' || href === '#/') { e.preventDefault(); Codi.go(href); }
    }
  });
  // Surface script failures instead of failing silently (prototype aid).
  window.addEventListener('error', (e) => {
    const file = String(e.filename || '').split('/').pop();
    console.error('[Codi prototype]', file, e.message);
    if (document.getElementById('toast-region')) ui.toast('Lỗi script ' + file + ': ' + e.message, { type: 'danger', duration: 8000 });
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && actions[el.dataset.change]) actions[el.dataset.change](el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (el && actions[el.dataset.input]) actions[el.dataset.input](el, e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-submit]');
    if (!f) return;
    e.preventDefault();
    const handler = actions[f.dataset.submit];
    if (!handler) return;
    const values = {};
    new FormData(f).forEach((v, k) => {
      if (values[k] === undefined) values[k] = v;
      else values[k] = [].concat(values[k], v);
    });
    handler(f, e, values);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); drawerOpen = !drawerOpen; renderDrawer(); }
  });

  // ───────────────────────── core routes ─────────────────────────
  Codi.route('/', homePlaceholder, { title: 'Trang chủ' });
  Codi.route('/login', () => authPage('login'), { title: 'Đăng nhập' });
  Codi.route('/register', () => authPage('register'), { title: 'Tạo tài khoản' });
  Codi.route('/forgot-password', forgotPage, { title: 'Quên mật khẩu' });
  Codi.route('/reset-password', resetPage, { title: 'Đặt lại mật khẩu' });
  Codi.route('/settings', settingsPage, { title: 'Cài đặt', role: ['learner', 'lecturer', 'admin'] });
  Codi.route('/profile', profilePage, { title: 'Hồ sơ cá nhân', role: ['learner', 'lecturer', 'admin'] });
  // /ai route registered in js/ai-advisor.js

  // ───────────────────────── boot ─────────────────────────
  Codi.state = load();
  persist();
  function boot() {
    // Apply theme on boot
    const theme = Codi.state.scenario.theme;
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');

    document.getElementById('dev-toggle').addEventListener('click', () => { drawerOpen = !drawerOpen; renderDrawer(); });
    const syncFromUrl = () => { const h = location.hash || '#/'; if (h !== currentHash) { currentHash = h; openMenu = null; render(); } };
    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
