import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { RUN_LEASE_MS } from "@codi-1/coding-runner";
import { runLeaseExpiresAt } from "./coding-run-lease";

describe("run lease expiry", () => {
  it("is rendered from the runner budget rather than a hand-maintained literal", () => {
    const { sql } = new PgDialect().sqlToQuery(runLeaseExpiresAt);
    expect(sql).toBe(`clock_timestamp() + interval '${RUN_LEASE_MS} milliseconds'`);
  });
});
