/**
 * Prototype-only "Kịch bản thử nghiệm" drawer (mockup core.js renderDrawer + #dev-toggle, Alt+K): role switch and
 * forced scenario states (kept in this browser). Data is reset with `npm run seed`, never from the browser.
 * Not product UI.
 *
 * <DevToggle /> is a 40 px icon button rendered in the header actions (both layouts), so it never floats over page
 * content or bottom action bars; <DevDrawer /> (mounted once by AppLayout) owns Alt+K and the panel. They share the
 * open state below.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { THEME_OPTIONS, useThemeSync } from './theme';
import { api } from '../../lib/api';
import { DEMO_PASSWORD } from './account-store';

const SCEN = [
  ['paymentOutcome', 'Kết quả thanh toán', [['success', 'Thành công'], ['slow', 'Chậm (chờ lâu)'], ['expired', 'Mã hết hạn'], ['underpaid', 'Chuyển thiếu tiền'], ['qrfail', 'Không tải được QR'], ['late', 'Chuyển khoản trễ (sau hết hạn)'], ['overpaid', 'Chuyển thừa'], ['unavailable', 'Cổng thanh toán không khả dụng']]],
  ['aiAssistant', 'AI (trợ lý bài học & AI Chat)', [['ok', 'Bình thường'], ['thinking', 'Đang nghĩ'], ['ratelimit', 'Vượt giới hạn (trợ lý)'], ['error', 'Không khả dụng / lỗi'], ['loadfail', 'Không tải được lịch sử Tutor']]],
  ['kmap', 'Phân tích bản đồ kiến thức', [['ok', 'Thành công'], ['fail', 'Thất bại'], ['cycle', 'Phát hiện vòng lặp']]],
];
const ROLES = [['guest', 'Khách'], ['learner', 'Học viên'], ['lecturer', 'Giảng viên'], ['admin', 'Quản trị viên']];
// Seeded account signed in for each role (backend/scripts/seed-source/data.js).
const ROLE_EMAIL = { guest: null, learner: 'minhanh@codi.vn', lecturer: 'quochuy@codi.vn', admin: 'giabao@codi.vn' };

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

// Signs in for real as the seeded account of that role (shared demo password), or signs out for "Khách".
async function switchRole(role) {
  Codi.ui.closeAll();
  try {
    const email = ROLE_EMAIL[role];
    if (Codi.session.user) await api.post('/api/auth/sign-out', {});
    if (!email) await Codi.refreshSession();
    else await Codi.signIn(email, DEMO_PASSWORD);
  } catch (e) {
    await Codi.refreshSession().catch(() => {});
    Codi.ui.toast('Không đổi được vai trò: ' + (e && e.message ? e.message : e), { type: 'danger' });
    return;
  }
  Codi.go(Codi.homeFor(role));
}

function setScenario(key, value) {
  Codi.set((s) => { s.scenario[key] = value; });
  Codi.ui.toast('Đã đổi kịch bản thử nghiệm.');
}

export default function DevDrawer() {
  useCodi();
  useThemeSync(); // the drawer is mounted in every layout, so it hosts the theme listener
  const open = useDrawerOpen();
  const setOpen = setDrawerOpen;

  useEffect(() => {
    const onKey = (e) => { if (e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const role = Codi.role();

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
            <p className="dev-note">Đặt lại dữ liệu mẫu: dừng máy chủ rồi chạy <code>npm run seed</code> ở thư mục gốc (tự sao lưu trước).</p>
          </>
        )}
      </div>
    </>
  );
}
