import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runGithubProfileRequest,
  GITHUB_PROFILE_SERVICE_LIMITS,
  type GithubProfileServiceOptions,
} from "./github-profile-service";

// Offline transport fixtures exercise the real collector, extraction, projection and AI adapter.
// They establish orchestration behavior, not live consent, provider or persistence acceptance.
const NOW = "2026-10-20T00:00:00.000Z";
const body = { consentVersion: "public-github-v1", githubProfileInput: "" };
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
function harness() {
  const controller = new AbortController();
  const repository = {
    databaseId: 1,
    name: "project",
    owner: { databaseId: 123, login: "learner" },
    isPrivate: false,
    visibility: "PUBLIC",
    isFork: false,
    isEmpty: false,
    diskUsage: 10,
    pushedAt: null,
    defaultBranchRef: {
      name: "main",
      target: { __typename: "Commit", oid: "a".repeat(40) },
    },
    languages: {
      edges: [{ size: 100, node: { name: "TypeScript" } }],
      pageInfo: { hasNextPage: false },
    },
  };
  const graphqlBody = (
    nodes: unknown[] = [repository],
    databaseId = 123,
    hasNextPage = false,
  ) => ({
    data: {
      viewer: {
        databaseId,
        login: "learner",
        repositories: {
          nodes,
          pageInfo: { hasNextPage, endCursor: hasNextPage ? "next" : null },
        },
      },
    },
  });
  const graphql = vi.fn(async () => json(graphqlBody()));
  const directory = vi.fn(async () => json([]));
  const githubFetch = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/graphql") return graphql();
    if (path.endsWith("/contents")) return directory();
    throw new Error("unexpected_fixture_path");
  });
  const analysis = {
    technologies: { t0: null },
    areas: [] as {
      areaId: string;
      label: string;
      confidence: string;
      explanation: string;
      supports: string[];
    }[],
    overall: {
      level: "basic",
      confidence: "low",
      summary: "Ước tính từ repo công khai. Không thay bài kiểm tra.",
      supports: ["e0"],
    },
  };
  const count = vi.fn(async () =>
    json({ object: "response.input_tokens", input_tokens: 1000 }),
  );
  const generate = vi.fn(async () =>
    json({
      model: "gpt-6-luna",
      status: "completed",
      service_tier: "default",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(analysis) }],
        },
      ],
      usage: { input_tokens: 1000, output_tokens: 100 },
    }),
  );
  const aiFetch = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/input_tokens") ? count() : generate(),
  );
  const getLinkedAccount = vi.fn(async () => ({
    accountRowId: "local-row-456",
    githubUserId: "123",
  }));
  const getAccessToken = vi.fn(async () => "fixture-user-token");
  const reserveGeneration = vi.fn(async () => true);
  const options: GithubProfileServiceOptions = {
    abortSignal: controller.signal,
    getLinkedAccount,
    getAccessToken,
    publicAccess: {
      mode: "oauth_app",
      clientId: "fixture-app",
      clientSecret: "fixture-app-secret",
    },
    ai: { apiKey: "fixture-ai-key", reserveGeneration, fetch: aiFetch },
    githubFetch,
  };
  return {
    options,
    controller,
    graphql,
    graphqlBody,
    repository,
    directory,
    githubFetch,
    aiFetch,
    count,
    generate,
    analysis,
    getLinkedAccount,
    getAccessToken,
    reserveGeneration,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("live_transport_forbidden");
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GitHub direct request orchestration", () => {
  it.each([
    undefined,
    null,
    {},
    { consentVersion: "old" },
    { consentVersion: true },
  ])(
    "rejects missing/invalid consent before account or token access: %j",
    async (input) => {
      const h = harness();
      const result = await runGithubProfileRequest(input, h.options);
      expect(result).toMatchObject({ ok: false, code: "consent_required" });
      expect(h.getLinkedAccount).not.toHaveBeenCalled();
      expect(h.getAccessToken).not.toHaveBeenCalled();
      expect(h.githubFetch).not.toHaveBeenCalled();
      expect(h.aiFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://attacker.invalid/learner",
    "javascript:alert(1)",
    "https://github.com/learner/project",
    "https://github.com/learner?q=1",
    "https://github.com/learner#x",
    "https://user:secret@github.com/learner",
    "http://github.com/learner",
    "bad name",
    "-bad",
    "bad-",
    "https://github.com/other/../learner",
    "https://github.com:443/learner",
    "x".repeat(301),
  ])(
    "rejects malformed intent before adapters: %s",
    async (githubProfileInput) => {
      const h = harness();
      expect(
        await runGithubProfileRequest(
          { ...body, githubProfileInput },
          h.options,
        ),
      ).toMatchObject({ ok: false, code: "invalid_input" });
      expect(h.getLinkedAccount).not.toHaveBeenCalled();
      expect(h.getAccessToken).not.toHaveBeenCalled();
    },
  );

  it("rejects client ownership fields instead of forwarding them", async () => {
    const h = harness();
    expect(
      await runGithubProfileRequest(
        { ...body, githubUserId: "123" },
        h.options,
      ),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    expect(h.getLinkedAccount).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "",
    "  learner  ",
    "LEARNER",
    "https://github.com/LeArNeR/",
  ])(
    "uses session-owned numeric identity and local row ID distinctly; accepts intent %s",
    async (intent) => {
      const h = harness();
      const result = await runGithubProfileRequest(
        {
          consentVersion: body.consentVersion,
          ...(intent === undefined ? {} : { githubProfileInput: intent }),
        },
        h.options,
      );
      expect(result).toMatchObject({
        ok: true,
        outcome: "analysed",
        profile: {
          identity: { id: "123", login: "learner" },
          overall: { level: "basic" },
        },
      });
      expect(h.getAccessToken).toHaveBeenCalledExactlyOnceWith(
        "local-row-456",
        expect.any(AbortSignal),
      );
      expect(h.count).toHaveBeenCalledTimes(1);
      expect(h.generate).toHaveBeenCalledTimes(1);
      expect(h.reserveGeneration).toHaveBeenCalledTimes(1);
      expect(h.reserveGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 1000,
          model: "openai/gpt-6-luna",
        }),
      );
      for (const [url, init] of h.githubFetch.mock.calls) {
        expect(init!.headers).toMatchObject({
          Authorization:
            new URL(String(url)).pathname === "/graphql"
              ? "Bearer fixture-user-token"
              : `Basic ${Buffer.from("fixture-app:fixture-app-secret").toString("base64")}`,
        });
        expect(init!.redirect).toBe("error");
      }
      const serialized = JSON.stringify(result);
      for (const secret of [
        "fixture-user-token",
        "fixture-app-secret",
        "fixture-ai-key",
        "local-row-456",
      ])
        expect(serialized).not.toContain(secret);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("copies linked identifiers before awaiting the token adapter", async () => {
    const h = harness();
    const linked = { accountRowId: "local-row-456", githubUserId: "123" };
    h.getLinkedAccount.mockResolvedValue(linked);
    h.getAccessToken.mockImplementation(async () => {
      linked.githubUserId = "999";
      return "fixture-user-token";
    });
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: true,
    });
  });

  it("rejects login intent mismatch without AI or reservation", async () => {
    const h = harness();
    expect(
      await runGithubProfileRequest(
        { ...body, githubProfileInput: "someone-else" },
        h.options,
      ),
    ).toMatchObject({
      ok: false,
      code: "intent_mismatch",
      snapshot: { identity: { id: "123" } },
    });
    expect(h.aiFetch).not.toHaveBeenCalled();
    expect(h.reserveGeneration).not.toHaveBeenCalled();
  });

  it("rejects immutable identity mismatch before any public repo reads", async () => {
    const h = harness();
    h.graphql.mockResolvedValue(json(h.graphqlBody([], 999)));
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "identity_mismatch",
    });
    expect(h.githubFetch).toHaveBeenCalledTimes(1);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("returns an unlinked failure without fetching a token", async () => {
    const h = harness();
    h.options.getLinkedAccount = async () => null;
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "github_not_linked",
    });
    expect(h.getAccessToken).not.toHaveBeenCalled();
  });

  it.each(["account", "token"])(
    "sanitizes %s adapter failures",
    async (phase) => {
      const h = harness();
      (phase === "account"
        ? h.getLinkedAccount
        : h.getAccessToken
      ).mockRejectedValue(
        new Error("fixture-user-token private adapter detail"),
      );
      const result = await runGithubProfileRequest(body, h.options);
      expect(result).toMatchObject({
        ok: false,
        code:
          phase === "account" ? "account_unavailable" : "connection_expired",
      });
      expect(JSON.stringify(result)).not.toContain("fixture-user-token");
      expect(h.githubFetch).not.toHaveBeenCalled();
      expect(h.aiFetch).not.toHaveBeenCalled();
    },
  );

  it("does not dispatch with an absent token or invalid linked provider ID", async () => {
    const h = harness();
    h.options.getAccessToken = async () => null;
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "connection_expired",
    });
    h.getLinkedAccount.mockResolvedValue({
      accountRowId: "local-row-456",
      githubUserId: "local-row-456",
    });
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "account_unavailable",
    });
    expect(h.githubFetch).not.toHaveBeenCalled();
  });

  it("returns factual empty results without count, generation or reservation", async () => {
    const h = harness();
    h.graphql.mockResolvedValue(json(h.graphqlBody([])));
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: true,
      outcome: "no_observations",
      profile: {
        observationAvailability: "none_observed",
        technologies: [],
        overall: null,
      },
      generation: null,
    });
    expect(h.aiFetch).not.toHaveBeenCalled();
    expect(h.reserveGeneration).not.toHaveBeenCalled();
  });

  it("preserves partial collection issues and evidence through one synthesis", async () => {
    const h = harness();
    h.directory.mockResolvedValue(json({}, 500));
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: true,
      outcome: "analysed",
      profile: { collectionStatus: "partial" },
      snapshot: {
        status: "partial",
        issues: [{ operation: "directory", code: "http_error" }],
      },
    });
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it("does not invent AI for partial collection with no observations", async () => {
    const h = harness();
    h.graphql.mockResolvedValue(
      json(h.graphqlBody([{ ...h.repository, languages: null }])),
    );
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: true,
      outcome: "no_observations",
      profile: { collectionStatus: "partial", overall: null },
    });
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it.each([401, 500, 302])(
    "handles failed identity collection HTTP %i without AI",
    async (status) => {
      const h = harness();
      h.graphql.mockResolvedValue(json({}, status));
      expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
        ok: false,
        code: status === 401 ? "connection_expired" : "collection_failed",
        snapshot: { status: "failed" },
      });
      expect(h.aiFetch).not.toHaveBeenCalled();
    },
  );

  it("returns typed rate limits and retained evidence without synthesizing or retrying", async () => {
    const h = harness();
    h.directory.mockResolvedValue(json({}, 429, { "retry-after": "120" }));
    const result = await runGithubProfileRequest(body, h.options);
    expect(result).toMatchObject({
      ok: false,
      code: "rate_limited",
      retryAt: "2026-10-20T00:02:00.000Z",
      snapshot: { status: "partial", evidence: [{ kind: "languages" }] },
    });
    expect(h.directory).toHaveBeenCalledTimes(1);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("returns failed app authentication without anonymous or bearer fallback", async () => {
    const h = harness();
    h.directory.mockResolvedValue(json({}, 401));
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "app_auth_failed",
    });
    expect(h.directory).toHaveBeenCalledTimes(1);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("bounds stalled per-read transport and does not manufacture AI", async () => {
    const h = harness();
    h.graphql.mockImplementation(() => new Promise(() => {}));
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "collection_timeout",
      snapshot: { status: "failed" },
    });
    expect(h.githubFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("enforces the overall collection phase deadline across successful slow reads", async () => {
    const h = harness();
    h.graphql
      .mockResolvedValueOnce(json(h.graphqlBody([h.repository], 123, true)))
      .mockResolvedValueOnce(json(h.graphqlBody([])));
    const original = h.options.githubFetch!;
    h.options.githubFetch = async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 9000));
      return original(url, init);
    };
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "collection_timeout",
    });
    await vi.advanceTimersByTimeAsync(50_000);
    expect(h.githubFetch.mock.calls.length).toBeLessThanOrEqual(3);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("bounds token access at 55 seconds and rejects a late token without network", async () => {
    const h = harness();
    let finish!: (value: string) => void;
    h.getAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(55_000);
    expect(await pending).toMatchObject({ ok: false, code: "request_timeout" });
    finish("fixture-user-token");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.githubFetch).not.toHaveBeenCalled();
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("starts no adapters if the caller already aborted", async () => {
    const h = harness();
    h.controller.abort();
    expect(await runGithubProfileRequest(body, h.options)).toMatchObject({
      ok: false,
      code: "aborted",
    });
    expect(h.getLinkedAccount).not.toHaveBeenCalled();
  });

  it("keeps AI inside the remaining overall budget after slow account access", async () => {
    const h = harness();
    h.getLinkedAccount.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 35_000));
      return { accountRowId: "local-row-456", githubUserId: "123" };
    });
    h.generate.mockImplementation(() => new Promise(() => {}));
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(55_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "request_timeout",
      reservationState: "unknown",
    });
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.aiFetch.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
  });

  it("does not use a late account lookup after caller cancellation", async () => {
    const h = harness();
    let finish!: (value: {
      accountRowId: string;
      githubUserId: string;
    }) => void;
    h.getLinkedAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(1);
    h.controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: "aborted" });
    finish({ accountRowId: "local-row-456", githubUserId: "123" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getAccessToken).not.toHaveBeenCalled();
    expect(h.githubFetch).not.toHaveBeenCalled();
  });

  it("bounds a stalled collection body and never calls AI", async () => {
    const h = harness();
    h.graphql.mockResolvedValue(
      new Response(new ReadableStream({ start() {} })),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "collection_timeout",
    });
    expect(h.githubFetch).toHaveBeenCalledTimes(1);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("aborts an in-flight collector, blocks subsequent transport and discards late replies", async () => {
    const h = harness();
    let finish!: (value: Response) => void;
    h.graphql.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(1);
    h.controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: "aborted" });
    expect(h.githubFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    finish(json(h.graphqlBody()));
    await vi.advanceTimersByTimeAsync(50_000);
    expect(h.githubFetch).toHaveBeenCalledTimes(1);
    expect(h.aiFetch).not.toHaveBeenCalled();
  });

  it("does not dispatch generation after stalled reservation times out", async () => {
    const h = harness();
    let finish!: (value: boolean) => void;
    h.reserveGeneration.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "ai_timeout",
      reservationState: "unknown",
      snapshot: { evidence: [{ kind: "languages" }] },
      diagnostics: {
        phase: "ai",
        category: "aborted",
        httpStatus: null,
        elapsedMs: expect.any(Number),
      },
    });
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.reserveGeneration).toHaveBeenCalledTimes(1);
  });

  it("bounds non-cooperative model transport and keeps an ambiguous attempt consumed/unknown", async () => {
    const h = harness();
    let finish!: (value: Response) => void;
    h.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runGithubProfileRequest(body, h.options);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toMatchObject({
      ok: false,
      code: "ai_timeout",
      reservationState: "unknown",
    });
    finish(json({ private: "fixture-ai-key" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.reserveGeneration).toHaveBeenCalledTimes(1);
  });

  it.each(["count", "generation", "reservation", "invalid_output"])(
    "sanitizes %s failure and never retries",
    async (phase) => {
      const h = harness();
      if (phase === "count")
        h.count.mockRejectedValue(new Error("fixture-ai-key private"));
      if (phase === "generation")
        h.generate.mockRejectedValue(new Error("fixture-ai-key private"));
      if (phase === "reservation") h.reserveGeneration.mockResolvedValue(false);
      if (phase === "invalid_output") {
        // Duplicate semantic area identities still reach mandatory provenance validation.
        const area = {
          areaId: "frontend",
          label: "Giao diện",
          confidence: "low",
          explanation: "Ước tính.",
          supports: ["e0"],
        };
        h.analysis.areas = [area, area];
      }
      const result = await runGithubProfileRequest(body, h.options);
      expect(result).toMatchObject({
        ok: false,
        code: "ai_failed",
        reservationState:
          phase === "count"
            ? "not_attempted"
            : phase === "reservation"
              ? "denied"
              : "consumed",
      });
      expect(JSON.stringify(result)).not.toContain("fixture-ai-key");
      expect(result).toMatchObject({
        diagnostics: {
          phase:
            phase === "count"
              ? "preflight"
              : phase === "invalid_output"
                ? "provenance"
                : phase,
          category:
            phase === "reservation"
              ? "reservation_denied"
              : phase === "invalid_output"
                ? "provenance"
                : "network",
          httpStatus: phase === "invalid_output" ? 200 : null,
          elapsedMs: expect.any(Number),
        },
      });
      expect(h.count).toHaveBeenCalledTimes(1);
      expect(h.generate).toHaveBeenCalledTimes(
        phase === "count" || phase === "reservation" ? 0 : 1,
      );
    },
  );

  it("exports the selected safety budgets without raising accepted ceilings", () => {
    expect(GITHUB_PROFILE_SERVICE_LIMITS).toEqual({
      totalMs: 55_000,
      collectionMs: 25_000,
      aiMs: 25_000,
    });
  });
});
