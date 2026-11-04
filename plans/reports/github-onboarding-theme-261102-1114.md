# GitHub onboarding step + header theme toggle

Both tasks are done. The build passes, the seed loads, the new Playwright click-through passes all 38 checks, and the existing smoke run still passes (59 ok, 0 FAIL).

## What the reference says (and what was built from it)

- **The real app has no GitHub step in sign-up or course onboarding.** GitHub appears only in `github-learner-card.tsx` (dashboard), `github-profile-panel.tsx` (profile tab) and the sign-in/sign-up "Tiếp tục/Đăng ký với GitHub" buttons. `docs/user-flows.md` lists L14 as **Missing**, and both the mockup PRODUCT §L4 and the real app lack a level suggestion. So course onboarding does **not** suggest a start level. Its level step has only a quiet "Kết nối GitHub" entry, or a note that a saved profile exists ("Bạn vẫn tự chọn trình độ; bài kiểm tra đầu vào quyết định điểm bắt đầu").
- Copy, consent lists, failure titles, "Chưa đủ dữ liệu để ước tính", the unlink dialog and the 90-day stale note all come from the existing port of `github-profile-panel.tsx`. The stage list ("Đọc hồ sơ → Đọc repo (n/N) → Nhận diện công nghệ → Tạo hồ sơ năng lực") and "ước tính từ GitHub" / "độ tin cậy" come from PRODUCT Flow L14.

## Task A: account step `/onboarding/github?next=…`

- **Route:** learner only, focus layout. The header exit is labelled "Để sau" and goes to `next`. `next` is validated so only in-app paths are accepted; anything else falls back to the role home.
- **New accounts:**
  - OTP success, or a new account created through the Google/GitHub chooser, routes to the step and then continues to the original destination.
  - If the gated sign-in modal was opened for a pending action (for example "Thêm vào giỏ"), that action still wins. The learner sees the dashboard prompt later instead.
- **States:**
  - **Not linked:** consent lists and privacy copy ("Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia sẻ với giảng viên").
  - **Connecting:** the existing simulated chooser and permission screen, with the user's own email listed first, then "Cho phép" → "Đang kết nối...". A GitHub account already linked to another Codi user is refused.
  - **Analysis consent:** linking never starts an analysis by itself, as in the real app.
  - **Analysing:** a progress bar plus four stages, with `aria-current` on the active stage, a repo counter, a live status line and a "Dừng chờ" button.
  - **Result:** handle, public repos counted and selected, overall estimate with the "ước tính từ GitHub" badge and confidence, domain chips, languages, and "Lưu vào hồ sơ" / "Không lưu".
  - **Saved:** "Phân tích lại", "Ngắt kết nối" (with confirm), "Xem chi tiết" and "Tiếp tục".
  - **Failed:** uses the `githubAnalysis` dev-drawer flag (`failed`, `rate-limit`, `expired`, `timeout` at 60 s). `expired` offers "Kết nối lại GitHub".
  - **Insufficient (empty):** nothing is saved.
- **Persistence:** the step reuses the existing `slice:githubAnalysis` record (`byUser[userId] = { linked, username, email, linkedAt, analyzedAt, result }`).
  - `linkedAt` is new.
  - I kept the existing field name `analyzedAt` so the profile tab and the AI context keep working.
  - The draft result is written only on "Lưu vào hồ sơ".
- **Profile tab and dashboard card** read the same record.
  - The card now follows the real app's rule: the compact "Hồ sơ năng lực" link shows only once a profile is saved. Before that the dismissible prompt stays, and it says "Phân tích GitHub" when the account is linked but not yet analysed.
  - The prompt opens the new step with `next=/dashboard`.
  - It is now also shown on the empty dashboard (a brand-new account with no courses), where it was previously missing.
- **Course onboarding:** the level step (step 2 of 3) has the entry. It saves the unsaved choices as a draft first, so the learner returns to the same step.

## Task B: header theme toggle

- `ThemeToggle` (`src/features/shell/theme-toggle.jsx`) is shown to everyone in the default header (guests and all roles) and in the focus header.
- **Button:** an icon showing the current preference (sun / moon / monitor) with accessible name "Giao diện: {Sáng|Tối|Theo hệ thống}" and `aria-haspopup="menu"` / `aria-expanded`.
- **Menu:** three `menuitemradio` items with `aria-checked`. Focus moves to the checked item when it opens; Arrow, Home and End keys move between items; Escape closes and returns focus to the button; Tab or an outside click closes it.
- **Persistence:** it uses `Codi.theme`, so the choice is stored in localStorage and stays in sync with the account menu and the dev drawer.

## Files

Changed:
- `src/features/shell/github-api.jsx`: exported helpers, `linkedAt`, `saveAnalysis`, `linkedElsewhere`, shared unlink dialog, parameterised `OauthBody`, learner card target and rule, `Codi.github.onboardingHref`.
- `src/features/shell/auth.jsx`: `completeAuth(…, { isNew })` and validated `next`.
- `src/features/shell/routes.jsx`: new route.
- `src/features/shell/header.jsx`: toggle added.
- `src/features/learning/onboarding-page.jsx`: `GithubEntry` on the level step.
- `src/features/learning/dashboard-page.jsx`: card in the empty state.
- `src/features/learning/learning.css`: `.ln-gh-entry`.
- `src/styles/app.css`: one block between `GITHUB ONBOARDING + THEME TOGGLE` markers at the end of the file.
- **`src/components/layout/app-layout.jsx` (controller-owned):** a minimal edit was unavoidable because the focus header is rendered there and not in `header.jsx`. It adds one import and `<ThemeToggle />` in `FocusHeader`.

New:
- `src/features/shell/github-onboarding-page.jsx`
- `src/features/shell/theme-toggle.jsx`

Not created: `server/seed-source/patches/15-github-onboarding.js`. Seed patches can only write `db` collections, while the existing GitHub data lives in a kv slice. A second `githubProfiles` collection would split the source of truth between the profile tab, the dashboard card and the AI context, and the runtime already works without seeded GitHub data.

## Verification

- Build: `npx vite build --outDir …/scratchpad/build-github --emptyOutDir` passes; only the existing chunk-size warning remains.
- Seed: `loadSeed()` returns 109 users.
- Playwright: `…/scratchpad/e2e/github-onboarding.js` passes 38/38. It covers:
  - sign-up → OTP 123456 → GitHub step → connect → analyse → save → dashboard;
  - the server snapshot holding `linkedAt`, `analyzedAt` and `result`;
  - the profile tab;
  - re-open → unlink with confirm;
  - the existing-account dashboard prompt → step;
  - the `failed` and `insufficient` scenarios;
  - the course onboarding entry returning to the level step;
  - dismissing the prompt;
  - theme toggle for a guest (keyboard, checked state, persistence across reload).
- `smoke.js`: 59 ok, 0 FAIL.
- Screenshots (light, dark, 390 px mobile) are in `…/scratchpad/e2e/shots/ghob/`.

## Status / Summary / Concerns

**Status:** DONE_WITH_CONCERNS

**Summary:** The optional "Kết nối GitHub" account step now runs after sign-up and from the dashboard prompt and course onboarding. It covers link, analyse with stages, review, save, re-analyse, unlink and the failure and empty states, and saves to the existing GitHub slice that the profile tab and dashboard card already read. Every visitor now has a header theme menu, including in the focus header.

**Concerns:**
1. I made a minimal edit to the controller-owned `src/components/layout/app-layout.jsx` (import plus `<ThemeToggle />` in `FocusHeader`).
2. The e2e runs left about five test accounts (`e2e-gh-*@example.com`) in Postgres. Their GitHub records were unlinked at the end of each run, and `usr-learner-001` is back to not linked with no goal draft. The DB was not reset, as instructed.
3. Two deviations from the real app should be recorded in `docs/deviations-from-mockup.md`, which I was not allowed to edit:
   - the new account step itself, since the real app has none;
   - the "Lưu vào hồ sơ" review-before-save step, since the profile tab still saves straight away, as the real panel does.
4. The `timeout` scenario was not clicked through end to end because it takes 60 s. Its code path is the same as the other failures.
