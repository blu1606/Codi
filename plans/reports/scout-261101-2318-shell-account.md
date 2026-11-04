# Scout: app shell and account, gap analysis (real app vs codi-rebuild)

Date: 2026-11-01. Read-only scout. Only this file was written.
Real app: `D:\CODE\Study\FPT\Ki_5\SWP391\Codi\apps\web\src`. Rebuild: `D:\CODE\Study\FPT\Ki_5\SWP391\codi-rebuild\src`.
Binding docs: `Codi\docs\mockup\PRODUCT.md`, `Codi\docs\mockup\STATE-MACHINES.md`, `codi-rebuild\docs\porting-guide.md`.

Scope: home, header, user menu, notifications, theme, cart button, auth (sign-in, sign-up, OTP, Google/GitHub, forgot/reset), settings, profile (incl. GitHub "Hồ sơ năng lực"), AI advisor, study activity tracker, skeletons, and the related API routes. Commerce cart/checkout and the lesson player are left to other scouts.

Priority: P1 = core flow, P2 = important, P3 = nice to have. Status: missing / partial / done.

---

## 0. Key findings

1. Auth is the biggest fidelity gap. Real sign-up and forgot-password use a 6-digit email OTP with a 2-minute expiry, a visible countdown, and resend after 30 s. The rebuild has a simplified OTP (lock after 3 wrong tries, resend after 30 s, no expiry or timer). Forgot-password differs in kind (see section 4, item 1).
2. Missing entirely: theme toggle (light / dark / system), session and device list, avatar upload and presets, profile contribution heatmap and year switch, study heartbeat, "Hồ sơ năng lực" profile tab, email-verification card, home features / mentor / footer sections, AI deep-link params.
3. Partial: notification popover (no loading, error, retry or 30 s polling), user menu (missing learner items and theme group), change-email (no resend, no back-to-edit step), change-password (no "Quên mật khẩu hiện tại?" recovery), home popular courses (no sort by popularity, no states), AI advisor (feedback has 3 of 5 reasons, no deep links, no skeleton).
4. The rebuild already does well: auth modal with intent and course context (`openSignIn`), simulated Google account chooser with consent and denial notices, intake chips in AI advisor, thinking / stop / error / rate-limit states, course CTAs by ownership, GitHub consent flow (partial).
5. PRODUCT.md, STATE-MACHINES.md and the real code disagree in several places (section 4). Decide these before porting the missing items, or the port will copy whichever side was read last.

---

## 1. Summary table

| # | Feature | Real-app source files | Rebuild status | Priority |
|---|---|---|---|---|
| 1 | Home hero (eyebrow, title, CTAs, stats, image collage) | `app/page.tsx`, `components/hero.tsx`, `hero.module.css` | partial (different copy, no stats row, no collage) | P2 |
| 2 | Home features section (4 cards) | `components/home-features.tsx` | missing | P3 |
| 3 | Home popular courses (sort=popular, limit 4, loading / error / empty) | `components/home-courses.tsx`, `lib/course-catalog` | partial (first 3 published, no states) | P2 |
| 4 | Home AI Mentor section | `components/home-mentor.tsx` | missing | P3 |
| 5 | Home footer (3 link groups + contact) | `components/home-footer.tsx` | missing | P3 |
| 6 | Home logo intro animation | `components/home-logo-intro.tsx`, `home-scroll-reveal.tsx` | missing | P3 |
| 7 | Header nav per role, mobile sheet | `components/header.tsx` | done (no "Trang chủ" link; header shown on /settings in rebuild) | P3 |
| 8 | Cart nav button (count, aria, failed label) | `components/cart-nav-button.tsx` | done (failed-count label missing) | P3 |
| 9 | Notification menu (bell, unread, mark-all, loading, error, empty, 30 s poll) | `components/notification-menu.tsx`, `app/api/notifications/route.ts`, `lib/notification-service.ts` | partial | P2 |
| 10 | User menu (role home, learner items, theme group, sign-out with error) | `components/user-menu.tsx` | partial | P2 |
| 11 | Theme toggle Sáng / Tối / Theo hệ thống | `components/mode-toggle.tsx`, `components/theme-provider.tsx` | missing (only the dev-drawer scenario flag) | P2 |
| 12 | Guest sign-in entry | `components/header.tsx`, `user-menu.tsx` (link to /login) | done (rebuild opens modal, see section 4) | P1 |
| 13 | Sign-in form (email, password, remember email, forgot link, social, validation, busy) | `components/sign-in-form.tsx`, `lib/sign-in-error.ts`, `app/login/page.tsx` | partial | P1 |
| 14 | Sign-up form + OTP step | `components/sign-up-form.tsx` | partial | P1 |
| 15 | OTP input (6 boxes, 2-min timer, expired state, resend after 30 s) | `components/otp-input.tsx` | partial | P1 |
| 16 | Google / GitHub social buttons | `components/google-button.tsx`, `github-button.tsx` | partial (Google chooser simulated; GitHub login instant, no chooser; no GitHub on sign-up) | P2 |
| 17 | Auth modal for gated actions (intent, course context) | `components/auth/auth-modal.tsx` | done | P1 |
| 18 | Forgot password (OTP, two steps on one page) | `app/forgot-password/page.tsx` | partial (different flow, see section 4) | P1 |
| 19 | Reset password (token link, account-source mode, invalid-link state) | `app/reset-password/page.tsx`, `components/settings/account-reset-password-form.tsx` | partial | P2 |
| 20 | Settings shell (left nav, close/Esc, sections) | `app/settings/page.tsx`, `components/settings/account-settings.tsx` | partial | P3 |
| 21 | Account tab: edit name in dialog (max 100), masked email, verified badge | `components/settings/account-settings.tsx` | partial (inline edit, 2-char mask) | P2 |
| 22 | Change email (OTP to new address, resend, back-to-edit, errors) | `components/settings/change-email-form.tsx` | partial | P2 |
| 23 | Password change + "Quên mật khẩu hiện tại?" recovery | `components/profile/change-password-card.tsx`, `components/settings/password-recovery-form.tsx` | partial (no recovery) | P2 |
| 24 | Sessions list and device logout | `components/settings/session-settings.tsx` | missing | P2 |
| 25 | Linked accounts (GitHub row) | `account-settings.tsx` (connections tab) | partial | P3 |
| 26 | Profile card: edit name and avatar, disabled email | `components/profile/profile-card.tsx`, `avatar-picker.tsx` | missing (avatar), partial (edit) | P2 |
| 27 | Avatar upload (crop, zoom, 5 MB, presets) | `components/profile/avatar-picker.tsx`, `lib/avatar-presets.ts`, `app/api/user/avatar/route.ts`, `app/api/avatar/route.ts` | missing | P2 |
| 28 | Email verification card (unverified state) | `components/profile/email-verification-card.tsx` | missing | P3 |
| 29 | Profile overview: stats, heatmap with year switch, course list, transactions | `components/profile/student-profile-overview.tsx`, `app/api/student/profile/route.ts` | partial | P2 |
| 30 | Profile tabs (Tổng quan / Khóa học / Giao dịch / Hồ sơ năng lực, learner-only) | `app/profile/page.tsx`, `profile-tabs.ts`, `profile-view.tsx` | partial (no năng lực tab) | P2 |
| 31 | GitHub skill profile ("Hồ sơ năng lực") | `components/profile/github-profile-panel.tsx`, `github-profile-result.tsx`, `github-learner-card.tsx`, `app/profile/github/page.tsx`, `app/api/github-profile/route.ts` | partial (separate page, consent flow only) | P2 |
| 32 | AI advisor landing and intake | `app/ai/page.tsx`, `components/ai/ai-advisor-view.tsx`, `lib/ai-advisor-contract.ts` | done (intake, chips, suggestions); GitHub card is rebuild-only | P1 |
| 33 | AI advisor answer states (thinking, stop, error, rate-limit, no match) | `components/ai/ai-advisor-view.tsx` | done (rebuild states match, copy differs slightly) | P1 |
| 34 | AI feedback reasons (5 values) | `lib/ai-advisor-contract.ts` (`DOWN_VOTE_REASONS`) | partial (3 of 5) | P2 |
| 35 | AI deep links (`?topic=`, `?prompt=`, `?action=enroll-free`, `&courseId=`) | `app/ai/page.tsx`, `ai-advisor-view.tsx` | missing | P2 |
| 36 | AI advisor loading skeleton | `components/skeletons/ai-advisor-skeleton.tsx`, `app/ai/loading.tsx` | missing | P3 |
| 37 | Study activity heartbeat (30 s, focus-owned) | `components/study-activity-tracker.tsx`, `app/api/learn/[courseId]/lessons/[lessonId]/activity/route.ts` | missing | P2 |
| 38 | Skeleton and LoadingRegion system | `components/skeletons/*` (13 files), `loading.tsx` files | missing (mockup has spinners, see 2.8) | P3 |
| 39 | Dev foundation page (`/dev/foundation`, 404 in prod) | `app/dev/foundation/*` | not needed (design review surface) | skip |
| 40 | Dev drawer "Kịch bản thử nghiệm" (Alt+K) | rebuild only (mockup prototype) | done in rebuild; STATE-MACHINES 23.1 says prototype-only | n/a |

---

## 2. Details per missing or partial feature

### 2.1 Sign-in, sign-up, OTP, social (features/shell/auth.jsx, dev drawer)

**Sign-in (real: `sign-in-form.tsx`, `login/page.tsx`).**
- Title "Chào mừng trở lại!", description "Đăng nhập để tiếp tục học tập và thanh toán". Course box "Khoá học đang chọn" with the course title and intent reason (same box in the modal).
- Fields: "Địa chỉ Email" (zod: "Địa chỉ email không hợp lệ"), "Mật khẩu" (zod: "Mật khẩu phải có ít nhất 8 ký tự").
- Checkbox "Ghi nhớ email" (stores only the email in `localStorage.codi_remember_email`, not the password). Link "Quên mật khẩu?" to `/forgot-password`.
- Submit "Đăng nhập", busy "Đang đăng nhập...". Success toast "Đăng nhập thành công!". Error: inline Alert plus toast. Invalid credentials map to "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.". Other errors show the server message or "Đăng nhập thất bại. Vui lòng thử lại.".
- Divider "Hoặc tiếp tục với", buttons "Tiếp tục với Google" and "Tiếp tục với GitHub". Footer "Chưa có tài khoản? Đăng ký ngay".
- Loading: `AuthFormSkeleton` while the session is pending.
- Rebuild gaps: no busy state, no 8-character password rule, "Ghi nhớ đăng nhập" checkbox does nothing (PRODUCT wording, real wording is "Ghi nhớ email"), GitHub button logs in instantly as `usr-learner-001` with no chooser, no error state.
- Changes: `LoginForm` in `features/shell/auth.jsx`. Add remember-email to `localStorage` (try/catch), busy label, and a GitHub chooser that reuses `GoogleForm` with a GitHub account list.

**Sign-up and OTP (real: `sign-up-form.tsx`, `otp-input.tsx`).**
- Step 1: title "Tạo tài khoản", description "Đăng ký tài khoản Codi mới". Social buttons "Đăng ký với Google" / "Đăng ký với GitHub", divider "Hoặc đăng ký bằng Email". Fields "Họ và tên" (min 2: "Tên người dùng phải có ít nhất 2 ký tự"), "Email", "Mật khẩu" (min 8). Submit "Đăng ký tài khoản", busy "Đang tạo tài khoản...". Footer "Đã có tài khoản? Đăng nhập".
- Step 2: icon ShieldCheck, title "Xác thực tài khoản", description "Mã OTP gồm 6 chữ số đã được gửi tới email <email>. Mã có hiệu lực trong 2 phút.". Submit "Xác thực và hoàn tất", busy "Đang xác thực...". Link "Nhập nhầm email? Đăng ký lại" returns to step 1. Success toast "Xác thực email thành công! Đang chuyển hướng vào hệ thống..." then redirect after 1 s.
- Rebuild: `RegisterForm` (no name length rule, has 8-char password rule and duplicate-email check) and `OtpForm` (six boxes, auto-advance, backspace, paste, 3-try lock with message "Bạn đã nhập sai quá nhiều lần...", resend after 30 s with countdown text "Gửi lại mã sau N giây"). The rebuild has "Sửa" next to the email and wrong-code messages that count down "Còn N lần thử".
- Missing: 2-minute expiry and its display, expired-state text "Mã OTP đã hết hạn (2 phút)", resend that clears the boxes and refocuses box 1 (rebuild does clear), "Nhập nhầm email? Đăng ký lại" link, name length rule, `aria-label` text ("Chữ số N của mã xác thực"), `autoComplete="one-time-code"` on box 1.
- Rules to keep: PRODUCT A1 says wrong code keeps the typed values and shows the error under the boxes; expired code shows a resend prompt; too many attempts shows a wait message. Rebuild already matches these.
- Changes: `RegisterForm`, `OtpForm`, `submitOtp` in `features/shell/auth.jsx`. The timer can reuse the existing `tick` pattern.

**Google and GitHub (real: `google-button.tsx`, `github-button.tsx`).**
- Real buttons show "Đang kết nối..." while redirecting, and an error toast "Đăng nhập với Google thất bại. Vui lòng thử lại hoặc đăng nhập bằng Email." or "Không thể kết nối đến máy chủ Google.".
- Rebuild: Google chooser (3 accounts, two steps: pick, then "Cho phép" / "Từ chối", with notices and the "Huỷ" path) is richer than the real redirect and matches the mockup. GitHub has no chooser and no sign-up button.
- Changes: generalise `GoogleForm` into a provider chooser (`provider: 'google' | 'github'`) and add the GitHub button to `RegisterForm`.

**Auth modal (real: `components/auth/auth-modal.tsx`).** Done in rebuild (`openSignIn(intent, { reason, courseTitle })`, intent continuation, same-page return). Real modal has no intent continuation (it calls `onSuccess`). Keep the rebuild version.

**Forgot and reset password.** See section 4, item 1 for the conflict. Real behaviour:
- Step 1: title "Quên mật khẩu?", description "Nhập email của bạn để nhận mã OTP 6 chữ số khôi phục mật khẩu.", label "Email tài khoản", submit "Nhận mã OTP qua Email" (busy "Đang gửi mã OTP..."). Link "← Quay lại trang Đăng nhập". Success toast "Mã OTP gồm 6 chữ số đã được gửi tới email của bạn!".
- Step 2 (same card): title "Đặt lại mật khẩu", description "Nhập mã OTP gồm 6 chữ số đã gửi tới <email> (hiệu lực 2 phút) và tạo mật khẩu mới.", OTP block, fields "Mật khẩu mới" (min 8) and "Xác nhận mật khẩu mới", submit "Cập nhật mật khẩu mới" (busy "Đang cập nhật..."), link "← Đổi địa chỉ email khác". Success toast then redirect to `/login` after 1.2 s.
- Token route `/reset-password?token=…` (real): no token gives the "Liên kết không hợp lệ" card with "Yêu cầu liên kết mới"; error box shows the server message; redirect after 1.5 s.
- Account route `/reset-password?source=account` (real): reached from "Quên mật khẩu hiện tại?" in settings. Shows "Email đã được xác thực: <email>", warning "Sau khi đổi mật khẩu, bạn sẽ được đăng xuất khỏi các thiết bị.", and redirects to `/login` with toast "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.".
- Rebuild: neutral "Kiểm tra email của bạn" step with a simulated link, `ResetPasswordPage` with two fields and a success page. No OTP, no invalid-link state, no account mode.
- Changes: `ForgotPasswordPage`, `ResetPasswordPage` in `features/shell/auth.jsx`. If the OTP flow is chosen, drop the link step and reuse `OtpForm`.

### 2.2 Settings (real: `app/settings/page.tsx`, `components/settings/*`; rebuild: `features/shell/account-pages.jsx`)

**Layout.** Real: full-height page without the app header, left card with avatar, name and "Sửa Hồ Sơ" link to `/profile`, nav "Tài khoản" with three items: "Thông tin tài khoản", "Mật khẩu & Bảo mật", "Tài khoản liên kết". Close X and Esc go to `/dashboard`. Rebuild: `Workspace` with the header, no avatar card, no Esc. Changes: P3.

**Account tab.**
- Title "Thông tin tài khoản", subtitle "Quản lý tên hiển thị và email đăng nhập.".
- Name row: "Tên hiển thị" with button "Sửa" (aria "Chỉnh sửa tên hiển thị"). Real opens a dialog "Chỉnh sửa tên hiển thị" (input max 100, buttons "Hủy" and "Lưu thay đổi" / "Đang lưu..."; save disabled when empty or unchanged). Success toast "Đã cập nhật tên hiển thị.". Rebuild: inline edit with "Lưu" / "Huỷ" (acceptable, but max length missing).
- Email row: masked as `••••••••@domain` (real), toggle "Hiện" / "Ẩn" with aria-pressed, badge "Đã xác thực", button "Đổi email". Rebuild masks the first two characters (mockup style), which is a minor choice; keep the mockup mask.
- Help text: "Khi đổi email, chúng tôi gửi mã xác thực đến địa chỉ mới. Email cũ vẫn dùng được cho đến khi bạn xác thực." (rebuild has it).
- Unverified state: `EmailVerificationCard` (title "Tài khoản chưa xác thực email", button "Gửi mã OTP xác thực", then OTP and "Xác nhận OTP" / "Thu gọn"). Rebuild has no unverified state (see section 4, item 14).

**Change email (real: `change-email-form.tsx`).**
- Step 1: label "Email mới", placeholder "Nhập email mới của bạn", helper "Email hiện tại giữ nguyên cho đến khi bạn xác thực email mới thành công.", submit "Gửi mã xác thực" (busy "Đang xử lý...").
- Step 2: "Kiểm tra hộp thư <email> và nhập mã xác thực gồm 6 chữ số.", OTP with resend (same 2-min component), link "Nhập email khác" (returns to step 1 and clears the code), submit "Xác nhận và cập nhật email".
- Errors: "Vui lòng nhập địa chỉ email hợp lệ.", "Email mới phải khác email hiện tại.", "Email này đã được liên kết với một tài khoản khác. Vui lòng sử dụng email khác.", "Mã xác thực không đúng. Vui lòng kiểm tra lại.", "Mã xác thực đã hết hạn. Vui lòng gửi lại mã.", "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.", "Bạn thao tác quá nhanh. Vui lòng chờ một phút rồi thử lại.".
- Success toast "Đã xác thực và cập nhật email. Bạn có thể dùng email mới để đăng nhập.".
- Rebuild `ChangeEmailForm`: duplicate check ("Email này đã được dùng cho tài khoản khác."), code "123456", no resend, no "Nhập email khác", no same-as-current check, no expiry. Changes: P2.

**Password change (real: `change-password-card.tsx`, `password-recovery-form.tsx`).**
- Fields "Mật khẩu hiện tại", "Mật khẩu mới", "Xác nhận mật khẩu mới" (placeholder "Ít nhất 8 ký tự"). Submit "Cập nhật mật khẩu" (busy "Đang lưu thay đổi..."). Success toast "Đổi mật khẩu thành công! Các phiên đăng nhập khác đã được đăng xuất.". Other sessions are revoked.
- Recovery: text "Không nhớ mật khẩu hiện tại? Nhận mã xác thực qua email đang liên kết với tài khoản để đặt mật khẩu mới.", link "Quên mật khẩu hiện tại?" (busy "Đang gửi mã..."). Then the OTP form: "Nhập mã 6 số đã gửi đến <email> để tiếp tục đặt mật khẩu mới.", submit "Xác thực mã và tiếp tục", "Quay lại đổi mật khẩu". Success goes to `/reset-password?source=account`.
- Rebuild `SecurityTab`: three fields, errors, success Alert ("Đã đổi mật khẩu", "Các thiết bị khác cần đăng nhập lại."). Current password is fixed to `codi123`. Missing: recovery link and its OTP step. Also, the rebuild has a sign-out button in this tab. Real settings has none (PRODUCT A3 keeps "Đăng xuất" reachable, so keep it).

**Sessions (real: `session-settings.tsx`).** Missing in rebuild.
- Collapsible header "Thiết Bị Đã Đăng Nhập" with the right side showing a skeleton, "Không thể tải", or "N phiên".
- Text "Các phiên đăng nhập đang hoạt động. Một thiết bị có thể có nhiều phiên.", button "Tải lại".
- Each row: device label from the user agent ("Chrome · Windows", fallback "Thiết bị không xác định"), "Đăng nhập: <date vi-VN>", current session marked "Phiên hiện tại" (no button), others get "Đăng xuất" (busy "Đang đăng xuất..."), toast "Đã đăng xuất thiết bị.".
- Empty: "Không có phiên đăng nhập đang hoạt động.". Error: "Không thể tải danh sách thiết bị. Vui lòng thử lại.".
- Data: `sessions[]` per user in seed `{ id, device, browser, os, createdAt }`, with one marked current. Files: `account-pages.jsx` (SecurityTab), `server/seed-source/data.js`.

**Linked accounts (real: connections tab).** Row "GitHub": "Chưa kết nối. Codi chỉ đọc repo công khai khi bạn xác nhận phân tích." / "Đã kết nối @<login>". Buttons "Kết nối GitHub" (real: OAuth link, error "Không thể mở kết nối GitHub. Bạn có thể thử lại sau."), "Mở Hồ sơ năng lực", or "Xem hồ sơ năng lực" when connected. Rebuild: "Xem phân tích", "Phân tích lại", "Ngắt kết nối" (confirm), and "Kết nối GitHub" (consent). Rebuild is close; PRODUCT A3 also wants an overflow menu and a "Đặt mật khẩu trước khi ngắt kết nối" guard when GitHub is the only sign-in method. Changes: P3.

### 2.3 Profile (real: `app/profile/*`, `components/profile/*`; rebuild: `features/shell/account-pages.jsx` `ProfilePage`)

**Profile card (real: `profile-card.tsx`).**
- View: avatar circle (320 px max), name (h3), role badges, "Đã xác thực" (ShieldCheck) or "Chưa xác thực", email, "Tham gia: <date vi-VN>", button "Chỉnh sửa hồ sơ".
- Edit: heading "Chỉnh sửa hồ sơ", label "Ảnh đại diện (Cloudflare R2)" with `AvatarPicker`, "Họ và tên" (placeholder "Nhập họ và tên của bạn"), "Email đăng ký" disabled with helper "Email là định danh tài khoản, không thể thay đổi trực tiếp.", buttons "Lưu thay đổi" and "Huỷ". Errors: "Họ và tên không được để trống". Success toast "Cập nhật thông tin hồ sơ thành công!".
- Real role badge labels are hard-coded English ("Learner", "Lecturer", "Admin") in `profile-card.tsx`. Keep Vietnamese per PRODUCT (see section 4).
- Rebuild: static header (Avatar initials, name, "email · role", "Tham gia từ", "Email đã xác thực" badge), with editing only in settings. Changes: add the edit card, or link "Chỉnh sửa hồ sơ" to the settings name dialog. P2.

**Avatar (real: `avatar-picker.tsx`, `lib/avatar-presets.ts`).**
- Upload: file input, max 5 MB (toast "Ảnh không được vượt quá 5MB"), JPEG / PNG / WebP / SVG only (server: "Định dạng file không được hỗ trợ. Vui lòng chọn file JPEG, PNG, WebP hoặc SVG.").
- Crop dialog: zoom slider and +/- buttons, drag or arrow-key pan, Esc closes, Tab trapped, output 512×512 JPEG, "Không thể đọc ảnh" error.
- Presets: six SVG avatars (Codi Bot, Cyber Hacker, Tech Wizard, Pixel Ninja, Algo Master, Coffee Dev) with colour backgrounds.
- Default when no image: generated avatar from the name.
- Rebuild: none. P2. Simulation: presets as inline SVG data URIs, upload resized to 512 px through canvas and stored as a data URL in `user.image` (cap about 200 KB), same copy and limits.

**Overview (real: `student-profile-overview.tsx`, `ProfileStats`).**
- Stats: "Tiến độ trung bình" and "Ngày hoạt động" (values from the API; error "Không thể tải thống kê hồ sơ."). Loading shows skeleton tiles.
- Card "Khóa học của tôi": per course title, status "Đã hoàn thành" (progress 100) or "Đang học", progress bar, "N% hoàn thành", button "Xem lại" / "Tiếp tục học" (disabled in real). Empty: "Bạn chưa đăng ký khóa học nào.".
- Card with contribution heatmap: heading "<N> contributions in <year>", year buttons (current, −1, −2), loading "Đang tải hoạt động <year>…", error with "Thử lại", 53×7 grid, cell tooltip "<N> contributions on <weekday date>" or "No contributions on …", legend "Less … More". Real heading copy is English; keep it or translate per the copy rule (decision needed).
- Transactions: "Lịch sử giao dịch", rows "Mã: <id>", "Ngày: <date>", "Khóa học: <courseId>", amount, status. Empty "Chưa có giao dịch nào.".
- Rebuild `ProfilePage`: three stat tiles (courses, lessons done, successful transactions), a security card, a course list with links, and a transactions table with "Tiếp tục thanh toán" for pending orders. No heatmap, no year switch, no "Ngày hoạt động". Changes: add the heatmap using `charts.calendar` (exists in `src/lib/charts.js` line 292) fed by the activity log (section 2.7). P2.

**Tabs (real: `profile-tabs.ts`).** "Tổng quan" (`/profile`), "Khóa học" (`?tab=courses`), "Giao dịch" (`?tab=transactions`), "Hồ sơ năng lực" (`?tab=nang-luc`, learner only; non-learners are sent to overview). Rebuild has the first three and no năng lực tab. P2.

**GitHub skill profile (real: `github-profile-panel.tsx` 753 lines, `github-profile-result.tsx`, `github-profile-evidence.tsx`, `github-profile-stack.tsx`, `github-learner-card.tsx`, `app/api/github-profile/route.ts`).**
- Entry points: tab `nang-luc`, user menu "Hồ sơ năng lực", settings connections row, learner card on home.
- States in real: not connected (explainer + "Kết nối GitHub"), consent, analysing (checklist "Đang phân tích GitHub…", note "chủ, không phải tiến độ thực tế"), ready with "Phân tích lúc <time> · <n> repo được chọn", "GitHub đã kết nối. Chưa có hồ sơ năng lực đã lưu.", insufficient data "Chưa đủ dữ liệu để ước tính", stale >90 days "Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng …", re-analysing "Đang phân tích lại. Kết quả trước vẫn hiển thị bên dưới", failed "Chưa tạo được hồ sơ năng lực. Bạn có thể thử lại.", timeout 60 s "Đã hết thời gian chờ 60 giây…", rate limit "GitHub đang giới hạn lượt đọc", expired "Kết nối GitHub đã hết hiệu lực", disconnect dialog "Ngắt kết nối GitHub?" and "Chưa ngắt kết nối được GitHub".
- Consent copy: "Danh sách repo công khai (bỏ qua repo fork và repo trống)", "Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia …", "Để sau" (no analysis started), button "Tôi đồng ý · Phân tích".
- Language block: "Ngôn ngữ trong repo công khai" with "Ước tính từ repo công khai, không phải điểm đánh giá chính thức.".
- Rebuild `features/shell/github-api.jsx` (421 lines): consent, account picker, permission, analysing, result, cancel and denied notices, disconnect confirm, reanalyse. Route is `/github/analysis` (separate page), not a profile tab. Missing: profile tab placement, "Để sau", "Chưa đủ dữ liệu", 90-day stale notice, rate-limit and expired-connection states, 60 s timeout copy, language disclaimer, "Phân tích GitHub" vs "Phân tích lại" labels.
- PRODUCT L14 items not present in real code (per-item "Không đúng", level edit, exclude repo, "Xoá hồ sơ năng lực", 24 h cooldown): see section 4, item 6. Do not port them until decided.
- Changes: `github-api.jsx` (states, route), `profile-tabs` equivalent in `account-pages.jsx`, `shell/routes.jsx`.

**Email verification card.** Missing (P3, undecided, see section 4).

### 2.4 Header, user menu, notifications, theme, cart (real: `header.tsx`, `user-menu.tsx`, `notification-menu.tsx`, `mode-toggle.tsx`, `cart-nav-button.tsx`; rebuild: `features/shell/header.jsx`)

**Header.**
- Real nav per role (same labels as rebuild): guest "Khoá học", "AI"; learner "Khoá học", "Học tập của tôi", "AI"; lecturer "Khoá học" plus "Giảng dạy"; admin "Quản trị", "Khoá học". Active link via `aria-current`. Mobile: sheet titled "Menu Codi" with the same links and the cart row.
- Real hides the header on `/settings`. Rebuild shows it. Changes: P3.
- Rebuild has no "Trang chủ" nav item (PRODUCT §2.1 lists it). Decide (section 4).

**Cart button (real: `cart-nav-button.tsx`).** Icon button with aria "Giỏ hàng, N khoá học", failed state label "Giỏ hàng, không tải được số khoá học", refresh on `codi:cart-updated`, hidden for lecturer and admin. Mobile row: "Giỏ hàng" with count pill. Rebuild: done for count and aria. Missing failed label and mobile count pill style (P3).

**Notification menu (real: `notification-menu.tsx`).**
- Bell, aria "Thông báo, N chưa đọc", red count badge capped at "99+".
- Popover (384 px): heading "Thông báo"; "Đánh dấu tất cả đã đọc" only when unread exist (busy disables it).
- Loading: three skeleton rows and "Đang tải thông báo…". Error: "Không thể tải thông báo. Vui lòng thử lại." with "Thử lại". Empty: "Chưa có thông báo." with description "Thông báo về học tập sẽ xuất hiện tại đây.".
- Items: unread dot (primary) or read dot (border), title, body, time. Screen-reader suffix ", chưa đọc" / ", đã đọc". Clicking marks read and navigates when the link is a safe relative path. Scroll area max 60 dvh.
- Refresh: on open, every 30 s, and on window focus.
- Rebuild: popover with a max of 8 items, "Đánh dấu đã đọc" for all (text differs from real), relative time, empty "Chưa có thông báo." (no description). Missing: loading, error and retry, 30 s polling, 99+ cap, screen-reader state. Changes: P2. Simulation: `setInterval(…, 30000)` in the header and a store subscription.

**User menu (real: `user-menu.tsx`).**
- Trigger: avatar (image or initials), first name (last word of the name), chevron. Guest: button "Đăng nhập" to `/login`.
- Panel (256 px): name (truncate), email, role badge (`ROLE_LABEL`), items: role home ("Bàn làm việc" learner, "Khu vực giảng dạy" lecturer, "Bảng quản trị" admin), learner-only "Tiến độ & kết quả" (`/progress`), "Hồ sơ cá nhân (Profile)", learner-only "Hồ sơ năng lực" (`?tab=nang-luc`), "Cài đặt (Setting)", theme group "Giao diện" (Sáng / Tối / Theo hệ thống), separator, "Đăng xuất" (destructive, busy disables it, error toast "Không thể đăng xuất. Vui lòng thử lại.", then `/`).
- Rebuild `header.jsx` popover: name, email, role badge, "Bàn làm việc" / "Khu vực giảng dạy" / "Bảng quản trị", "Hồ sơ cá nhân", "Cài đặt", "Đăng xuất". Missing: "Tiến độ & kết quả", "Hồ sơ năng lực", theme group. Copy: real and PRODUCT keep the English in brackets ("Hồ sơ cá nhân (Profile)", "Cài đặt (Setting)"); rebuild dropped them (section 4).

**Theme (real: `mode-toggle.tsx`, `theme-provider.tsx`).** Real uses next-themes with a radio group in the user menu: "Sáng", "Tối", "Theo hệ thống" (default system). PRODUCT §2.1 puts a theme toggle in the header. Rebuild only sets `data-theme` from the dev-drawer flag (`Codi.state.scenario.theme`, `lib/codi.js` line ~137), so there is no user control. Changes: add `Codi.state.theme` (`light` | `dark` | `system`) kept in `localStorage` (try/catch), applied to `<html data-theme>`, with `prefers-color-scheme` for system. Add the radio group in the user menu. P2. See section 4, item 9 about where it lives.

### 2.5 Home (real: `app/page.tsx`, `components/hero.tsx`, `home-*.tsx`; rebuild: `features/commerce/home-page.jsx`)

- **Hero.** Real eyebrow "Thế hệ học lập trình mới với trợ lý AI" (pill with Rocket icon); title in English "A new way to learn & get knowledge" (copy rule conflict, section 4); subtitle "Học lập trình thông minh hơn với trợ lý AI, đa dạng các khóa học từ cơ bản đến nâng cao, thực hành code trực tiếp và lộ trình học cá nhân hóa hoàn hảo."; CTAs "Bắt đầu học ngay" (→ `/dashboard`) and "Khám phá khóa học" (→ `/courses`); stats row "Lộ trình / Theo mục tiêu học tập", "Khóa học / Khám phá chủ đề lập trình", "Trợ lý AI / Hỗ trợ học tập"; right collage of three images with float animation.
- Rebuild hero: eyebrow "Khoá học lập trình · Lộ trình cá nhân hoá", title "Học đúng thứ bạn cần, theo thứ tự hợp lý với bạn", CTAs "Khám phá khoá học" and "Hỏi AI Codi". Keep the mockup copy (copy rule). Add the stats row (P3) and skip the collage. Overall P2 because the home is the first screen.
- **Features section.** Real eyebrow "Tính năng ưu việt", title "Phương pháp học thông minh & hiệu quả hơn", four cards: "Lộ trình cá nhân hóa" (highlighted), "Khóa học chuyên sâu", "AI Mentor 24/7", "Thực hành trực tiếp". Not in the mockup. P3, copy needs a decision.
- **Popular courses.** Real: eyebrow "Khóa học", title "Khóa học phổ biến nhất", subtitle "Khám phá các khóa học được nhiều học viên lựa chọn nhất.", link "Xem tất cả khóa học". Data `?sort=popular&limit=4`. Loading: four skeleton cards with role status "Đang tải khóa học…". Error: "Không thể tải khóa học. Vui lòng thử lại." with "Thử lại". Empty: "Các khóa học sẽ sớm được cập nhật. Hãy quay lại sau nhé!". Card: level label (Beginner → "Cơ bản", Intermediate → "Trung cấp", Advanced → "Nâng cao"), "<n> học viên" (`enrollmentCount`), duration, CTA "Bắt đầu học" (`aria-label` "Bắt đầu học: <title>"), fallback cover with category label and "CODI / LEARN BY BUILDING".
- Rebuild: `published().slice(0, 3)`, no sort, no states. Changes: sort by enrolment count, show 4, add loading / error / empty, and "Bắt đầu học" wording (mockup-binding, check). P2.
- **AI Mentor section.** Eyebrow "AI Mentor", title "AI Mentor - Trợ lý học tập thông minh luôn kề vai", paragraph, two benefits ("Giải thích logic code phức tạp", "Phát hiện lỗi logic & gợi ý sửa đổi"), link "Trò chuyện với AI Mentor →" to `/ai`, illustration. P3.
- **Footer.** Real: brand text "Học lập trình cùng trợ lý AI và lộ trình thiết kế riêng cho mỗi cá nhân. Codi đồng hành từ những dòng code đầu tiên.", groups "Nền tảng", "Tài nguyên", "Hỗ trợ", "Liên hệ" (text "Bạn cần hỗ trợ học tập? Trao đổi cùng AI Mentor để tìm hướng đi phù hợp." and "Trò chuyện với Codi"). Only on home. P3.
- **Logo intro.** Real plays a logo grow (1.8 s) then flies to the header logo, then reveals hero, menu, and images; skipped with reduced motion; on return to home only the content reveal plays. P3, nice to have. Rebuild must not invent states, so keep it optional.

### 2.6 AI advisor (real: `app/ai/page.tsx`, `components/ai/ai-advisor-view.tsx` 1208 lines, `lib/ai-advisor-contract.ts`; rebuild: `features/commerce/ai-advisor-page.jsx`)

Done in rebuild: landing and composer, guest line, intake row "Codi đang hiểu về bạn" with removable chips and "Sửa", intake questions with "Bỏ qua", thinking "Codi đang suy nghĩ…" with "Dừng", error "Codi tạm thời không phản hồi" with "Thử lại", structured answers (cards, table, order, follow-up chips "Hỏi tiếp"), 👍/👎 with "Câu trả lời hữu ích" / "Câu trả lời chưa tốt", course CTAs by ownership ("Tiếp tục học", "Đã có trong giỏ · Xem giỏ hàng", "Tiếp tục thanh toán", "Đăng ký miễn phí", "Thêm vào giỏ"), toasts for cart and enrol, gated actions via `openSignIn`.

Differences and gaps:
- Rate-limit alert: real shows only the body "Đợi vài phút rồi thử lại." (no title). Rebuild adds the title "Bạn đã hỏi quá nhiều trong thời gian ngắn". Pick one (mockup vs real, section 4).
- Feedback reasons: real `DOWN_VOTE_REASONS` = "Sai trình độ", "Không hợp mục tiêu", "Thông tin khoá sai", "Chưa đúng", "Khó hiểu". Rebuild `DOWN_REASONS` has the first three only (PRODUCT L13 also lists three). Section 4, item 5. P2.
- Feedback toasts: real "Cảm ơn phản hồi của bạn." on 👍 and "Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn." after a reason. Rebuild: check its toast copy (not verified in this pass).
- Deep links: real `/ai?topic=<t>` prefills "Mình muốn tìm hiểu về <t>"; `?prompt=` sends the prompt; `?action=enroll-free&courseId=<id>` replays the enrol after sign-in (also an add-to-cart action). Clears the query with `replaceState`. Rebuild: none (P2). Course detail's gated action should be able to return here.
- Context error: real shows "Vui lòng tải lại trang trước khi gửi câu hỏi." when the context load fails. Rebuild has no equivalent. P3.
- Skeleton: `AiAdvisorSkeleton` while loading. P3 (see 2.8).
- Guest line: real "Bạn đang dùng với tư cách khách." with "Đăng nhập" linking to `/login?callbackURL=/ai`. Rebuild uses the same copy but opens the modal. Fine.
- Current-course context line (real): "Bạn đang học <title> (<done>/<total> bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.". Check the rebuild shows this too (not verified).
- Access: real page has no role guard. Rebuild `role: ['guest', 'learner']`, so lecturers and admins get Forbidden. PRODUCT L13 says guests and signed-in learners. Section 4.
- Rebuild-only GitHub card ("Phân tích GitHub của mình" / "Xem lại phân tích GitHub của mình"). Not in real code or PRODUCT L13. Section 4.
- Conversation history (PRODUCT L13: "conversation history list (signed-in)"): neither real nor rebuild has it. Undecided.

### 2.7 Study activity and profile activity (real: `study-activity-tracker.tsx`, `api/learn/.../activity`, `api/student/profile`; rebuild: none)

- Real tracker: rendered on the lesson page. Starts when the tab is visible and focused, sends `POST …/activity` with `action` (`prepare`, `start`, `heartbeat`, `stop`) and a `trackerId`. Heartbeat every 30 s (`STUDY_HEARTBEAT_MS = 30000`). Single owner per session (`expectedOwner`), max gap 45 s. Metrics never interrupt the lesson; no offline guessing.
- Real activity types: `login`, `course_view`, `lesson_complete`, `quiz_complete`, `course_enrolled` (via `POST /api/student/profile`). Profile reads them per year for the heatmap and "Ngày hoạt động".
- Rebuild: `streakDays` in `learning/dashboard-page.jsx` and `insights-pages.jsx` derive streaks from some study state, but there is no activity log, no heartbeat, and no per-day heatmap data. P2 because it feeds the profile heatmap and the dashboard streak.
- Simulation: a `studyLog[date] = seconds` in the learning store, incremented every 30 s while `document.visibilityState === 'visible' && document.hasFocus()` on the lesson page (lesson player is another scout's area; coordinate). Append activity entries for login (on sign-in), course_view, lesson_complete, quiz_complete, course_enrolled from the existing store actions. Profile heatmap uses `charts.calendar`.

### 2.8 Skeletons and loading (real: `components/skeletons/*`, 13 files, `loading-region.tsx`, `loading.tsx` for ai, cart, profile, settings)

- Real: skeletons per page, wrapped in `LoadingRegion` (`role="status"`, `aria-busy`, sr-only label). Rebuild has no skeleton primitives; it uses `SpinnerBlock` in `components/ui/primitives.jsx` and empty states.
- Mockup states only: the porting guide says every state the mockup renders must exist, and STATE-MACHINES says prototype latency is only for visible progress. Many real skeletons (auth, settings, profile) therefore have no mockup source. P3. If built, add one `LoadingRegion` wrapper and reuse the mockup's spinner copy.

### 2.9 Not needed

- `app/dev/foundation/*`: design-system review page, returns 404 in production. Skip.
- Rebuild dev drawer (`features/shell/dev-drawer.jsx`): prototype only (STATE-MACHINES 23.1 says "do NOT implement" in the real product). Keep it only as a dev tool and gate it out of production builds.

---

## 3. Backend-only or impossible in a prototype: how to simulate

| Real capability | Real location | Rebuild simulation |
|---|---|---|
| Better Auth sessions, cookies, `$sessionSignal` | `lib/auth-client.ts`, `api/auth/[...all]` | `Codi.state.currentUserId` in localStorage (exists) |
| Email/password sign-in, lockout copy | `sign-in-form.tsx`, `lib/sign-in-error.ts` | Seed `status` and the demo password (exists); add busy and error states |
| Sign-up verification OTP sent by email, 2-min TTL, resend | `sign-up-form.tsx`, `otp-input.tsx` | Fixed codes: `123456` valid, `000000` expired (mockup); show the code hint; add the 2-min timer on the client |
| Forgot / reset password email (OTP or link) | `forgot-password/page.tsx`, `reset-password/page.tsx` | Mockup link step, or OTP in-page (decision); demo link opens `/reset-password` |
| Google / GitHub OAuth (`signIn.social`, `linkSocial`) | `google-button.tsx`, `github-button.tsx`, `account-settings.tsx` | Chooser modal per provider (Google exists); no redirect |
| Change-email OTP to new address, `EMAIL_UNAVAILABLE`, `TOO_MANY_ATTEMPTS` | `change-email-form.tsx` | Duplicate check (exists), fixed code, attempt counter |
| Session list, revoke one, revoke others on password change | `session-settings.tsx`, `change-password-card.tsx` | `sessions[]` in seed/db, delete on revoke; `revokeOtherSessions` clears all but current |
| Avatar upload to Cloudflare R2, presets from DiceBear | `avatar-picker.tsx`, `api/user/avatar`, `api/avatar?key=` | Canvas resize to 512 px JPEG as data URL in `user.image`; presets as inline SVG data URIs; same size and type checks |
| Name update `PATCH /api/user/profile` | `api/user/profile/route.ts` | Store write (exists in rebuild) |
| Notifications API, 30 s polling, focus refresh | `notification-menu.tsx`, `api/notifications` | Store + `setInterval(30000)` + focus listener; a scenario flag for error and retry |
| Notification mark-read | `api/notifications` PATCH | Store write (exists) |
| AI streaming, 429, 500 | `api/ai/route.ts` | Scenario flags (exist: `aiAssistant`) |
| AI feedback `POST /api/ai/feedback` | `api/ai/feedback/route.ts` | Store write (partly exists) |
| GitHub OAuth, GitHub API, analysis (60 s timeout, rate limit, expired link, stale >90 days) | `components/profile/github-*`, `api/github-profile/route.ts` | Scenario flag `githubAnalysis: ok | rate-limit | expired | timeout | insufficient`; drive the states listed in 2.3 |
| Study heartbeat `POST …/activity` | `study-activity-tracker.tsx` | Local timer and `studyLog` (2.7) |
| Activity log for heatmap | `api/student/profile`, `studentActivities` | Append entries in store actions; `charts.calendar` renders |
| Multi-role users (`getActiveRoles`) | `api/user/roles`, profile page | Single role (rebuild); show a badge list with one entry |
| Account deactivation revokes sessions and blocks sign-in | STATE-MACHINES §21 | Seed `status` check (exists) |
| Client-side upload checks (5 MB, types, message copy) | `avatar-picker.tsx` | Same copy and checks in the rebuild |

---

## 4. Business rules: conflicts and undecided points

Each item lists sources and a recommendation. Items marked DECIDE need the user before implementation.

1. **Forgot password flow (DECIDE).** PRODUCT A2 and S04 and the rebuild use a neutral "Kiểm tra email của bạn" step with a link, then a token reset page with a success CTA. Real code (`forgot-password/page.tsx`) uses a 6-digit email OTP, 2-min TTL, with the reset form on the same card and an auto-redirect after 1.2 s. The token route still exists (`/reset-password?token=`) and the account route (`?source=account`). Recommend: keep the PRODUCT neutral message wording, use OTP as the real code does, and keep the success CTA from PRODUCT (no auto-redirect).
2. **Sign-up OTP expiry.** PRODUCT A1 says "expired code → resend prompt" but does not state a TTL. Real uses 2 min (UI and copy). Recommend 2 min, matching the real copy.
3. **Remember me (DECIDE).** PRODUCT and rebuild say "Ghi nhớ đăng nhập". Real says "Ghi nhớ email" and stores the email only. Recommend the real behaviour and copy.
4. **Guest "Đăng nhập" action.** PRODUCT §2.1 and real: link to `/login`. Rebuild: opens the sign-in modal. Recommend keeping the modal (PRODUCT L2 gated flow) and also keeping a `/login` route.
5. **AI feedback reasons (DECIDE).** PRODUCT L13 lists three (matches rebuild). Real contract has five (adds "Chưa đúng", "Khó hiểu"). Decide which is binding. Real code is what ships; PRODUCT was not updated to match it.
6. **GitHub skill profile (DECIDE).** PRODUCT L14 (2026-10-19) requires per-item corrections ("Không đúng"), level edit, hiding items, excluding repos, "Xoá hồ sơ năng lực" separate from unlink, a 24 h re-analysis cooldown, and "Để sau". Real code has none of the corrections, delete, or cooldown; it has "Phân tích lại" with no cooldown and a 90-day stale notice. Rebuild follows neither fully (disconnect deletes data). Decide the target before porting.
7. **Role model.** PRODUCT and STATE-MACHINES use one role (`learner | lecturer | admin`). Real code uses a roles list (`getActiveRoles`, `api/user/roles`, role badges per item). Recommend single role in the prototype, and note the difference.
8. **Role labels in profile.** Real `profile-card.tsx` shows "Learner", "Lecturer", "Admin"; user menu and PRODUCT use "Học viên", "Giảng viên", "Quản trị viên". Recommend the Vietnamese labels (PRODUCT).
9. **Theme control location (DECIDE).** PRODUCT §2.1 says header theme toggle. Real puts it in the user menu (radio group). STATE-MACHINES 23.1 calls `theme` a prototype flag ("UI only"). Recommend the user menu (real), with PRODUCT's three options, and persist to localStorage.
10. **Header items.** PRODUCT §2.1 lists "Trang chủ", a "Khoá học" dropdown (all courses, search, AI Mentor), "Bàn làm việc", "AI Chat", "Hồ sơ (Profile)". Real header: role-based flat links (no dropdown), no "Trang chủ" (logo goes home). Recommend the real header (flat links) and logo to home.
11. **AI page access.** PRODUCT L13 says guests and learners. Real page has no role guard (any role). Rebuild forbids lecturers and admins. Recommend allowing all roles, as real.
12. **AI rate-limit copy.** Real: body only ("Đợi vài phút rồi thử lại."). Rebuild: title plus body. Recommend real (no title), since PRODUCT says "existing 429 copy".
13. **AI GitHub card and conversation history.** Rebuild-only GitHub card; PRODUCT wants signed-in history, real has none. Undecided. Recommend dropping the GitHub card from the advisor (it is not in real code) and keeping history out of scope.
14. **Email verification state.** Real can show unverified accounts with an OTP card in profile and settings. PRODUCT does not describe it. Prototype accounts are always verified after register. Recommend skipping (P3), or add a seed user with `emailVerified: false` if the user wants to see the state.
15. **Deactivated sign-in message.** PRODUCT S03 and STATE-MACHINES §21 require "Tài khoản đã bị vô hiệu hoá" (explicit). Real `sign-in-form.tsx` shows only server messages through `mapSignInError` (no explicit deactivated mapping in this file). Rebuild has the explicit message. Recommend the rebuild (PRODUCT).
16. **Settings logout.** PRODUCT A3 says "Đăng xuất" must be reachable. Real settings has no logout (header hidden); user menu has it. Rebuild puts logout in settings too. Keep both (harmless).
17. **Settings close target.** Real: X and Esc go to `/dashboard`. Rebuild: none. Recommend role home (`Codi.homeFor(role)`), per PRODUCT navigation rules.
18. **Email mask.** Real: `••••••••@domain`. PRODUCT: "masked email with show/hide". Rebuild: first two characters visible. Keep the rebuild mask (mockup) unless the user prefers real.
19. **Home hero copy (DECIDE).** Real title is English ("A new way to learn & get knowledge") while everything else is Vietnamese. Copy rule (porting guide, §6 "Copy") is Vietnamese verbatim. Recommend Vietnamese and keep the mockup hero.
20. **Home sections not in mockup (DECIDE).** Features, AI Mentor, footer, and logo intro exist only in real code. Recommend adding features and footer only if the user wants them (P3). Do not invent them.
21. **Notification scope.** STATE-MACHINES D15 is in-app only plus auth emails. Real does in-app with polling. Consistent. Rebuild must keep the events list in STATE-MACHINES §22.
22. **Notification copy.** PRODUCT S40 and rebuild: "Đánh dấu đã đọc" (single text). Real: "Đánh dấu tất cả đã đọc" (bulk). Recommend the real bulk label, plus per-item read on click.
23. **Profile overview copy.** Real heatmap heading is English ("N contributions in <year>") and weekday labels are English ("Sun", "Mon"). Recommend Vietnamese ("N hoạt động trong <năm>") and "CN, T2 …" (charts.calendar already uses these).
24. **Password change session behaviour.** Real: `revokeOtherSessions: true` with the success toast "Các phiên đăng nhập khác đã được đăng xuất." Rebuild copy: "Các thiết bị khác cần đăng nhập lại." (mockup). Keep the mockup copy; implement the session revoke once the sessions list exists.
25. **Dev drawer.** STATE-MACHINES 23.1 says the scenario flags are prototype-only. Keep in dev, hide from the product build.

Open questions for the user: items 1, 3, 5, 6, 9, 10, 19, 20.

---

## 5. Suggested order (for the controller)

1. P1 auth states: sign-in busy and remember-email, OTP timer and expiry, decision on forgot-password flow (items 1, 2, 3).
2. P2 notifications states and polling; user menu items and theme group; header theme decision.
3. P2 settings: change-email steps, password recovery, sessions list. Profile: avatar upload simulation, overview heatmap (needs activity log from 2.7), năng lực tab after GitHub decision (item 6).
4. P2 home popular courses states and sort; AI feedback reasons and deep links.
5. P3 home sections, skeletons, logo intro, settings Esc and close target.

Files most likely touched: `src/features/shell/auth.jsx`, `account-pages.jsx`, `header.jsx`, `github-api.jsx`, `routes.jsx`, `src/features/commerce/home-page.jsx`, `ai-advisor-page.jsx`, `src/lib/codi.js` (theme, activity log), `src/components/ui/primitives.jsx` (skeleton / loading region), `server/seed-source/data.js` (sessions, activity, avatar, emailVerified).
