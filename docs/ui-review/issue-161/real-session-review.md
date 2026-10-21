# PR #165 — real-session integration verification, 21/10/2026

This supplements the original fixture-based screenshots in [README.md](README.md). The new browser checks sign in through the real login form and use the real services and database. No route, session, or API responses are intercepted for the knowledge-map flow.

## Versions and scope

- Base: `develop` at `437c1e8df16969a54b1fb96f0ff3e02a09c15e7a`.
- PR candidate: `831299c` (PR #165 plus the updated base).
- Separate integration candidate: `c20c4ef21c6463f85f374a42f0b7c43d38d28ccd`, incorporating #133 at `8f8ead1`, #160 at `45d3bd5`, and #144 at `dacdad8`.
- These integration branches remain separate from the PR candidate. No dependency PR was merged into develop by this verification.

## Results

| Check | PR candidate | Integration candidate |
|---|---|---|
| Full Vitest suite | 86 files / 1,528 tests passed | 100 files / 1,715 tests passed |
| Workspace TypeScript | Passed | Passed |
| Design standards | 0 violations | 0 violations |
| Production build | Passed | Production output generated and booted for the browser tests |
| Real-session browser tests | 4 passed, 0 skipped, 0 flaky | 8 passed, 0 skipped, 0 flaky |

The integration browser matrix is 1280×800 and 375×844, each in light and dark mode:

- Learner follows the actual #144 dashboard/results entry to the map, expands/collapses the table, selects a locked concept with no lesson link, selects an available concept, and uses #160's accessible “Học bài này” CTA to open the real player.
- Learner nodes remain 152×60. Rendered edge coordinates match the actual node boxes; ancestor highlighting works; declined concepts/edges are excluded. The learner document has no horizontal overflow.
- Direct navigation to a locked lesson renders the server layout's explanation and prerequisite link. A separate request using the same session verifies the lesson API returns **403**. The layout intentionally prevents the player from mounting; no player API request is expected during that navigation.
- Lecturer cycle edges stay destructive after selection; minimap edges/nodes match the active graph. Declining a concept removes the cycle, enables confirmation, and survives reload. Edges referencing declined concepts remain absent in both renderers. Remaining nodes are 232px wide and the horizontal edge endpoints match their rendered boxes.
- Confirmation availability is checked; the test does not claim to exercise publication or AI extraction.

The existing shared browser-health fixture checks unexpected browser/network errors; its documented global exclusions (including the existing hydration-warning exclusion) still apply. Happy DOM's existing YouTube iframe warnings also remain in unit-test output.

**Lecturer mobile limitation:** the #133 editor's outer layout still widens the document beyond the 375px viewport. The mobile lecturer cases prove graph compatibility and persisted review behavior; they do not certify responsive layout of the complete editor. This does not occur in the learner map. The full-width mobile lecturer screenshots below preserve that observed limitation rather than hiding it.

## Fixture lifecycle and reproduction

`apps/web/scripts/verify-knowledge-map-browser.mjs` requires explicit `--allow-dev-db`. It creates random, run-owned QA identities with generated passwords and already verified emails, plus one learner course and optionally four lecturer courses. It sends no email and does not alter existing accounts, schema, or learning activity. `finally` deletes only the run-owned courses and identities and verifies zero remaining sessions, credentials, enrollments, and skills.

Run against the configured development database and a production QA server built from the appropriate checkout. Start the standalone server on 3165 with `BETTER_AUTH_URL=http://localhost:3165`; use 3265 and the matching auth URL for the integration checkout. From `apps/web`:

```sh
# Standalone PR checkout; four learner cases.
node scripts/verify-knowledge-map-browser.mjs --allow-dev-db -- --grep 'learner locked'

# Separate integration checkout with #133/#160/#144; eight cases.
node scripts/verify-knowledge-map-browser.mjs --allow-dev-db --integration
```

The runner injects only disposable QA credentials into its child process. Credentials and browser storage state are not committed. Both completed runs reported owned-data cleanup and zero remaining sessions, credentials, enrollments, and skills.

## Integration screenshots

These images are from the authenticated integration run, with disposable QA data. Existing mockup comparison images remain in [README.md](README.md).

| State | Desktop light | Desktop dark | 375px light | 375px dark |
|---|---|---|---|---|
| Learner locked concept | [Image](real-session/learner-locked-desktop-light.png) | [Image](real-session/learner-locked-desktop-dark.png) | [Image](real-session/learner-locked-mobile-light.png) | [Image](real-session/learner-locked-mobile-dark.png) |
| Available lesson / #160 CTA | [Image](real-session/learner-unlocked-desktop-light.png) | [Image](real-session/learner-unlocked-desktop-dark.png) | [Image](real-session/learner-unlocked-mobile-light.png) | [Image](real-session/learner-unlocked-mobile-dark.png) |
| Real lesson player | [Image](real-session/learner-player-desktop-light.png) | [Image](real-session/learner-player-desktop-dark.png) | [Image](real-session/learner-player-mobile-light.png) | [Image](real-session/learner-player-mobile-dark.png) |
| Server blocks locked URL | [Image](real-session/learner-server-locked-desktop-light.png) | [Image](real-session/learner-server-locked-desktop-dark.png) | [Image](real-session/learner-server-locked-mobile-light.png) | [Image](real-session/learner-server-locked-mobile-dark.png) |
| Lecturer cycle / minimap | [Image](real-session/lecturer-cycle-desktop-light.png) | [Image](real-session/lecturer-cycle-desktop-dark.png) | [Image](real-session/lecturer-cycle-mobile-light.png) | [Image](real-session/lecturer-cycle-mobile-dark.png) |
| Lecturer after declining concept | [Image](real-session/lecturer-dag-desktop-light.png) | [Image](real-session/lecturer-dag-desktop-dark.png) | [Image](real-session/lecturer-dag-mobile-light.png) | [Image](real-session/lecturer-dag-mobile-dark.png) |
