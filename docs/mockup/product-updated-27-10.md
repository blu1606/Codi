# PRODUCT.md — Update 27/10/2026

> Change log for the adaptive learning path, from three product-owner decisions made 27/10/2026.
> Audience: the Codi team and the prototype. `PRODUCT.md` remains the source of truth; `STATE-MACHINES.md` holds the state contract, and `js/learner-learning.js` is the clickable prototype.

---

## 1. Decision → what changed

| # | Decision (27/10/2026) | Change in PRODUCT.md | Change in STATE-MACHINES.md / prototype |
|---|---|---|---|
| 65 | Soft prerequisite lock replaces the hard lock. Path ordering still respects prerequisites. | Decision 65 added; decision 12 amended; Q8 resolved; flow L5 decision points, S10 and S11 states, §11 assumption updated. | G6 rewritten (advisory); `locked` = "Chưa đủ tiên quyết", access unchanged; §8 row and transition table updated. Player shows "Nên học {concept} trước (bài {lesson})" with a link instead of blocking. |
| 66 | "Học nội dung" for a video is done at ≥ 90% watched (was 100%). | Decision 66 added; flow L6 checklist step 2. | §9 study item and study triggers; video shows the "Xem ít nhất 90%…" hint until studied. |
| 67 | After a lesson completion, Codi shows a non-blocking adaptive offer: insight plus the applicable options (skip mastered, practice, harder, keep). Applied immediately with "Hoàn tác". Regeneration never overwrites an applied adjustment. | Decision 67 added; flow L6 step 4a; S10 and S11 states; §7 rule 9; §11 open questions Q34 and Q35. | §8 offer and adjustment tables (options, guards, side effects, transitions); G16 added; `applyOffer`, `offerChoices`, `offerCard`, `ln-offer-*`; `generatePath` keeps the adjustment. |

## 2. Resolved points

- **Q38** Undo exists only while the "Hoàn tác" toast is visible (about 7 s), per §7.17.
- **Q39** A goal edit regenerates the path and clears any applied adjustment (newer explicit intent wins).
