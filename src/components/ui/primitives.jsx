/**
 * Shared UI primitives — React ports of Codi.ui.* from the mockup runtime. Markup and class names match the
 * mockup so src/styles/*.css (copied from docs/mockup/css) styles them unchanged.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ICON_PATHS } from '../../lib/icon-paths';
import { COURSE_LOGOS } from '../../lib/course-logos';
import { Codi } from '../../lib/codi';

/** Outline icon (stroke 1.75). name: key of ICON_PATHS, or 'star-filled'. className e.g. "icon-sm". */
export function Icon({ name, className = '', title }) {
  const body = name === 'star-filled' ? ICON_PATHS.star : ICON_PATHS[name] || ICON_PATHS.circle;
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill={name === 'star-filled' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** Trusted markup (chart SVG strings, Markdown output). Never pass user input that has not been escaped. */
export function Html({ html, as: Tag = 'div', ...rest }) {
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Tiny Markdown subset for AI answers: paragraphs, "- " / "1. " lists, **bold**, `code`. Input is escaped first. */
export function mdToHtml(text) {
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  String(text || '').split('\n').forEach((line) => {
    const ul = line.match(/^\s*[-*]\s+(.*)$/); const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { closeList(); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
    } else if (line.trim()) { closeList(); out.push(`<p>${inline(line)}</p>`); } else closeList();
  });
  closeList();
  return out.join('');
}
export function Md({ text, className = '' }) {
  return <div className={`md ${className}`.trim()} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}

/** Reveal text word by word (simulated streaming). onTick(partial) per step; resolves with the full text. */
export function stream(text, onTick, step) {
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
}

export const ALERT_ICON = { info: 'info', success: 'check-circle', warn: 'alert-triangle', danger: 'alert-circle', accent: 'sparkles' };

export function Alert({ type = 'info', title, children, body, actions, icon }) {
  return (
    <div className={`alert alert-${type}`} role={type === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon || ALERT_ICON[type] || 'info'} />
      <div className="alert-body">
        {title && <span className="alert-title">{title}</span>}
        {(body || children) && <span>{body}{children}</span>}
        {actions && <div className="alert-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, body, actions }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} /></div>
      {title && <h3>{title}</h3>}
      {body && <p>{body}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Ring({ pct, size = 72, stroke = 6, label, color, ariaLabel }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={ariaLabel || p + '%'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <span className="ring-label" style={{ fontSize: Math.max(12, size / 4.5) }}>{label !== undefined ? label : p + '%'}</span>
    </span>
  );
}

export function Progress({ pct, label = 'Tiến độ' }) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: p + '%' }} />
    </div>
  );
}

export const MASTERY = ['Chưa học', 'Đang học', 'Đang học', 'Thành thạo', 'Thành thạo'];
export const MASTERY_DETAIL = ['Chưa học', 'Đang học · mới bắt đầu', 'Đang học · khá', 'Thành thạo', 'Thành thạo · vững'];
export const masteryLabel = (level) => MASTERY[Math.max(0, Math.min(4, level || 0))];

/** Mastery chip: 5 dots + text. Never colour alone. */
export function Mastery({ level, detail }) {
  const l = Math.max(0, Math.min(4, level || 0));
  return (
    <span className="mastery" data-level={l} title={MASTERY_DETAIL[l]}>
      <span className="mastery-dots" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i <= l && l > 0 ? 'on' : ''} />)}
      </span>
      <span>{detail ? MASTERY_DETAIL[l] : MASTERY[l]}</span>
    </span>
  );
}

export function Stepper({ steps, current, allDone }) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => {
        const st = i < current || allDone ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={i} className={st} aria-current={st === 'current' ? 'step' : undefined}>
            <span className="step-label">
              <Icon name={st === 'done' ? 'check-circle' : st === 'current' ? 'circle-dot' : 'circle'} className={`icon-sm ${st === 'done' ? 'text-success' : ''}`} />
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Stars({ n, label }) {
  const full = Math.round(n || 0);
  return (
    <span className="stars" role="img" aria-label={label || `${n} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name={i <= full ? 'star-filled' : 'star'} />)}
    </span>
  );
}

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
export function Avatar({ user, size }) {
  const cls = `avatar ${size ? 'avatar-' + size : ''}`.trim();
  if (user && user.image) {
    return <span className={cls} aria-hidden="true" style={{ overflow: 'hidden', padding: 0 }}><img src={user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /></span>;
  }
  return <span className={cls} aria-hidden="true">{initials(user && user.name)}</span>;
}

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
/**
 * Course media. Large: the course cover image (course.coverImageUrl) with the technology logo as a corner badge.
 * Small, or when the cover is missing or fails to load: the technology's logo on its brand colour; otherwise a
 * neutral code mark on the course hue.
 */
export function Thumb({ course, small }) {
  const [failed, setFailed] = useState(null);
  const cls = `thumb ${small ? 'thumb-sm' : ''}`.trim();
  const logo = course && COURSE_LOGOS[course.id];
  const st = logo ? (LOGO_STYLE[logo.name] || { bg: '#111827', fg: '#ffffff' }) : null;
  const cover = !small && course && course.coverImageUrl;
  if (cover && failed !== cover) {
    const sm = cover.replace(/\.webp$/, '-sm.webp');
    return (
      <span className={`${cls} thumb-cover`} aria-hidden="true">
        <img src={cover} srcSet={`${sm} 640w, ${cover} 1280w`} sizes="(max-width: 640px) 100vw, 400px" alt="" loading="lazy" decoding="async" onError={() => setFailed(cover)} />
        {logo && <span className="thumb-badge" style={{ background: st.bg, color: st.fg }}><svg viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d={logo.d} /></svg></span>}
      </span>
    );
  }
  if (logo) {
    return (
      <span className={cls} style={{ background: st.bg, color: st.fg }} aria-hidden="true">
        <svg className="thumb-logo" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d={logo.d} /></svg>
      </span>
    );
  }
  const hue = course && course.hue !== undefined ? course.hue : 190;
  return (
    <span className={cls} style={{ background: `hsl(${hue} 40% 24%)`, color: '#ffffff' }} aria-hidden="true">
      <svg className="thumb-logo thumb-logo-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
    </span>
  );
}

export const COURSE_STATUS = {
  draft: ['Bản nháp', 'badge-neutral', 'pencil'],
  pending: ['Chờ duyệt', 'badge-warn', 'clock'],
  rejected: ['Bị từ chối', 'badge-danger', 'x-circle'],
  published: ['Đã xuất bản', 'badge-success', 'check-circle'],
  hidden: ['Đã ẩn', 'badge-outline', 'eye-off'],
};
export const courseStatusLabel = (status) => (COURSE_STATUS[status] || [status])[0];
export function CourseStatus({ status }) {
  const s = COURSE_STATUS[status] || [status, 'badge-neutral', 'circle'];
  return <span className={`badge ${s[1]}`}><Icon name={s[2]} />{s[0]}</span>;
}

export const ORDER_STATUS = {
  pending: ['Chờ thanh toán', 'badge-warn'],
  paid: ['Đã thanh toán', 'badge-success'],
  failed: ['Thất bại', 'badge-danger'],
  cancelled: ['Đã huỷ', 'badge-neutral'],
  refunded: ['Hoàn tiền', 'badge-info'],
};
export const orderStatusLabel = (status) => (ORDER_STATUS[status] || [status])[0];
export function OrderStatus({ status }) {
  const s = ORDER_STATUS[status] || [status, 'badge-neutral'];
  return <span className={`badge ${s[1]}`}><span className="status-dot" />{s[0]}</span>;
}

export function SpinnerBlock({ text = 'Đang tải…' }) {
  return (
    <div className="card">
      <div className="card-body stack-3" aria-busy="true">
        <p className="row muted"><Icon name="loader" /> {text}</p>
        <div className="skeleton skeleton-line" style={{ width: '70%' }} />
        <div className="skeleton skeleton-line" style={{ width: '90%' }} />
        <div className="skeleton skeleton-line" style={{ width: '55%' }} />
      </div>
    </div>
  );
}

/**
 * Left-nav workspace shell (lecturer / admin areas).
 * items: [{ href, label, icon, count, section, match: RegExp }]
 */
export function Workspace({ items = [], active, label = 'Điều hướng khu vực làm việc', children }) {
  let section = null;
  const path = Codi.path();
  return (
    <div className="workspace">
      <nav className="workspace-nav" aria-label={label}>
        {items.map((it) => {
          const showLabel = it.section && it.section !== section;
          if (showLabel) section = it.section;
          const isActive = active === it.href || (it.match && it.match.test(path));
          return (
            <span key={it.href} style={{ display: 'contents' }}>
              {showLabel && <div className="nav-label">{it.section}</div>}
              <Link to={it.href} aria-current={isActive ? 'page' : undefined}>
                <Icon name={it.icon || 'circle'} />
                <span>{it.label}</span>
                {it.count ? <span className="count count-accent nav-count">{it.count}</span> : null}
              </Link>
            </span>
          );
        })}
      </nav>
      <div className="workspace-content">{children}</div>
    </div>
  );
}

/** Copy button: shows "Đã sao chép" for 1.6s. */
export function CopyButton({ text, label = 'Sao chép', className = 'btn btn-secondary btn-sm' }) {
  const onClick = (e) => Codi.ui.copy(text, e.currentTarget);
  return (
    <button type="button" className={className} onClick={onClick}>
      <Icon name="copy" className="icon-sm" /><span data-copy-label>{label}</span>
    </button>
  );
}
