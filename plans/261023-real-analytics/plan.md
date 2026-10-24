# Real analytics prototype

Status: implemented; focused/types/standards/default build passed.
First full run passed; second full run has an untouched coding-runner failure.
Acceptance remains Lead-owned; no database or browser proof is claimed.

Outcome: replace production fixtures with a small real, read-only KPI subset.
Constraints: preserve fbab56f ancestry, no DB/provider execution, schema changes,
shared package edits, publication, unrelated merges or mockup edits.
Non-goals: finance recognition, reconciliation, telemetry, historical charts,
comparison, detail tables and CSV. These become explicitly unavailable.

1. Inspect pinned schema, guards, mockup and current develop compatibility.
2. Replace server services with owner-scoped enrollment/completion aggregates
   and admin user/course/order creation counts. Use current GMT+7 calendar days,
   inclusive start/exclusive next-day end. Keep authentication/active-role guards.
3. Replace client builders with actual API responses and accessible independent
   loading/error/retry/empty states. Disable detail/export consistently.
4. Verify red/green predicates, isolation, route authorization and UI states;
   then full tests, types, standards and default build with nonsecret config.

Acceptance: no production seed imports; trusted user ID in every learner query;
dated completion and creation predicates; zero only for supported empty counts;
unavailable never rendered as zero; no dead reconciliation links. Controlled
doubles prove SQL construction/transport, not PostgreSQL or browser behavior.

Reviewed against Lead brief and schema: no material undefined KPI is retained.
Rollback: revert the single scoped local commit; no database state is changed.
