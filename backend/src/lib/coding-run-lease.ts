import { sql } from "drizzle-orm";

import { RUN_LEASE_MS } from "@codi-1/coding-runner";

// Learner, lecturer and tutorial runs share codingRunLeases. The lease must outlast one full
// sandbox call (cold start, execution, watchdog) plus finalization, so it comes from the runner's budget.
export const runLeaseExpiresAt = sql`clock_timestamp() + ${sql.raw(`interval '${RUN_LEASE_MS} milliseconds'`)}`;
