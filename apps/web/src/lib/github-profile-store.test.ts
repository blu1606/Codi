import { drizzle } from "drizzle-orm/node-postgres";
import type { Database } from "@codi-1/db";
import { describe, expect, it } from "vitest";
import {
  GITHUB_PROFILE_LIMITS,
  type GithubCollectionSnapshot,
} from "./github-profile-contract";
import type { GithubProfileGenerationReservation } from "./github-profile-ai";
import type { GithubProfileAnalysis } from "./github-profile-analysis-contract";
import {
  createGithubProfileStore,
  type GithubProfileRequest,
  type GithubProfileTrustedBudget,
} from "./github-profile-store";

const request: GithubProfileRequest = {
  userId: "learner",
  accountId: "local-github",
  githubUserId: "123",
  consentVersion: "public-github-v1",
  requestId: "11111111-1111-4111-8111-111111111111",
  consentedAt: new Date("2026-10-20T00:00:00.123Z"),
  activeUntil: new Date("2026-10-20T00:00:55.123Z"),
};
const claim = {
  userId: request.userId,
  accountId: request.accountId,
  githubUserId: request.githubUserId,
  consentVersion: request.consentVersion,
};
const budget: GithubProfileTrustedBudget = {
  budgetKey: "github-live-regression",
  slot: "pre-integration",
  candidateSha: "a".repeat(40),
};
const reservation: GithubProfileGenerationReservation = {
  model: "openai/gpt-6-luna",
  inputTokens: 1000,
  maxOutputTokens: 4096,
  maximumCostMicroUsd: 2173,
};
const iso = (value: Date) => value.toISOString();
function snapshot(): GithubCollectionSnapshot {
  const commitSha = "a".repeat(40);
  return {
    version: 1,
    status: "complete",
    identity: { id: "123", login: "learner" },
    collectedAt: "2026-10-20T00:00:00Z",
    repositories: [
      {
        id: 1,
        owner: "learner",
        name: "project",
        pushedAt: null,
        defaultBranch: "main",
        disposition: "selected",
        commitSha,
        files: [
          { path: "package.json", state: "collected", evidenceId: "file" },
        ],
      },
    ],
    evidence: [
      {
        id: "file",
        kind: "file",
        repositoryId: 1,
        path: "package.json",
        commitSha,
        blobSha: "b".repeat(40),
        text: '{"dependencies":{"react":"19"}}',
        sourceUrl: `https://github.com/learner/project/blob/${commitSha}/package.json`,
        collectedAt: "2026-10-20T00:00:00Z",
      },
    ],
    issues: [],
    coverage: {
      publicAccess: "oauth_app",
      listingComplete: true,
      listed: 1,
      selected: 1,
      requests: 8,
      responseBytes: 1000,
      elapsedMs: 10,
      limits: GITHUB_PROFILE_LIMITS,
    },
  };
}
function analysis(): GithubProfileAnalysis {
  return {
    technologies: [
      {
        technologyId: "framework:React",
        usage: "regular",
        confidence: "low",
        explanation: "Ước tính từ dependency.",
        supports: [
          {
            observationId: "framework:React:declared_dependency",
            evidenceId: "file",
            repositoryId: 1,
          },
        ],
      },
    ],
    areas: [],
    overall: null,
  };
}
const edits = {
  technologies: [{ technologyId: "framework:React", usage: "tried" }],
  areas: [],
  excludedRepositoryIds: [],
};
// Real Drizzle compilation and transaction commands; scripted query replies, no DB/socket.
// These tests prove SQL shape/ordering and guards, NOT PostgreSQL concurrency/rollback behavior.
function fixture(
  replies: (unknown[] | Error)[] = [],
  config: GithubProfileTrustedBudget | undefined = budget,
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const queue = [...replies];
  const client = {
    query: async (query: { text: string }, params: unknown[] = []) => {
      calls.push({ sql: query.text, params });
      if (
        /^(begin|commit|rollback)/i.test(query.text) ||
        query.text.includes("pg_advisory_xact_lock")
      )
        return { rows: [] };
      const response = queue.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error(`Unexpected fixture query: ${query.text}`);
      return { rows: response };
    },
  };
  const db = drizzle({ client: client as never }) as unknown as Database;
  return { calls, queue, store: createGithubProfileStore(db, config), db };
}
const owner = [["learner"]];
const linked = [["local-github", "learner", "123"]];
function profile(
  overrides: Partial<{
    accountId: string;
    snapshot: unknown;
    corrections: unknown;
  }> = {},
) {
  return [
    [
      "learner",
      overrides.accountId ?? "local-github",
      request.requestId,
      iso(request.activeUntil),
      request.consentVersion,
      iso(request.consentedAt),
      overrides.snapshot === undefined ? snapshot() : overrides.snapshot,
      analysis(),
      overrides.corrections ?? edits,
      "2026-10-19T00:00:00.000Z",
    ],
  ];
}
const activeQuery = (calls: { sql: string; params: unknown[] }[]) =>
  calls.find(
    (call) =>
      call.sql.startsWith("select") &&
      call.sql.includes('from "github_profiles"'),
  )!;
function expectFence(query: { sql: string; params: unknown[] }) {
  for (const name of [
    "user_id",
    "account_id",
    "active_request_id",
    "active_until",
    "consent_version",
    "consented_at",
  ])
    expect(query.sql).toContain(`"${name}"`);
  for (const value of [
    request.userId,
    request.accountId,
    request.requestId,
    request.consentVersion,
  ])
    expect(query.params).toContain(value);
  expect(query.sql).toContain("clock_timestamp()");
  expect(query.params).toContain(iso(request.consentedAt));
  expect(query.params).toContain(iso(request.activeUntil));
}

describe("durable private GitHub profile store", () => {
  it("selects linked metadata with owner/provider predicates and no token columns", async () => {
    const task = fixture([linked]);
    expect(await task.store.getLinkedAccount("learner")).toEqual({
      accountId: "local-github",
      userId: "learner",
      githubUserId: "123",
    });
    const query = task.calls[0]!;
    expect(query.sql).toContain('"account"."user_id" =');
    expect(query.sql).toContain('"account"."provider_id" =');
    expect(query.params).toContain("learner");
    expect(query.params).toContain("github");
    expect(query.sql).not.toMatch(
      /access_token|refresh_token|id_token|password|scope/i,
    );
    expect(query.sql).toContain("limit");
  });
  it("returns null when no GitHub account is linked", async () => {
    expect(await fixture([[]]).store.getLinkedAccount("learner")).toBeNull();
  });
  it.each(["not-a-number", "0", "00123", "-123"])(
    "rejects noncanonical provider identity %s",
    async (githubUserId) => {
      const task = fixture([[["local-github", "learner", githubUserId]]]);
      await expect(
        task.store.getLinkedAccount("learner"),
      ).rejects.toMatchObject({ code: "account_unavailable" });
    },
  );
  it("rejects ambiguous multiple linked GitHub accounts", async () => {
    await expect(
      fixture([[...linked, ...linked]]).store.getLinkedAccount("learner"),
    ).rejects.toMatchObject({ code: "account_unavailable" });
  });

  it("claims a fresh UUID for 55 seconds under row locks, preserving published data", async () => {
    const returnedId = "22222222-2222-4222-8222-222222222222";
    const task = fixture([
      owner,
      linked,
      [],
      profile(),
      [[returnedId, iso(request.activeUntil), iso(request.consentedAt)]],
    ]);
    const result = await task.store.claim(claim);
    expect(result).toMatchObject({
      ...claim,
      requestId: returnedId,
      activeUntil: request.activeUntil,
      consentedAt: request.consentedAt,
    });
    expect(task.calls[0]!.sql).toBe("begin isolation level read committed");
    expect(task.calls.at(-1)!.sql).toBe("commit");
    expect(
      task.calls.filter((call) => call.sql.includes("for update")),
    ).toHaveLength(3);
    const insert = task.calls.find((call) =>
      call.sql.startsWith('insert into "github_profiles"'),
    )!;
    expect(insert.sql).toContain('on conflict ("user_id") do nothing');
    const update = task.calls.find((call) =>
      call.sql.startsWith('update "github_profiles"'),
    )!;
    expect(update.sql).toContain("interval '55 seconds'");
    expect(update.sql).toContain(
      "date_trunc('milliseconds', clock_timestamp())",
    );
    const setClause = update.sql.split(" where ")[0]!;
    expect(setClause).not.toMatch(
      /"snapshot"|"analysis"|"corrections"|"published_at"/,
    );
    expect(update.sql).toContain(
      '"github_profiles"."active_request_id" is null',
    );
    expect(update.sql).toMatch(/"active_until" <= clock_timestamp\(\)/);
    const generated = update.params.find(
      (value) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value),
    );
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    expect(generated).not.toBe(request.requestId);
  });

  it("rejects an active duplicate and rolls back without changing last result", async () => {
    const task = fixture([owner, linked, [], profile(), []]);
    await expect(task.store.claim(claim)).rejects.toMatchObject({
      code: "active_request",
    });
    expect(task.calls.at(-1)!.sql).toBe("rollback");
  });
  it("does not claim if the session owner has disappeared", async () => {
    const task = fixture([[]]);
    await expect(task.store.claim(claim)).rejects.toMatchObject({
      code: "account_unavailable",
    });
    expect(task.calls.some((call) => call.sql.startsWith("insert"))).toBe(
      false,
    );
  });
  it("rechecks account owner/provider/numeric identity instead of trusting its foreign key", async () => {
    const task = fixture([owner, []]);
    await expect(task.store.claim(claim)).rejects.toMatchObject({
      code: "account_unavailable",
    });
    const query = task.calls.find((call) =>
      call.sql.includes('from "account"'),
    )!;
    for (const field of ["id", "user_id", "provider_id", "account_id"])
      expect(query.sql).toContain(`"account"."${field}" =`);
    expect(query.params).toEqual(["local-github", "learner", "github", "123"]);
  });
  it("cannot transfer an existing profile to another local account", async () => {
    const task = fixture([
      owner,
      linked,
      [],
      profile({ accountId: "another-local-account" }),
    ]);
    await expect(task.store.claim(claim)).rejects.toMatchObject({
      code: "request_fenced",
    });
    expect(task.calls.some((call) => call.sql.startsWith("update"))).toBe(
      false,
    );
  });
  it("rejects an old profile whose numeric identity changed in place", async () => {
    const source = snapshot();
    source.identity!.id = "456";
    await expect(
      fixture([owner, linked, [], profile({ snapshot: source })]).store.claim(
        claim,
      ),
    ).rejects.toMatchObject({ code: "request_fenced" });
  });

  it("releases only the matching owner/account/request/deadline/consent fence", async () => {
    const task = fixture([[["learner"]]]);
    expect(await task.store.release(request)).toBe(true);
    const query = task.calls[0]!;
    expect(query.sql).toContain('set "active_request_id" =');
    expect(query.sql).toContain('"active_until" =');
    for (const value of [
      request.userId,
      request.accountId,
      request.requestId,
      request.consentVersion,
      iso(request.consentedAt),
      iso(request.activeUntil),
    ])
      expect(query.params).toContain(value);
    expect(query.sql).not.toMatch(
      /"snapshot"|"analysis"|"corrections"|"published_at"/,
    );
  });
  it("does not clear a newer request when the old request releases", async () => {
    expect(await fixture([[]]).store.release(request)).toBe(false);
  });

  it("publishes with account and consent rechecks, without overwriting corrections", async () => {
    const task = fixture([owner, linked, profile(), [["learner"]]]);
    await task.store.publish(request, snapshot(), analysis());
    expectFence(activeQuery(task.calls));
    const update = task.calls.find((call) =>
      call.sql.startsWith('update "github_profiles"'),
    )!;
    expectFence(update);
    expect(update.sql.split(" where ")[0]).not.toContain('"corrections"');
    expect(update.sql).toContain('"published_at" = date_trunc');
    expect(task.calls.at(-1)!.sql).toBe("commit");
    expect(task.calls.some((call) => call.sql.startsWith("insert"))).toBe(
      false,
    );
  });
  it("cannot resurrect a deleted/recreated/expired profile from a late publication", async () => {
    const task = fixture([owner, linked, []]);
    await expect(
      task.store.publish(request, snapshot(), analysis()),
    ).rejects.toMatchObject({ code: "request_fenced" });
    expect(task.calls.some((call) => /^(insert|update)/.test(call.sql))).toBe(
      false,
    );
    expect(task.calls.at(-1)!.sql).toBe("rollback");
  });
  it("rechecks expiry in the final publication update after taking locks", async () => {
    const task = fixture([owner, linked, profile(), []]);
    await expect(
      task.store.publish(request, snapshot(), analysis()),
    ).rejects.toMatchObject({ code: "request_fenced" });
    expect(task.calls.at(-1)!.sql).toBe("rollback");
    expectFence(task.calls.find((call) => call.sql.startsWith("update"))!);
  });
  it("does not publish after generic unlink or account ownership/provider changes", async () => {
    const task = fixture([owner, []]);
    await expect(
      task.store.publish(request, snapshot(), analysis()),
    ).rejects.toMatchObject({ code: "account_unavailable" });
    expect(task.calls.some((call) => call.sql.startsWith("update"))).toBe(
      false,
    );
  });
  it.each([
    "identity",
    "fabricated-evidence",
    "empty-analysis",
    "failed-collection",
  ])("rejects %s without overwriting last publication", async (failure) => {
    const task = fixture();
    const source = snapshot();
    let proposed = analysis();
    if (failure === "identity") source.identity!.id = "999";
    if (failure === "fabricated-evidence")
      proposed.technologies[0]!.supports[0]!.evidenceId = "invented";
    if (failure === "empty-analysis")
      proposed = { technologies: [], areas: [], overall: null };
    if (failure === "failed-collection") source.status = "failed";
    await expect(
      task.store.publish(request, source, proposed),
    ).rejects.toMatchObject({ code: "invalid_profile" });
    expect(task.calls).toEqual([]);
  });
  it("rejects corrupt corrections rather than silently replacing them", async () => {
    const task = fixture([
      owner,
      linked,
      profile({ corrections: { fabricated: true } }),
    ]);
    await expect(
      task.store.publish(request, snapshot(), analysis()),
    ).rejects.toMatchObject({ code: "invalid_profile" });
    expect(task.calls.some((call) => call.sql.startsWith("update"))).toBe(
      false,
    );
  });
  it("sanitizes an uncloneable publication before accessing the database", async () => {
    const task = fixture();
    const source = { ...snapshot(), untrusted: () => "PRIVATE_INPUT" };
    await expect(
      task.store.publish(request, source, analysis()),
    ).rejects.toMatchObject({
      code: "invalid_profile",
      message: "GitHub profile store: invalid_profile",
    });
    expect(task.calls).toEqual([]);
  });

  it("reads only owner-linked published data, including retained corrections", async () => {
    const task = fixture([
      [
        [
          "local-github",
          "123",
          snapshot(),
          analysis(),
          edits,
          "2026-10-19T00:00:00Z",
        ],
      ],
    ]);
    const result = await task.store.read("learner");
    expect(result).toMatchObject({
      accountId: "local-github",
      githubUserId: "123",
      corrections: edits,
    });
    expect(result!.publishedAt).toBeInstanceOf(Date);
    const query = task.calls[0]!;
    expect(query.sql).toContain('inner join "account"');
    expect(query.sql).toContain('"github_profiles"."user_id" =');
    expect(query.sql).toContain('"account"."user_id" =');
    expect(query.sql).toContain('"account"."provider_id" =');
    expect(query.sql).toContain('"published_at" is not null');
    expect(query.params).toEqual(["learner", "github", "learner", 1]);
    expect(query.sql).not.toMatch(
      /access_token|refresh_token|id_token|password/,
    );
  });
  it("returns null for missing/unlinked/unpublished owner result", async () => {
    expect(await fixture([[]]).store.read("learner")).toBeNull();
  });
  it("never exposes old data if the linked numeric identity changed", async () => {
    const task = fixture([
      [
        [
          "local-github",
          "456",
          snapshot(),
          analysis(),
          edits,
          "2026-10-19T00:00:00Z",
        ],
      ],
    ]);
    expect(await task.store.read("learner")).toBeNull();
  });

  it("serializes the budget before aggregate checks and inserts with the full live fence", async () => {
    const task = fixture([
      owner,
      linked,
      profile(),
      [[0, "0"]],
      [{ request_id: request.requestId }],
    ]);
    expect(await task.store.reserveGeneration(request, reservation)).toBe(true);
    expect(task.calls[0]!.sql).toBe("begin isolation level read committed");
    const lockIndex = task.calls.findIndex((call) =>
      call.sql.includes("pg_advisory_xact_lock"),
    );
    const aggregateIndex = task.calls.findIndex((call) =>
      call.sql.includes("coalesce(sum("),
    );
    const insertIndex = task.calls.findIndex((call) =>
      call.sql.startsWith('insert into "github_generation_reservations"'),
    );
    expect(lockIndex).toBe(1);
    expect(lockIndex).toBeLessThan(aggregateIndex);
    expect(aggregateIndex).toBeLessThan(insertIndex);
    expect(task.calls[lockIndex]!.sql).toContain("hashtextextended");
    expect(task.calls[lockIndex]!.params).toEqual([
      "github-profile-generation:github-live-regression",
    ]);
    expect(task.calls[aggregateIndex]!.params).toEqual([budget.budgetKey]);
    const insert = task.calls[insertIndex]!;
    expectFence(insert);
    expect(insert.sql).toContain('from "github_profiles" inner join "account"');
    expect(insert.sql).toContain('"account"."user_id" =');
    expect(insert.sql).toContain('"account"."provider_id" =');
    expect(insert.sql).toContain('"account"."account_id" =');
    expect(insert.sql).toContain(
      'on conflict do nothing returning "request_id"',
    );
    expect(insert.params.slice(0, 8)).toEqual([
      budget.budgetKey,
      budget.slot,
      request.requestId,
      budget.candidateSha,
      reservation.model,
      reservation.inputTokens,
      4096,
      reservation.maximumCostMicroUsd,
    ]);
    expect(task.calls.at(-1)!.sql).toBe("commit");
    expect(task.calls.some((call) => /^(update|delete)/.test(call.sql))).toBe(
      false,
    );
  });
  it.each([
    [3, 4346],
    [1, 19_000],
    [3, 0],
  ])(
    "denies aggregate attempts=%i cost=%i without an insert",
    async (attempts, cost) => {
      const task = fixture([owner, linked, profile(), [[attempts, cost]]]);
      expect(await task.store.reserveGeneration(request, reservation)).toBe(
        false,
      );
      expect(task.calls.some((call) => call.sql.startsWith("insert"))).toBe(
        false,
      );
    },
  );
  it("allows the third attempt exactly at the total cost ceiling", async () => {
    const task = fixture([
      owner,
      linked,
      profile(),
      [[2, 20_000 - reservation.maximumCostMicroUsd]],
      [{ request_id: request.requestId }],
    ]);
    expect(await task.store.reserveGeneration(request, reservation)).toBe(true);
  });
  it("keeps the diagnostic slot distinct without changing the budget key", async () => {
    const task = fixture(
      [
        owner,
        linked,
        profile(),
        [[1, 2340]],
        [{ request_id: request.requestId }],
      ],
      { ...budget, slot: "diagnostic-preintegration" },
    );
    expect(await task.store.reserveGeneration(request, reservation)).toBe(true);
    const insert = task.calls.find((call) =>
      call.sql.startsWith('insert into "github_generation_reservations"'),
    )!;
    expect(insert.params.slice(0, 2)).toEqual([
      budget.budgetKey,
      "diagnostic-preintegration",
    ]);
    expect(task.calls.some((call) => /^(update|delete)/.test(call.sql))).toBe(
      false,
    );
  });
  it.each([
    [0, -1],
    [-1, 0],
    [0, "not-a-number"],
  ])(
    "fails closed for invalid accounting aggregate %s/%s",
    async (attempts, cost) => {
      const task = fixture([owner, linked, profile(), [[attempts, cost]]]);
      await expect(
        task.store.reserveGeneration(request, reservation),
      ).rejects.toMatchObject({ code: "store_failed" });
      expect(task.calls.some((call) => call.sql.startsWith("insert"))).toBe(
        false,
      );
      expect(task.calls.at(-1)!.sql).toBe("rollback");
    },
  );
  it("fails closed without trusted budget configuration and touches no DB", async () => {
    const task = fixture();
    const store = createGithubProfileStore(task.db);
    expect(await store.reserveGeneration(request, reservation)).toBe(false);
    expect(task.calls).toEqual([]);
  });
  it.each(["candidate-sha", "slot", "empty-key"])(
    "rejects invalid trusted budget %s",
    (failure) => {
      const task = fixture();
      const config = { ...budget };
      if (failure === "candidate-sha") config.candidateSha = "not-a-sha";
      if (failure === "slot") config.slot = "exploratory" as typeof budget.slot;
      if (failure === "empty-key") config.budgetKey = "";
      expect(() => createGithubProfileStore(task.db, config)).toThrow();
    },
  );
  it.each([
    "model",
    "input-zero",
    "input-cap",
    "fractional",
    "output",
    "under-reserved",
    "cost-cap",
  ])("rejects invalid reservation %s before transaction", async (failure) => {
    const task = fixture();
    const proposed = { ...reservation };
    if (failure === "model")
      proposed.model = "openai/other" as typeof proposed.model;
    if (failure === "input-zero") proposed.inputTokens = 0;
    if (failure === "input-cap") proposed.inputTokens = 16_001;
    if (failure === "fractional") proposed.inputTokens = 1.1;
    if (failure === "output") proposed.maxOutputTokens = 100 as 4096;
    if (failure === "under-reserved") proposed.maximumCostMicroUsd = 1;
    if (failure === "cost-cap") proposed.maximumCostMicroUsd = 20_001;
    await expect(
      task.store.reserveGeneration(request, proposed),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(task.calls).toEqual([]);
  });
  it("does not insert a reservation after consent/request expiry or profile deletion", async () => {
    const task = fixture([owner, linked, []]);
    await expect(
      task.store.reserveGeneration(request, reservation),
    ).rejects.toMatchObject({ code: "request_fenced" });
    expect(task.calls.some((call) => call.sql.includes("coalesce(sum("))).toBe(
      false,
    );
    expect(task.calls.some((call) => call.sql.startsWith("insert"))).toBe(
      false,
    );
    expect(task.calls.at(-1)!.sql).toBe("rollback");
  });
  it("denies expired-at-insert and duplicate slot/request reservations without retries", async () => {
    const task = fixture([owner, linked, profile(), [[0, 0]], []]);
    expect(await task.store.reserveGeneration(request, reservation)).toBe(
      false,
    );
    expect(
      task.calls.filter((call) => call.sql.startsWith("insert")),
    ).toHaveLength(1);
  });
  it("sanitizes transaction failure and offers no reservation refund path", async () => {
    const task = fixture([
      owner,
      linked,
      profile(),
      [[0, 0]],
      new Error("PRIVATE_DATABASE_DETAIL"),
    ]);
    const error = await task.store
      .reserveGeneration(request, reservation)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "store_failed" });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain("PRIVATE_DATABASE_DETAIL");
    expect(task.calls.at(-1)!.sql).toBe("rollback");
    expect(Object.keys(task.store)).not.toContain("refund");
    expect(task.calls.some((call) => /^(update|delete)/.test(call.sql))).toBe(
      false,
    );
  });
});
