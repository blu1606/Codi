# GitHub "Hồ sơ năng lực" full report port (2026-11-02)

## Outcome

The profile tab `/profile?tab=nang-luc` now renders Codi's full GitHub result view for a saved profile instead of the
compact summary. All content is computed from the backend DTO (`GithubProfileProjection` v1 from
`GET/POST /api/github-profile`); nothing is canned. No backend change was needed.

## Files

- `frontend/src/features/shell/github-report.jsx` (new): port of `github-profile-result.tsx`,
  `github-profile-stack.tsx`, `github-profile-evidence.tsx` and `lib/github-profile-insights.ts`. It contains the
  overview (overall estimate, confidence, KPI tiles), language share bar and legend, the 12-month push activity chart
  (`charts.bars`), technology usage grouped by kind with expandable details, the insights, the knowledge areas, the
  course-use note, the repository list, collection scope and limits, evidence dialogs (`Modal`; links only for pinned
  GitHub blob / languages API URLs), and the waiting checklist.
- `frontend/src/features/shell/github-api.jsx`: the panel mounts `ProfileReport`. It adds the states from Codi's
  panel: stale (>90 days), re-analysing (previous result kept), the waiting checklist, failure titles by server code
  (rate limited, connection expired, budget exhausted via `diagnostics.category === 'reservation_denied'`, not
  enabled, active request), `retryAt`, a reconnect button for `github_not_linked` / `connection_expired`, the
  "Để sau" note, the unlink note, and the temporary "Chưa đủ dữ liệu để ước tính" result for runs without
  observations (that result is never saved and never replaces an observed one). `ProfileSummary` stays in place for
  the onboarding step.
- `frontend/src/styles/app.css`: a small `shell-ghr-*` block inside the existing GitHub onboarding section. The rest
  of the report reuses `card`, `stat-tile`, `grid-4`, `badge`, `gh-signal`, `gh-domain`, `gh-mastery`, `gh-repo` and
  `shell-gh-steps`.
- `docs/deviations-from-mockup.md`: the one line about the saved profile now describes the full report.

## Verification

- `vite build` passes.
- The Playwright script (`scratchpad/e2e/github-report.js`) signs in as `usr-learner-001`. It checks light and dark
  themes at 1366px and 390px. All eight sections, the meters, the overall badge, all six repos, the evidence dialog
  (pinned link and quote) and the expanded technology details render, with no console errors and 0px horizontal
  overflow.
- `scratchpad/e2e/github-report-fail.js` sends a real re-analyse request to the running API. The server answered
  `connection_expired`, and the alert showed the matching title, the reconnect button and "Kết quả trước vẫn hiển thị".
  The saved report stayed visible.

## Temporary data (removed)

DB `codi` had no saved GitHub profile, so I backed it up first to
`../.codi-gc-preserved/db-backups/codi-261102-github-port.dump`. I then inserted one `account` row
(`tmp-gh-acc-261102`, provider `github`) and one `github_profiles` row for `usr-learner-001`. The snapshot and analysis
were built and validated with the backend's own `extractGithubTechnologies` / `projectGithubProfile`. After the
checks I **deleted both rows**: `github_profiles`, GitHub `account` and `github_generation_reservations` counts are
all back to 0.

## Not covered

- I did not exercise the live analysing and "none observed" states end to end, because that needs a real OAuth-linked
  account. I only reviewed their code paths against Codi's panel.
- Learner corrections (hide or edit a technology) are shown when present ("Bạn đã sửa", "Bạn đã loại"). Codi has no
  route to edit them, so this port has none either.
