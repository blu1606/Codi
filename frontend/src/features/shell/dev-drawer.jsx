/**
 * Prototype-only "Kịch bản thử nghiệm" drawer (mockup core.js renderDrawer + #dev-toggle, Alt+K): role switch,
 * forced scenario states and server data reset. Not product UI.
 *
 * <DevToggle /> is a 40 px icon button rendered in the header actions (both layouts), so it never floats over page
 * content or bottom action bars; <DevDrawer /> (mounted once by AppLayout) owns Alt+K and the panel. They share the
 * open state below.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { THEME_OPTIONS, useThemeSync } from './theme';

const SCEN = [
  ['paymentOutcome', 'Kết quả thanh toán', [['success', 'Thành công'], ['slow', 'Chậm (chờ lâu)'], ['expired', 'Mã hết hạn'], ['underpaid', 'Chuyển thiếu tiền'], ['qrfail', 'Không tải được QR'], ['late', 'Chuyển khoản trễ (sau hết hạn)'], ['overpaid', 'Chuyển thừa'], ['unavailable', 'Cổng thanh toán không khả dụng']]],
  ['pathAI', 'AI xếp lộ trình', [['ok', 'Bình thường'], ['fail', 'Lỗi / quá thời gian']]],
  ['materials', 'Tài liệu bài học', [['ok', 'Tải được'], ['error', 'Lỗi tải']]],
  ['aiAssistant', 'AI (trợ lý bài học & AI Chat)', [['ok', 'Bình thường'], ['thinking', 'Đang nghĩ'], ['ratelimit', 'Vượt giới hạn (trợ lý)'], ['error', 'Không khả dụng / lỗi'], ['loadfail', 'Không tải được lịch sử Tutor']]],
  ['codeSandbox', 'Sandbox chạy code', [['ok', 'Bình thường'], ['unavailable', 'Sandbox chạy code không khả dụng']]],
  ['kmap', 'Phân tích bản đồ kiến thức', [['ok', 'Thành công'], ['fail', 'Thất bại'], ['cycle', 'Phát hiện vòng lặp']]],
  ['notifications', 'Thông báo', [['ok', 'Tải được'], ['error', 'Lỗi tải / đánh dấu']]],
  ['sessions', 'Thiết bị đã đăng nhập', [['ok', 'Tải được'], ['error', 'Lỗi tải']]],
  ['profileData', 'Dữ liệu hồ sơ (thống kê, hoạt động)', [['ok', 'Tải được'], ['error', 'Lỗi tải']]],
  ['githubAnalysis', 'Phân tích GitHub (Hồ sơ năng lực)', [['ok', 'Thành công'], ['insufficient', 'Chưa đủ dữ liệu'], ['rate-limit', 'GitHub giới hạn lượt đọc'], ['expired', 'Kết nối hết hiệu lực'], ['failed', 'Thất bại'], ['timeout', 'Quá 60 giây']]],
];
const ROLES = [['guest', 'Khách'], ['learner', 'Học viên'], ['lecturer', 'Giảng viên'], ['admin', 'Quản trị viên']];
// Seeded user signed in for each role.
const ROLE_USER = { guest: null, learner: 'usr-learner-001', lecturer: 'usr-lecturer-001', admin: 'usr-admin-001' };

// shared open state between the header toggle and the drawer
let drawerOpen = false;
const drawerSubs = new Set();
const setDrawerOpen = (v) => { const next = typeof v === 'function' ? v(drawerOpen) : v; if (next === drawerOpen) return; drawerOpen = next; drawerSubs.forEach((f) => f()); };
const useDrawerOpen = () => useSyncExternalStore((f) => { drawerSubs.add(f); return () => drawerSubs.delete(f); }, () => drawerOpen);

export function DevToggle() {
  const open = useDrawerOpen();
  return (
    <button id="dev-toggle" className="dev-toggle" type="button" aria-controls="dev-drawer" aria-expanded={open} title="Kịch bản thử nghiệm (Alt+K)" aria-keyshortcuts="Alt+K" onClick={() => setDrawerOpen((o) => !o)}>
      <svg className="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>
      <span className="sr-only">Kịch bản thử nghiệm</span>
    </button>
  );
}

function switchRole(role) {
  Codi.ui.closeAll();
  Codi.set((s) => { s.currentUserId = ROLE_USER[role]; });
  Codi.go(Codi.homeFor(role));
}

function setScenario(key, value) {
  Codi.set((s) => { s.scenario[key] = value; });
  Codi.ui.toast('Đã đổi kịch bản thử nghiệm.');
}

async function resetData() {
  const r = await Codi.ui.confirm({ title: 'Đặt lại dữ liệu thử nghiệm?', body: 'Mọi thao tác bạn đã làm trong bản thử nghiệm (giỏ hàng, đơn hàng, tiến độ học, chấm bài…) sẽ bị xoá.', reversible: false, confirmLabel: 'Đặt lại', danger: true });
  if (!r.ok) return;
  try {
    await Codi.reset();
  } catch (e) {
    Codi.ui.toast('Không đặt lại được dữ liệu: ' + (e && e.message ? e.message : e), { type: 'danger' });
    return;
  }
  Codi.go('/');
  Codi.ui.toast('Đã đặt lại dữ liệu.', { type: 'success' });
}

export default function DevDrawer() {
  useCodi();
  useThemeSync(); // the drawer is mounted in every layout, so it hosts the theme listener
  const open = useDrawerOpen();
  const setOpen = setDrawerOpen;
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const role = Codi.role();
  const onReset = async () => {
    setResetting(true);
    try { await resetData(); } finally { setResetting(false); }
  };

  return (
    <>
      <div id="dev-drawer" className="dev-drawer" role="region" aria-label="Kịch bản thử nghiệm" hidden={!open}>
        {open && (
          <>
            <div className="row-between"><h3>Kịch bản thử nghiệm</h3><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Đóng"><Icon name="x" /></button></div>
            <p className="dev-note">Chỉ dùng cho bản thử nghiệm — không thuộc giao diện sản phẩm. Phím tắt Alt+K.</p>
            <fieldset><legend>Vai trò</legend><div className="dev-roles">
              {ROLES.map(([r, l]) => <button key={r} type="button" aria-pressed={role === r} onClick={() => switchRole(r)}>{l}</button>)}
            </div></fieldset>
            <fieldset><legend>Chế độ hiển thị</legend>
              {THEME_OPTIONS.map(([v, l]) => (
                <label key={v}><input type="radio" name="dev-theme" value={v} checked={(Codi.theme ? Codi.theme.get() : 'system') === v} onChange={() => { Codi.theme.set(v); Codi.ui.toast('Đã đổi kịch bản thử nghiệm.'); }} /> {l}</label>
              ))}
            </fieldset>
            {SCEN.map(([key, label, opts]) => (
              <fieldset key={key}><legend>{label}</legend>
                {opts.map(([v, l]) => (
                  <label key={v}><input type="radio" name={`dev-${key}`} value={v} checked={(Codi.state.scenario[key] || opts[0][0]) === v} onChange={() => setScenario(key, v)} /> {l}</label>
                ))}
              </fieldset>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onReset} disabled={resetting}><Icon name="rotate-ccw" className="icon-sm" /> Đặt lại dữ liệu</button>
          </>
        )}
      </div>
    </>
  );
}
