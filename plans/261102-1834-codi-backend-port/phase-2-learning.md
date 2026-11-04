# Phase 2 report: learning + coding

Status: done. Every learner learning screen reads and writes through the backend; nothing in
`frontend/src/features/learning/**` or the learner path of `frontend/src/features/coding/**` touches `Codi.db()` /
`Codi.set()` any more. Commits: `5befa41` (learning), `5837978` (coding).

## Screens ported

| Screen | Route / action used |
|---|---|
| Dashboard `/dashboard` | `GET /api/learner/overview` (focus, courses, weekly goal, streak, stats, latest feedback, recommendations); `GET /api/learn/:c/path` per active course with a path (departure board, chapter lines, "Lộ trình đã thay đổi"); diag card `POST /api/learner/overview` dismiss/restore (undo toast) |
| Onboarding `/learn/:c/onboarding` | `GET/POST /api/learn/:c/onboarding`: goal-commit / goal-save-draft (leave guard) / goal-skip / goal-edit / goal-cancel, fork-default / fork-diagnostic, diagnostic-start / -postpone / -retake, answer / previous / next / submit, request-path |
| Path `/learn/:c` | `POST .../path {type:'sync'}` on open, polled while `generating`/`updating`; ack-highlights, retry, dismiss-update, review; "Chỉnh mục tiêu" = onboarding `goal-edit` |
| Lesson player `/learn/:c/:l` | `GET .../lessons/:l` then `POST {type:'open'}`; `study`, `video`, `pdf-page`, `complete` (checklist from the server; adaptive offer = `adjustment` from complete → path `adjust` / `undo-adjust`); lesson list + path map from `view.path`; focus refresh, 3 s poll while `path.updating` |
| Study time | `POST .../lessons/:l/activity` prepare/start/heartbeat/stop (port of Codi's tracker) |
| Quiz | `GET/POST .../assessments/:id` quiz-open / quiz-retake / quiz-answer / quiz-submit (server-graded, review with explanations) |
| Assignment | same route: assignment-draft (600 ms autosave) / -submit / -cancel / -remove-file; file upload = `POST .../file` prepare → PUT → confirm |
| Hỏi đáp tab | `GET/POST .../discussions`; private conversation `GET/POST .../conversations` (reply) |
| Code challenge | `GET/POST .../assessments/:id/coding` draft / run / submit / reset / solution (backend sandbox, hidden tests, hints, cooldown) |
| Code tutorial | `GET/POST .../assessments/:id/tutorial` step / draft / run / reset / solution |
| AI tutor (lesson tab, docked sheet) | `GET/POST .../tutor`: ask (streamed text/plain, Dừng aborts), hint, vote, diff, clear, escalate; 429/503 replies show the server's view/limit row |
| Tutor page `/learn/:c/tutor` | `GET /api/learn/:c/tutor/threads` + `GET .../path` for the lesson picker |
| Progress `/progress` | `GET /api/learner/overview` (lessons with latest results, skills) |
| Stats `/insights/stats` | `GET /api/insights/stats?period&course` |
| Knowledge map `/insights/knowledge-map` | `GET /api/insights/knowledge-map?course` |

`Codi.courseProgress` (used by commerce course detail, AI advisor, profile) is now fed by the learner overview
(one lazy fetch per signed-in learner, refreshed after completions); other roles/users keep the old fallback.

## Backend additions

None. Every screen is covered by the vendored routes.

## Stays legacy / simulated, and why

- `Codi.code.view/editor/run/grade/blank/...` in `coding/code-api.jsx`: kept for the lecturer coding editor and lecturer
  AI (other areas), which still run code in the browser worker. The learner workspace is the new `Codi.code.learner`
  (`coding/learner-code.jsx`), backend only.
- PDF/slide materials stay a simulated page viewer (no pdf.js); the page count is the stored one or 8. Seeded courses
  only have YouTube videos, so this path was not exercised.
- Path "Thông báo tuyến" moved-up detection compares with the order last seen, now kept in `localStorage` instead of
  the legacy slice (the server's `update.changes` still drive it too).
- Stats filters (period/course/details/map course) live in memory for the session instead of the legacy store.
- Removed (no backend equivalent, real states replace them): Alt+K scenario flags `pathAI`, `materials`, `aiAssistant`,
  `kmap`, `codeSandbox`; the entry-test "mốc" marker on the mastery chart (the server keeps no per-moment history; the
  card says so).
- Dashboard recommendation cards no longer show the lesson count (not in the overview DTO).

## R2 / file upload

R2 is not configured. The upload UI calls the real prepare/confirm endpoints and shows the server's error under the
file field (e.g. 503 when storage is missing); nothing is faked. No seeded assignment of learner-001 accepts files
(the one checked is link-only, server answers "Bài tập không nhận tệp."), so the 503 path was only reasoned, not seen.

## Shared-file changes needed

None required. `frontend/src/lib/codi.js` still says the learning feature overrides `courseProgress` "to read its own
slice" — wording only; it now reads the learner overview.

## Verification

- `npx vite build` (scratchpad outDir): passes.
- Playwright (`scratchpad/e2e/learning-backend.js`, `learning-onboarding.js`), usr-learner-001, 0 console/page errors,
  0 failing API calls: dashboard shows the 3 real enrolments + departures; path 3/11; lesson "Hàm và phạm vi": mark
  studied → quiz retake → server-graded 100% → "Hoàn thành bài học" → still completed after reload; coding challenge
  run 5/5 sample tests then submit "Đã đạt tất cả test" (checklist updated); tutorial run + step; tutor page; progress;
  stats (real study minutes credited by the activity tracker); knowledge map; Python onboarding goal → fork → entry test
  (2/1/0) → request-path → path ready; AI tutor ask streamed a real Gemini answer.
- Data changed by the tests (normal UI writes): learner-001 completed "Hàm và phạm vi", passed the coding challenge,
  set up a path for course-python-001, asked the tutor once.
- No shared e2e scripts edited. smoke/flow may need their learner steps updated for UUID lesson ids if they still use
  legacy lesson ids.

## Unresolved questions

- Should the lecturer coding editor/AI (other areas) move to the backend runner (`runPreviewCode`/`verifySolutionCode`)?
  Then `Codi.code`'s browser runner can go in Phase 3.
