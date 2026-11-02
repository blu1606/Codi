/**
 * Small UI pieces the shell needs that the shared primitives do not have yet:
 *  - ShellIcon: icons missing from src/lib/icon-paths.js (sun, moon, monitor, smartphone, camera, zoom-in,
 *    shield-check, check-check), same 24px grid and 1.75 stroke as <Icon>; falls back to <Icon> for known names.
 *  - UserAvatar: <Avatar> that shows user.image (uploaded photo or preset) when present.
 *  - LoadingRegion / Skel: port of the real app's components/skeletons/loading-region.tsx and <Skeleton>.
 */
import { useState } from 'react';
import { Avatar, Icon } from '../../components/ui/primitives';

const EXTRA = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'shield-alert': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/>',
  'check-check': '<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
};

export function ShellIcon({ name, className = '' }) {
  if (!EXTRA[name]) return <Icon name={name} className={className} />;
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: EXTRA[name] }} />
  );
}

/** Avatar with the user's image; falls back to initials when there is none or it fails to load. */
export function UserAvatar({ user, size, className = '' }) {
  const [failed, setFailed] = useState(null);
  const src = user && user.image;
  if (!src || failed === src) return <Avatar user={user} size={size} />;
  return (
    <span className={`avatar ${size ? 'avatar-' + size : ''} avatar-img ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" onError={() => setFailed(src)} />
    </span>
  );
}

/** role="status" wrapper with a screen-reader label around skeleton placeholders. */
export function LoadingRegion({ label, className = '', children }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export const Skel = ({ w = '100%', h = 14, round, style }) => (
  <span className="skeleton shell-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: round ? '50%' : undefined, ...style }} />
);

/** Skeleton list rows (real: components/skeletons/list-rows-skeleton.tsx). */
export function ListRowsSkeleton({ rows = 3, withAvatar = true }) {
  return (
    <div className="stack-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ gap: 12 }}>
          {withAvatar && <Skel w={32} h={32} round />}
          <div className="od-fill stack-2"><Skel w="80%" h={14} /><Skel w="40%" h={12} /></div>
        </div>
      ))}
    </div>
  );
}

// GitHub mark (same path as the real app's github-button.tsx).
export function GithubMark({ className = 'icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

/** Scenario flag read with a default (new flags are absent from older saved sessions). */
export const scenario = (state, key, fallback = 'ok') => (state && state.scenario && state.scenario[key]) || fallback;
