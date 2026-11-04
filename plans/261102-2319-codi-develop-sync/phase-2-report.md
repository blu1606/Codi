# Phase 2 report: the Tutor frontend port

Status: done (2026-11-03). The rebuild now runs Codi develop's one Tutor (PR #247 "one Tutor with shared history,
streaming, reasoning and tools" and 2ccbba8a "reset Tutor state per learner, send contextual asks once, keep one
thread per lesson") on the real backend: the full page `/ai` and the lesson's "Tutor" tab share one chat history.
The interim `/ai` advisor rework (c176199) and the old per-course Tutor page are gone. Checks: `vite build` ok,
smoke 64/64, the browser runs below show no console errors and no horizontal overflow at 1366 and 390 px, light and
dark.

## Where the code lives

| File | Port of (Codi develop `apps/web/src/`) |
|---|---|
| `frontend/src/features/tutor/tutor-store.js` | `components/ai-chat/ai-chat-provider.tsx`: page context, active chat (draft or stored), history list, code bridge, one-shot contextual request, reset when the learner changes, one thread per lesson, last chat per context in `sessionStorage` |
| `features/tutor/use-tutor-chat.js` | the AI SDK `useChat` as develop uses it: `submitted → streaming → ready / error`, stop, regenerate (same message id), 40 ms throttle |
| `lib/ai-chat.js` | `DefaultChatTransport` reading: the UI message stream into UIMessage parts (text, reasoning, step markers, tool parts with input/output/error states) |
| `features/tutor/tutor-thread.jsx` | `ai-chat-thread.tsx`: chips, guest history (≤ 12 turns), lesson mode, hint ladder, intake, escalation, votes, diff actions, states |
| `features/tutor/tutor-message.jsx` | `ai-chat-message.tsx`: reasoning, tool steps, material sources, course cards, comparison table, diff block, line jumps, copy, 👍/👎 + reason |
| `features/tutor/tutor-chrome.jsx` | `ai-chat-chrome.tsx` + `ai-chat-intake.tsx`: history grouped by day (Bangkok calendar) with accent-insensitive search, conversation loader, load error, S17 intake question and summary |
| `features/tutor/tutor-page.jsx` | `app/ai/page.tsx` + `ai-chat-page.tsx`: sidebar (new chat, search, history, privacy note, resizable 200–400 px with keyboard), `?c=` / `?prompt=`, "Mở đúng chỗ", delete with confirmation, "Thu về" |
| `features/tutor/tutor-lesson-tab.jsx` | `ai-chat-panel.tsx` (panel header, history popover, "Mở toàn trang", "Đoạn chat ở … / Mở đúng chỗ / Hỏi về trang này") + the lesson player's `setPage` / `registerCode` wiring + `tutor-bridge.tsx` |
| `features/tutor/tutor-escalate.jsx` | `components/ai-tutor/tutor-escalate-dialog.tsx` |
| `features/tutor/tutor-selection.js` | `components/ai-tutor/tutor-selection-toolbar.tsx` |
| `features/tutor/tutor-markdown.jsx` | develop's Streamdown rendering, as React elements (no new dependency): paragraphs, headings, lists, quotes, GFM tables, fenced code (also while a fence is still open), inline code, bold, italic; `/learn/…` and `/courses/…` links become citation chips |
| `features/tutor/tutor-contract.js`, `tutor-ui.jsx` | `lib/ai-chat-contract.ts`, `ai-tutor-contract.ts`, `learner-intake-contract.ts`; icons the shared set lacks, the Tutor mark, menu and popover |
| `features/coding/tutor-api.jsx` | installs `Codi.tutor` (`embed`, `open`, `explainError`, `explainRunError`, `pageHref`) for the lesson player and the code workspace |
| `features/coding/tutor-page.jsx` | `app/learn/[courseId]/tutor/page.tsx`: redirect to `/ai` |
| `features/commerce/ai-advisor-page.jsx` | re-exports the Tutor page for the existing `/ai` route |
| `styles/ai.css` | all Tutor styles (`.tc-*`); the shared `.ai-chip` / `.ai-thinking-row` rules other features use are kept |

Small host changes: `learner-code.jsx` adds `Codi.code.subscribe(fn)` so the context chips re-read the workspace after
a run, edit or step; `lesson-player-page.jsx` labels the tab "Tutor" and passes `onShowCode` (3 lines);
`coding.css` drops the dead rules of the old panel, launcher and Tutor page.

## What matches Codi develop

- One Tutor, two kinds of chat: lesson chats (hint ladder, modes, chips, suggestions, escalation) and general chats
  (`search_courses`, `compare_courses`, `get_my_learning`) with the same history, titles, context labels and links.
- Streaming answers with the reasoning part ("Tutor đang suy nghĩ…" / "Đã suy nghĩ", folded once done) and tool steps
  ("Đang tìm trong danh mục khoá học…" / "Đã tìm …", expandable; material hits as sources). The current OpenAI
  provider does not stream reasoning, so the reasoning row was not seen live; the rendering follows the stored part shape.
- Course cards with level, lesson count, rating and price or "Đã sở hữu"; the comparison table; the ≤ 3-line
  suggestion with Áp dụng / Bỏ qua / Hoàn tác / Chạy lại test, its state saved with `PATCH /api/ai/chats/:id`.
- Hint ladder "Gợi ý n/3 · Hướng nghĩ / Chỗ cần xem lại / Khung cách làm", "Đã dùng hết 3 gợi ý"; a retried hint
  question resends the same message id, so the server reuses its step.
- Stop ("Đã dừng câu trả lời.", what was shown stays), "Hỏi lại" for an unanswered stored question, "Thử lại" after a
  failure, rate limit "Bạn đã hỏi quá nhiều trong thời gian ngắn" (429), rejected (4xx) vs unavailable states.
- 👍/👎 with the four reasons, copy, "Hỏi giảng viên" after 👎 and in the "+" menu; the escalation dialog and the
  "Đã hỏi giảng viên · Đang chờ / Giảng viên đã trả lời / Đã giải quyết" row.
- S17 intake asked in general chats of a signed-in learner only for unknown answers, one at a time with "Bỏ qua",
  the waiting question sent after the last one; "Codi đang hiểu về bạn" with removable answers and "Sửa".
- Guests: no history ("Đăng nhập để lưu và xem lại lịch sử hỏi Tutor."), the recent 12 turns go with each question, no
  votes, no intake. A different learner (or a sign-out) drops the list, the open chat and any queued request.
- `/ai?c=<id>` opens and follows the open chat (reload keeps it); `?prompt=` from the catalogue, course page and
  search is asked once in a new chat. `/learn/:courseId/tutor` redirects to `/ai`.
- Selection toolbar (text: Giải thích · Cho ví dụ · Hỏi thêm; code: Giải thích đoạn này · Vì sao lỗi?), failing-test
  and console-error asks; the request is taken once, so a remount never sends it twice. Copy is develop's throughout.

## Deviations (also in `docs/deviations-from-mockup.md`, coding 10–12 and commerce 11)

- No floating bubble, docked panel or `T` shortcut: the Tutor is the lesson's "Tutor" tab and the `/ai` page
  (DESIGN.md refuses a chat bubble over the lesson; the shell is outside this phase). An in-app link to `/ai`
  records the screen it was clicked on as the chat context, which stands in for develop's "where the panel was opened".
- "Xem dòng N" and "Chạy lại test" switch to the Code tab first (the editor sits in another tab here).
- A rate-limited turn counts down `retryAfter`, then offers "Thử lại" (develop shows "Thử lại sau ít phút" only).
- "Áp dụng" is a secondary button: the send button is the panel's one filled teal button.
- The "Đã dừng câu trả lời." note is not repeated under the stored stop text "Bạn đã dừng câu trả lời này.".
- Develop's elsewhere-bar "Hỏi về trang này" calls `startNew`, which does nothing on a lesson; here it returns to the
  lesson's own thread.
- Screen readers get one polite status line ("Tutor đang tìm câu trả lời…", then "Tutor đã trả lời: …") instead of
  an `aria-live` on the whole thread, so streamed tokens are not read one by one.
- The dev scenario flag `aiAssistant` still forces thinking / rate limit / error without a model call.

## Verification

Scripts in `scratchpad/e2e/tutor/` (`tutor-e2e.js`, `tutor-shots.js`, `tutor-states.js`), screenshots alongside.

| Check | Result |
|---|---|
| `/ai` guest, 1366 | starter → streamed answer with 3 course cards and a tool step, no vote buttons; follow-up "Khoá đầu tiên … bao nhiêu bài?" answered from the sent history ("11 bài") |
| `/ai` learner, 1366 | intake asked once (first run), answer with a course card ("Đã sở hữu"), 👍 saved; reload keeps `/ai?c=<id>`, the history marks it current, the vote is kept; delete → confirmation → removed, back to an empty chat |
| Lesson Tutor tab, JS code lesson `241c0bba…` | chips "Yêu cầu: …" and "Code bạn đang viết"; hint 1/3 answered and the ladder moved to 2/3; a question produced "Xem dòng 10", which switches to the Code tab and selects the line (1366 and 390); text selection in the brief → toolbar → "Giải thích" asked with the "Đoạn đã chọn" chip. The model did not call `suggest_code_change`, so the diff block was not seen live |
| `/learn/course-js-001/tutor` | redirects to `/ai`, history lists the lesson chat and the general chats |
| Forced states (390) | rate limit with countdown, unavailable with "Thử lại", thinking → "Dừng" → "Bạn đã dừng câu trả lời này." |
| Keyboard | answer-mode menu opens with Enter, arrows move, Enter picks and focus returns to the trigger; Escape closes the history popover |
| 1366 / 390 × light / dark × guest / learner | no console errors, no horizontal overflow on `/ai` and the lesson tab |
| Smoke | 64/64 |

Screenshots: `ai-guest-empty-1366.png`, `ai-guest-chat-1366.png`, `ai-learner-chat-1366.png`, `ai-history-1366.png`,
`ai-learner-1366-dark.png`, `ai-learner-390-light-history.png`, `ai-learner-390-dark.png`, `lesson-tab-1366.png`,
`lesson-tab-chat-1366.png`, `lesson-selection-1366.png`, `lesson-history-popover-1366.png`,
`lesson-learner-390-light.png`, `lesson-learner-390-dark.png`, `state-ratelimit-390.png`, `state-error-390.png`,
`state-thinking-390.png`.

Refinement pass (impeccable, Operate surface; run as a subagent, so the interview step was replaced by the brief and
DESIGN.md): hairline rows instead of boxed cards for course results and starters, no coloured rail on the current
history item, one filled teal button per panel, 44 px targets on coarse pointers, themed scrollbars, caret and
selection, grid tracks that cannot be pushed wider than the composer at 390 px, hover styles only for hover-capable
pointers, reduced motion stops the spinner and the streaming caret. Mobbin MCP was not available in this session, so
no external chat references were used.

## Side effects of the verification

The runs made real Tutor turns as `usr-learner-001`. Their chats were deleted afterwards and the intake reset to
empty (it was empty before; the reset writes one more intake activity row). The hint ladder of lesson `241c0bba…`
stays at 1/3 because hint use is kept by design ("số gợi ý đã dùng vẫn giữ"); a reseed resets it.

## Open issues

- The diff block and the reasoning row were checked against the stored shapes only; neither was produced live.
- A global entry point (develop's bubble) would need a shell change; the header's "AI tư vấn" / "Lộ trình AI" nav
  labels (in `features/shell/nav-config.js`, not owned here) still name the old advisor.
