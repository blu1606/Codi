# Design reference: video-preflight (SOI)

The user's pinned reference for the codi-rebuild redesign: `D:\CODE\Hackathon\video-preflight`, live at
https://video-preflight.ddnsfree.com/. Summary of its design thinking, from a read-only code analysis and
screenshots on 2026-11-02.

## Visual world

- Light-first. Page `#f1f2f5`, surface `#ffffff`, subtle `#f6f7f9`. Ink `#0f1115`, ink-2 `#30343b`, muted `#545963`,
  faint `#8a8f98`. Hairlines `#e6e8eb` / `#d4d7dc`.
- One brand accent (Shopee orange `#ee4d2d`; Codi must keep its own accent), used only for the primary action,
  running status, active tab and key numbers. Status colours are separate: critical, pass, amber, info.
- The only dark object is the product "stage" (`#121419` / `#1b1e25`): the thing being worked on.
- Type: Be Vietnam Pro for text, a characterful grotesque for landing headlines, JetBrains Mono for timecodes,
  scores and IDs, `tabular-nums` on every number. Base unit 4px; panels 12–20px radius; primary button 44px.
- Hairline borders on most surfaces, one soft "sheet" shadow; the printed direction says no cards, no shadows.

## Layout thinking

- The workspace is dominant: one large centre object (the video stage), questions on the left, verdict and fixes
  on the right.
- The user's question comes first: the result opens with the decision, then the top three fixes, then the proof.
- One filled button per screen; secondary is bordered; rare actions go in a ⋯ menu; running state never lives
  inside a button.
- Multi-step flows get a stepper header; the simulation is labelled with a persistent "Mô phỏng" tag.
- Landing: big two-line statements, asymmetric sections (statement left, evidence right), a real product window,
  numbered rows only where order matters, an FAQ of hairline rows.

## Async jobs (the most transferable pattern)

1. A pre-run gate states cost and what is cached before anything paid starts.
2. Streamed named stages (pending / running / done / skipped / error), each with a one-line summary and duration,
   expandable to its input and output.
3. Progress inside a step (`done/total`, phase label).
4. Partial results fill in as their stage finishes; the overall score stays hidden until the end, and the UI says so.
5. On finish the stage list collapses to one line ("19 bước · 12.4s · xem trace").
6. Global running status in the app bar; honest reveal when a batch result is animated; a dropped stream replays
  the saved result and says so.

## Honesty rules

- Every number carries its provenance (REAL / MOCK / INFERRED / MISSING).
- Missing is not zero: show "–" with the reason and the coverage.
- No blank screens: every empty, loading and error state has copy and a way forward.
- Motion explains a state change; nothing loops at rest; reduced motion respected.

## Imagery

- One illustration per empty or setup state, never decoration; thumbnails fall back to a letter tile and hide on
  error instead of showing a broken image.
