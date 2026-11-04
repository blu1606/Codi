/**
 * Notification bell + popover — port of the real app's components/notification-menu.tsx.
 * Loads on mount, on open, every 30 s and on window focus from GET /api/notifications ({ items ≤ 50, unreadCount }).
 * States: loading (skeleton rows), error with "Thử lại", empty, list. "Đánh dấu tất cả đã đọc" only when unread
 * exist (PATCH {all:true}); clicking an item marks it read (PATCH {id}) and follows its link when it is a safe
 * relative path.
 */
import { useEffect, useRef, useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Icon } from '../../components/ui/primitives';
import { LoadingRegion, ShellIcon, Skel } from './shell-ui';
import { notificationPath } from './notification-link';

const POLL_MS = 30000;
const timeFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export default function NotificationMenu({ open, onToggle, onClose }) {
  useCodi();
  const userId = Codi.session.user ? Codi.session.user.id : null;
  const [data, setData] = useState(null); // { userId, items, unreadCount }
  const [failure, setFailure] = useState(null); // { userId, message }
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    const load = async () => {
      const rev = ++revision.current;
      try {
        const res = await api.get('/api/notifications');
        if (!alive || rev !== revision.current) return;
        setData({ userId, items: res.items || [], unreadCount: res.unreadCount || 0 });
        setFailure(null);
      } catch (e) {
        if (!alive || rev !== revision.current) return;
        setFailure({ userId, message: e.message || 'Không thể tải thông báo. Vui lòng thử lại.' });
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [userId, refresh]);

  if (!userId) return null;
  const loaded = !!data && data.userId === userId;
  const error = failure && failure.userId === userId ? failure.message : null;
  const items = loaded ? data.items.map((n) => ({ ...n, read: !!n.readAt })) : [];
  const unread = loaded ? data.unreadCount : 0;

  const markRead = async (item) => {
    if (busy) return;
    revision.current += 1; // a poll that started before this write must not overwrite it
    setBusy(true); setFailure(null);
    try {
      if (!item || !item.read) await api.patch('/api/notifications', item ? { id: item.id } : { all: true });
    } catch (e) {
      setBusy(false);
      setFailure({ userId, message: e.message || 'Không thể đánh dấu đã đọc. Vui lòng thử lại.' });
      return;
    }
    setBusy(false);
    setRefresh((x) => x + 1);
    const path = item ? notificationPath(item.link) : null;
    if (path) { onClose(); Codi.go(path); }
  };

  return (
    <div className="popover-anchor">
      <button type="button" className="btn btn-ghost btn-icon header-icon-btn" onClick={() => { if (!open) setRefresh((x) => x + 1); onToggle(); }}
        aria-expanded={open} aria-haspopup="dialog" aria-label={`Thông báo, ${unread} chưa đọc`}>
        <Icon name="bell" />{unread ? <span className="count-dot" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open && (
        <div className="popover shell-notif-pop" role="dialog" aria-label="Thông báo">
          <div className="shell-pop-head"><strong className="small">Thông báo</strong></div>
          {unread > 0 && (
            <button type="button" className="menu-item" disabled={busy} onClick={() => markRead()}><ShellIcon name="check-check" className="icon-sm" /> Đánh dấu tất cả đã đọc</button>
          )}
          <hr className="shell-sep" />
          {error && (
            <div className="stack-2" style={{ padding: 8 }}>
              <Alert type="danger" body={error} />
              <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh((x) => x + 1)}>Thử lại</button></div>
            </div>
          )}
          {!loaded && !error && (
            <LoadingRegion label="Đang tải thông báo…" className="stack-3 shell-notif-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="row" style={{ gap: 12, alignItems: 'flex-start' }}><Skel w={32} h={32} round /><div className="od-fill stack-2"><Skel w="80%" h={14} /><Skel w="40%" h={12} /></div></div>
              ))}
            </LoadingRegion>
          )}
          {loaded && items.length === 0 && (
            <div className="empty-state shell-notif-empty">
              <div className="empty-icon"><Icon name="bell" /></div>
              <h3>Chưa có thông báo.</h3>
              <p>Thông báo về học tập sẽ xuất hiện tại đây.</p>
            </div>
          )}
          {loaded && items.length > 0 && (
            <div className="shell-notif-list">
              {items.map((n) => (
                <button key={n.id} type="button" className={`notif-item shell-notif-item ${n.read ? '' : 'unread'}`} disabled={busy} onClick={() => markRead(n)}>
                  <span className={`shell-notif-dot ${n.read ? '' : 'is-unread'}`} aria-hidden="true" />
                  <span className="od-fill">
                    <span className="notif-title">{n.title}<span className="sr-only">{n.read ? ', đã đọc' : ', chưa đọc'}</span></span>
                    {n.body && <span className="notif-body">{n.body}</span>}
                    <time className="notif-time" dateTime={n.createdAt}>{timeFmt.format(new Date(n.createdAt))}</time>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
