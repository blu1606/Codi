# Finish review: lesson page (split pane)

Verdict: SHIP AFTER FIXES (2026-11-02). Persistence passes: PRODUCT.md present, seed `seed:2eae985da3c0837d` verified.
DESIGN.md is still to be written after the fixes.

## Material fixes

1. The `.dev-toggle` scenario pill floats over the reading text and the mobile button bars. Routed to the navbar
   agent.
2. `.ln-meta-kind` labels the lesson kind, not the selected material, so a video shows "PDF · 15 phút".
3. Two solid primary buttons on code lessons (Chạy + Nộp bài; on p01 "Tiếp: …" + Chạy).
4. The quiz score uses a ring and non-mono "100%"; the contract asks for tabular mono scores.
5. The "Lỗi khi chạy" status chip has no icon.
6. Header content is max-width centred while the lesson bar is full width, so they do not line up. Routed to the
   navbar agent.
7. A faded disabled "Hoàn thành bài học" primary that repeats the chips and does not project well.
8. "Tiếp tục" in the quiz bar looks like plain text; the active chip lacks a mono progress readout.

## Keep

The 58/42 split with AI and Hỏi đáp as work-pane tabs, the chip-driven lesson bar where "Bài sau" turns teal only
when everything is done, and the navy frame around the video and the code editor.

## Open question

Every headless capture shows an empty video box and the "Không theo dõi được tiến độ video" alert. Check once in a
real browser on the demo network: if the venue blocks YouTube, the alert will show on every video lesson.
