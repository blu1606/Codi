# Analytics prototype boundary

This prototype deliberately prioritizes honest persisted counts over a complete
analytics dashboard. Unsupported telemetry is not zero, and prototype sample
data must never become a production fallback. The reduced scope is an accepted
delivery constraint, not a new refund, accounting or telemetry policy.

The executable owners are:

- [Admin creation counts](../apps/web/src/lib/admin-analytics-service.ts):
  creation is not activity, publication, payment or revenue recognition.
- [Learner aggregates](../apps/web/src/lib/learner-insights-service.ts):
  current enrollment ownership and dated lesson records are distinct concepts.
  A study attestation or video position is not elapsed study time.
- [Window and response contract](../apps/web/src/lib/analytics-contract.ts):
  calendar periods use GMT+7; comparisons and invented historical trends are
  intentionally excluded.
- [Query boundary tests](../apps/web/src/lib/analytics-real-data.test.ts),
  [authorization tests](../apps/web/src/lib/analytics-routes.test.ts) and
  [controlled client-state tests](../apps/web/src/components/analytics/analytics-read-panel.test.ts).
  These are not live PostgreSQL, browser or deployment acceptance.

Finance amounts, reconciliation, advanced cards, detail datasets and CSV remain
unavailable. Reintroducing them requires persisted evidence and an explicit
definition for each retained metric; do not add a refund framework or infer
revenue from course prices to fill the screen. Mockup source is unchanged.
