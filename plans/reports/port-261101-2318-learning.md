# Port report: learning feature (stage 2)

Date: 2026-11-02 (Asia/Bangkok). Scope: the non-coding, non-tutor rows of `scout-261101-2318-learning.md`.
Verification: `npx vite build` passes (only the chunk-size warning). `loadSeed()` runs cleanly with the new patch. A scratch script checks the BKT numbers (one correct answer gives 0.467, one wrong answer gives 0.211), the PDF seen-pages rule, quiz grading, the size limit, link validation, GMT+7 study credits across midnight, the 45 s gap rule and Monday weeks. All pass. No browser run was done.

## Files

- Changed: `src/features/learning/{learning-store.js, learning-shared.jsx, dashboard-page.jsx, onboarding-page.jsx, path-page.jsx, lesson-player-page.jsx, progress-page.jsx, insights-pages.jsx, learning.css}`.
- New: `study-time.js`, `lesson-markdown.jsx`, `lesson-materials.jsx`, `lesson-assessments.jsx`, `lecturer-conversation.jsx`, `path-views.jsx`, `use-sync-error.js` (same folder).
- New seed patch: `server/seed-source/patches/30-learning.js`.
- `src/styles/learning.css` was not touched. New styles live in the feature's `learning.css`.

## Rows done

| # | Row | What was ported |
|---|---|---|
| 1 | Dashboard | The goal card always shows, with the weekly goal for the Vietnam calendar week (Mon–Sun, GMT+7), a "Chỉnh mục tiêu" confirm, the real streak rule, and mastered-skill chips that link to /progress. Also: continue-card states for generating and failed paths, empty-feedback copy, the hidden-course note, and the diagnostic-card dismiss toast with "Hoàn tác". A sync-error alert "Chưa thể tải hoặc cập nhật dữ liệu học tập" with "Thử lại" is driven by the real `syncStatus.error`. `{Codi.github.learnerCard()}` is called if it exists (shell request). |
| 2 | Path / course home | Overview card; tabs "Lộ trình của bạn" / "Bản đồ kiến thức" (embedded map); summary card "Vì sao lộ trình này"; "Danh sách / Bản đồ" toggle. The list is a numbered stepper with "Bắt đầu ở đây", "Mới cập nhật", mastery chips and the prerequisite note. A detail panel shows "Vì sao bài này", "Kiến thức nên học trước", "Mức thành thạo hiện tại", the skippable note and "Xem lại bài / Học tiếp / Mở bài học"; on mobile it opens in a sheet. The winding map has a node dialog and a progress marker animation that respects reduced motion. |
| 3 | Onboarding | Goal choices stay local until the last step. A leave guard on in-app link clicks shows "Lưu lựa chọn trước khi rời đi?" with "Ở lại / Bỏ thay đổi / Lưu nháp". Also ported: "Huỷ chỉnh sửa", "Lưu mục tiêu", the diagnostic copy (saved after each choice, "Lưu và tiếp tục sau"), the resume intro, the "Để sau" rule (an existing AI path is kept), the BKT result screen, and the ready screen with "Làm bài kiểm tra đầu vào". |
| 4 | Lesson player | Task stepper; "Xem lộ trình" map sheet; mobile progress bar; "Chưa có nội dung bài học"; the real checklist rules (see deviations); review button; completion saves with a failure toast; prerequisite note. `id="checklist"` is kept. `{Codi.tutor.launcher(c.id, l.id)}` is called if it exists (coding request). `Codi.code.view(c, l)` and `Codi.tutor.open(courseId, lessonId)` are unchanged. |
| 5 | Materials | YouTube embed through the IFrame API (position saved on pause, every 10 s, on end and on pagehide; "Không theo dõi được tiến độ video" if the API is blocked; "Đang tải video…" with a 30 s timeout). The simulated video keeps the 90% rule. Simulated PDF records seen pages: "Đã xem n/m trang…", the text view, "Mở PDF trong trình duyệt" when a URL exists, and studied only once every page has been seen. Error state "Chưa tải được tài liệu" with "Thử lại" and "Mở video trên YouTube". Save error "Chưa lưu được tiến độ tài liệu" with "Thử lưu lại". Lesson bodies are rendered as safe markdown and support multiple materials ("Tài liệu bài học"). |
| 6 | Quiz | Attempts are saved as drafts, and each answer is saved when chosen. The attempt keeps a snapshot of the question revision it started on. Clickable navigator ("Đi đến câu hỏi", "Câu n, đã/chưa trả lời"). "Kết quả lần trước…"; `codeSnippet` (predict_output); unsupported-quiz message; "Đang gửi…". Save errors "Không thể lưu đáp án. Hãy chọn lại." (the choice is rolled back) and "Không thể lưu quiz.". The review sits in "Xem đáp án và giải thích". |
| 7 | Assignment | Real formats (file / link / text / file_or_link). Size limit per assignment (`maxFileSizeMb`, capped at 20). Simulated upload progress plus error and "Thử lại". "Tệp đã lưu" with "Gỡ tệp". Draft autosave after 600 ms ("Chưa lưu…", "Đã lưu bản nháp.", "Chưa lưu được bản nháp. Vui lòng thử lại.", "Đã khôi phục bản nháp."). Link validation on blur. Resubmit only while pending ("Bài đã nộp vẫn được giữ…", "Huỷ nộp lại", a `revision` counter). Graded copy is "Bài đã chấm không thể nộp lại.". |
| 12 | Public Q&A | Real placeholder and empty copy. Posting shows "Đã có lỗi xảy ra khi gửi câu hỏi." and rolls back if the save fails. |
| 13 | Private lecturer conversation (learner side) | Card "Câu hỏi riêng cho giảng viên · Đang chờ trả lời / Đã có trả lời / Đã giải quyết". It shows the last reply as a summary and expands into the thread. The learner can reply while the conversation is open (10-character minimum), which notifies the lecturer with "Phản hồi mới từ học viên". A resolved conversation is read-only and shows the real message. The coding agent did not build this list or reply UI, so it is in this feature. Creating a conversation stays in the tutor's escalation dialog. |
| 14 | /progress | Status column ("Chưa đủ tiên quyết", "Nên học trước: …"); quiz cells ("Đang làm · chưa nộp", "Chưa làm"); coding results in the "Bài tập" column; "Xem bản đồ kiến thức" link (`?course=`); sr-only caption; sync-error alert. |
| 15 | Study time | `useStudyHeartbeat` in the player ticks every 30 s while the tab is visible and focused. Gaps over 45 s are ignored. Seconds are credited to GMT+7 dates in `db.learnerStudyDays`, and the final interval is credited on blur, hide and unmount. Streak, weekly goal and stats move. |
| 16 | /insights/stats | GMT+7 dates and Monday weeks. Completion counts use stored `completedAt`. The C4 marker comes from the stored post-diagnostic levels, not hashed values. C6 uses stored answers when present. |
| 17 | Knowledge map | Concept detail panel: mastery, "n bằng chứng · Xác suất BKT p%" / "Chưa có bằng chứng học tập.", "Bài học liên quan" with "Học bài này" and the locked note, "Bài học được gợi ý". Selecting a node highlights its ancestors. The map is hidden until confirmed ("Chưa có bản đồ kiến thức…", "Về lộ trình"). Error state "Không thể tải bản đồ." with "Thử lại" (`scenario.kmap = 'error'`). Course picker, `?course=` support, and the "chưa đủ tiên quyết" wording. |
| 19/20 | Completion and offer | "Bạn đã đánh giá n/5"; "Xem lộ trình" on the offer card in the player. |
| 22 | BKT mastery | Real `updateBkt` (defaults pInit 0.1, pLearn 0.2, pGuess 0.2, pSlip 0.1; a concept may override them with `concept.bkt`) and `masteryLevel` (thresholds 0.40 / 0.60 / 0.85). Evidence: each answered diagnostic question except "Tôi chưa biết"; each answered quiz question, applied to the lesson's concepts; each coding submit, with a ledger so none is counted twice and a 0.7 cap after the solution was viewed. Studying a material alone gives no evidence. `r.mastery` is kept as the derived level so every reader shares one scale. |

## Rows skipped

- 8, 9, 10, 11 (coding challenge, tutorial, AI tutor panel and page): owned by the coding agent.
- 21 GitHub level suggestion in onboarding: the real onboarding has none (I checked `onboarding-screens.tsx`), so none was added. The dashboard GitHub card is shell-owned; I only render the call site.
- 18 /insights hub: kept as it was (a route that exists only in the mockup); copy aligned to "chưa đủ tiên quyết".
- Hint unlock: part of the coding rows, so not in this feature.
- Loading skeletons for the dashboard, path and progress pages: the store is loaded before the app renders, so a loading state there would be fake. Loading states exist only where something really loads (the YouTube iframe and API).

## Deviations from the mockup docs (for `docs/deviations-from-mockup.md`, controller-owned)

1. The quiz checklist item is "Đạt quiz (≥ N%)": the latest attempt must be submitted and must pass (real D6). The mockup only required a submit.
2. The quiz percent stays `Math.round` (the real `gradeQuiz` code), not an exact percent (scout C4). I followed the code over the prose.
3. A PDF counts as studied only when every page has been seen (C5), not when the last page is reached.
4. Mastery uses BKT. One correct diagnostic answer now shows "Đang học", not "Thành thạo" (C1). Completing a lesson without a quiz or code no longer raises mastery to 2.
5. Late policy: the real app stores no late flag, enforces nothing, and shows only "hạn nộp N ngày sau khi mở bài". The text "nộp muộn: …" was removed. The header line is now "Thang điểm X · điểm đạt P% · hạn nộp …".
6. The graded-assignment copy is now the real "Bài đã chấm không thể nộp lại." (C12).
7. Week, streak and calendar use the Vietnam calendar (Mon–Sun, GMT+7) (C7). The stats window ends on the later of `analyticsAsOf` and the learner's latest study day.
8. The knowledge map is hidden until `knowledgeMaps[courseId].status === 'confirmed'` (C9). Courses with no knowledge-map record count as confirmed.
9. Lesson-kind label "Slide/PDF" is now "PDF". The weekly-hours choices no longer show "≈ N tuần". The goal skip button sits beside "Tiếp tục". The last goal step reads "Lưu mục tiêu".
10. The mockup's placeholder lesson summary was removed. Lessons with no body and no material show "Chưa có nội dung bài học".
11. The checklist notes use the real wording. Coding notes are now "Đạt tất cả test" / "Lần nộp gần nhất chưa đạt" / "Nộp bài để chấm"; the mockup's "n/m test" and "đã xem lời giải" notes were removed.
12. The path list no longer marks the current row with an accent bar on the left. It uses a filled step marker and "Bắt đầu ở đây" instead (craft floor).

## Shared change requests

- `src/lib/charts.js` `graph()`: the locked node label "Chưa mở khoá" should become the real "Chưa đủ tiên quyết". For now I replace the string in the HTML output inside `insights-pages.jsx`. A `recommended` node marker in the graph would also help; today it only shows in the table and the detail panel.
- `src/lib/codi.js`: the store does not emit an event when a background sync fails, so `use-sync-error.js` checks `syncStatus.error` every 1.5 s. An emit on failure would remove that polling.
- `src/components/ui/primitives.jsx`: `mdToHtml` has no headings, code blocks or links, so lesson bodies use the local `lesson-markdown.jsx`.

## New seed fields (all additive, `patches/30-learning.js`)

- `lesson.materials: [{ id, type: 'video'|'pdf', title, url, durationSeconds?, pages? }]`. Two real YouTube URLs (`lesson-react-001` Tn6-PIqc4UM, `lesson-js-001` DHjqpvDnNGE; network needed) and `pages: 8` for PDF lessons.
- `lesson.assignment.maxFileSizeMb` (react-009: 10, js-004: 5, others: 20).
- `learnerSeed.courses['course-js-001']`: `bkt`, `diagnosticMastery`, `completedAt`.
- Fields added only when the app writes, with no change to the existing shape: `learnerStudyDays[].seconds` (`minutes` stays the rounded total), `submissions[].fileSize/fileType/revision`, `conversations[].updatedAt`, and the slice record fields `bkt`, `diagMastery`, `completedAt`, `evidence`, `videoPos`, `pdf[materialId] = { pages, pageCount, lastPage }`, `quiz[lessonId].status/questions/previousScore/submittedAt`. Older records are upgraded when read.

## Unresolved questions

- The two YouTube IDs come from memory. If either is wrong, the page shows the real error state ("Chưa tải được tài liệu", "Mở video trên YouTube"); someone should check them in the browser pass.
- Learner "resolve / reopen" of a conversation (PRODUCT Q34) is not in the real code, so it was not added.

Status: DONE_WITH_CONCERNS
Summary: All in-scope learning rows are ported to the real-app behaviour: BKT mastery, materials with YouTube and PDF page tracking, quiz and assignment rules and save errors, path summary and map, knowledge-map panel, GMT+7 study heartbeat, and the learner side of lecturer conversations. The build and seed load pass.
Concerns/Blockers: Nothing was checked in a browser. The YouTube IDs are not verified. Three small shared-runtime change requests are listed above.
