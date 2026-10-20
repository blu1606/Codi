import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectGithubProfile } from "./github-profile-collector";
import { GITHUB_PROFILE_LIMITS } from "./github-profile-contract";
import { extractGithubTechnologies } from "./github-profile-extraction";

const TOKEN = "server-transport-test-credential";
const input = {
  githubUserId: "123",
  accessToken: TOKEN,
  publicAccess: { mode: "anonymous" as const },
};
const COMMIT = "a".repeat(40);
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status, headers });
const repo = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  name: "project",
  owner: { id: 123, login: "learner" },
  private: false,
  visibility: "public",
  fork: false,
  size: 10,
  pushed_at: "2026-10-20T00:00:00Z",
  default_branch: "main",
  ...overrides,
});
const manifest = JSON.stringify({
  dependencies: { react: "^19", next: "^16" },
  scripts: { install: "DO NOT EXECUTE" },
});
const blob = (text = manifest) => {
  const data = Buffer.from(text);
  return {
    type: "file",
    size: data.length,
    sha: createHash("sha1")
      .update(`blob ${data.length}\0`)
      .update(data)
      .digest("hex"),
    encoding: "base64",
    content: data.toString("base64"),
  };
};
type Handler = (
  url: URL,
  init: RequestInit,
) => Response | Promise<Response> | undefined;
function transport(handler?: Handler) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const parsed = new URL(String(url));
    const custom = await handler?.(parsed, init!);
    if (custom) return custom;
    if (parsed.pathname === "/user")
      return json({
        id: 123,
        login: "learner",
        email: "not-retained@example.test",
      });
    if (parsed.pathname === "/users/learner/repos") return json([repo()]);
    if (parsed.pathname.endsWith("/git/ref/heads/main"))
      return json({ object: { type: "commit", sha: COMMIT } });
    if (parsed.pathname.endsWith("/languages"))
      return json({ TypeScript: 100, JavaScript: 50 });
    if (parsed.pathname.endsWith("/contents"))
      return json([
        {
          name: "package.json",
          ...blob(),
          download_url: "https://attacker.invalid/secret",
          html_url: "https://attacker.invalid/",
        },
      ]);
    if (parsed.pathname.endsWith("/contents/package.json")) return json(blob());
    throw new Error(`Unexpected test request: ${parsed.pathname}`);
  });
}
afterEach(() => vi.useRealTimers());

describe("GitHub public profile collector", () => {
  const appInput = {
    ...input,
    publicAccess: {
      mode: "oauth_app" as const,
      clientId: "test-app-id",
      clientSecret: "test-app-client-secret",
    },
  };

  it("routes OAuth-app Basic only to public GETs and user Bearer only to identity", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(appInput, { fetch });
    const encoded = Buffer.from("test-app-id:test-app-client-secret").toString(
      "base64",
    );
    expect(result.status).toBe("complete");
    expect(result.coverage.publicAccess).toBe("oauth_app");
    for (const [url, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        new URL(String(url)).pathname === "/user"
          ? `Bearer ${TOKEN}`
          : `Basic ${encoded}`,
      );
      expect(init?.redirect).toBe("error");
      expect(String(url)).not.toContain(TOKEN);
      expect(String(url)).not.toContain("test-app-client-secret");
      expect(String(url)).not.toContain(encoded);
    }
    expect(JSON.stringify(result)).not.toContain("test-app-client-secret");
    expect(JSON.stringify(result)).not.toContain(encoded);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it.each([401, 403])(
    "stops on failed public app authentication (%i) without any fallback",
    async (status) => {
      const fetch = transport((url) =>
        url.pathname.endsWith("/repos")
          ? json({ message: "Bad credentials test-app-client-secret" }, status)
          : undefined,
      );
      const result = await collectGithubProfile(appInput, { fetch });
      expect(result.issues[0]).toMatchObject({
        operation: "listing",
        code: "app_auth_failed",
        httpStatus: status,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.evidence).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("test-app-client-secret");
      expect(
        new Headers(fetch.mock.calls[1]?.[1]?.headers).get("authorization"),
      ).toMatch(/^Basic /);
    },
  );

  it.each([
    { mode: "oauth_app", clientId: "test-app-id", clientSecret: "" },
    {
      mode: "oauth_app",
      clientId: "bad:id",
      clientSecret: "test-app-client-secret",
    },
    {
      mode: "oauth_app",
      clientId: "test-app-id",
      clientSecret: "bad\r\nheader",
    },
    { mode: "oauth_app", clientId: "test-app-id" },
    { mode: "anonymous", clientSecret: "supplied-but-invalid-for-mode" },
    undefined,
  ])(
    "rejects malformed or implicit public authentication before any read",
    async (publicAccess) => {
      const fetch = transport();
      const result = await collectGithubProfile(
        { ...input, publicAccess } as typeof appInput,
        { fetch },
      );
      expect(result.issues).toEqual([
        { operation: "identity", code: "invalid_input" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "test-app-client-secret",
    Buffer.from("test-app-id:test-app-client-secret").toString("base64"),
  ])(
    "does not return reflected app secrets from a successful response",
    async (secret) => {
      const fetch = transport((url) =>
        url.pathname.endsWith("/languages") ? json({ [secret]: 1 }) : undefined,
      );
      const result = await collectGithubProfile(appInput, { fetch });
      expect(result.issues[0]).toMatchObject({
        operation: "languages",
        code: "invalid_response",
      });
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it("rejects public redirects in app mode and never follows Location", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/repos")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://attacker.invalid" },
          })
        : undefined,
    );
    const result = await collectGithubProfile(appInput, { fetch });
    expect(result.issues[0]).toMatchObject({
      operation: "listing",
      code: "redirect_rejected",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.every(
        ([url]) => new URL(String(url)).origin === "https://api.github.com",
      ),
    ).toBe(true);
  });

  it("rejects JSON-escaped credential reflection before creating evidence", async () => {
    const secret = "test-app-client-secret";
    const escaped = [...secret]
      .map(
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
      )
      .join("");
    const fetch = transport((url) =>
      url.pathname.endsWith("/languages")
        ? new Response(`{"${escaped}":1}`)
        : undefined,
    );
    const result = await collectGithubProfile(appInput, { fetch });
    expect(result.issues[0]).toMatchObject({
      operation: "languages",
      code: "invalid_response",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("sanitizes app-auth transport exceptions without retrying under another identity", async () => {
    const fetch = transport((url) => {
      if (url.pathname.endsWith("/repos"))
        throw new Error(
          "Basic " +
            Buffer.from("test-app-id:test-app-client-secret").toString(
              "base64",
            ),
        );
    });
    const result = await collectGithubProfile(appInput, { fetch });
    expect(result.issues[0]?.code).toBe("network_error");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("test-app-client-secret");
    expect(JSON.stringify(result)).not.toContain(
      Buffer.from("test-app-id:test-app-client-secret").toString("base64"),
    );
  });

  it("uses the bearer only for identity and returns bounded immutable evidence", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(input, { fetch });
    expect(result.status).toBe("complete");
    expect(result.identity).toEqual({ id: "123", login: "learner" });
    expect(result.coverage.requests).toBe(6);
    expect(result.coverage.listingComplete).toBe(true);
    expect(
      result.repositories[0]?.files.find((file) => file.path === "pom.xml")
        ?.state,
    ).toBe("missing");
    for (const [url, init] of fetch.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://api.github.com");
      expect(init).toMatchObject({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      });
      expect(new Headers(init?.headers).get("authorization")).toBe(
        String(url).endsWith("/user") ? `Bearer ${TOKEN}` : null,
      );
      if (String(url).includes("/contents"))
        expect(new URL(String(url)).searchParams.get("ref")).toBe(COMMIT);
    }
    const file = result.evidence.find((evidence) => evidence.kind === "file");
    expect(file).toMatchObject({
      kind: "file",
      commitSha: COMMIT,
      blobSha: blob().sha,
      text: manifest,
      sourceUrl: `https://github.com/learner/project/blob/${COMMIT}/package.json`,
    });
    const languages = result.evidence.find(
      (evidence) => evidence.kind === "languages",
    );
    expect(languages).not.toHaveProperty("commitSha");
    expect(languages).toMatchObject({
      sourceUrl: "https://api.github.com/repos/learner/project/languages",
      collectedAt: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain("not-retained@example.test");
    expect(JSON.stringify(result)).not.toContain("attacker.invalid");
    expect(
      extractGithubTechnologies(result).map((item) => item.technology),
    ).toContain("React");
    expect(extractGithubTechnologies(result, [10])).toEqual([]);
  });

  it("blocks all repo reads on numeric identity mismatch", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(
      { ...input, githubUserId: "124" },
      { fetch },
    );
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual([
      { operation: "identity", code: "identity_mismatch" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.evidence).toEqual([]);
  });

  it.each([
    "https://attacker.invalid/",
    "../evil",
    "learner?scope=repo",
    "learner#fragment",
  ])("rejects untrusted identity login %s", async (login) => {
    const fetch = transport((url) =>
      url.pathname === "/user" ? json({ id: 123, login }) : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues[0]?.code).toBe("invalid_response");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 307, 308])(
    "does not follow an identity redirect (%i)",
    async (status) => {
      const fetch = transport(
        () =>
          new Response(null, {
            status,
            headers: { location: "https://attacker.invalid/" },
          }),
      );
      const result = await collectGithubProfile(input, { fetch });
      expect(result.issues[0]?.code).toBe("redirect_rejected");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects public content redirects without following them", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents/package.json")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://attacker.invalid" },
          })
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues).toContainEqual({
      operation: "file",
      repositoryId: 10,
      path: "package.json",
      code: "redirect_rejected",
      httpStatus: 302,
    });
    expect(result.evidence.filter((item) => item.kind === "file")).toEqual([]);
    expect(
      fetch.mock.calls.every(
        ([url]) => new URL(String(url)).hostname === "api.github.com",
      ),
    ).toBe(true);
  });

  it.each([
    repo({ private: true }),
    repo({ visibility: "private" }),
    repo({ owner: { id: 321, login: "other" } }),
    repo({ name: ".." }),
  ])("rejects nonpublic/foreign/unsafe listing entries", async (entry) => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/repos") ? json([entry]) : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues[0]).toMatchObject({
      operation: "listing",
      code: "invalid_response",
    });
    expect(result.repositories).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retains fork/empty/capped metadata and selects deterministically", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/repos")
        ? json([
            repo({ id: 13, fork: true }),
            repo({ id: 12, size: 0 }),
            repo({ id: 11 }),
            repo({ id: 10 }),
          ])
        : undefined,
    );
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { selectedRepos: 1 },
    });
    expect(
      result.repositories.map((item) => [item.id, item.disposition]),
    ).toEqual([
      [10, "selected"],
      [11, "capped"],
      [12, "empty"],
      [13, "fork"],
    ]);
    expect(result.status).toBe("partial");
    expect(result.coverage.selected).toBe(1);
    expect(result.evidence.every((item) => item.repositoryId === 10)).toBe(
      true,
    );
  });

  it("reports a genuinely empty public account without inventing evidence", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport((url) =>
        url.pathname.endsWith("/repos") ? json([]) : undefined,
      ),
    });
    expect(result.status).toBe("complete");
    expect(result.coverage.listingComplete).toBe(true);
    expect(result.evidence).toEqual([]);
    expect(extractGithubTechnologies(result)).toEqual([]);
  });

  it("caps listing at 300, ignores arbitrary Link URLs, and never treats capped coverage as complete", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/repos")
        ? json(
            Array.from({ length: 100 }, (_, i) =>
              repo({ id: Number(url.searchParams.get("page")) * 1000 + i }),
            ),
            200,
            { link: '<https://attacker.invalid/>; rel="next"' },
          )
        : undefined,
    );
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { selectedRepos: 1 },
    });
    expect(result.repositories).toHaveLength(300);
    expect(result.coverage.listingComplete).toBe(false);
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).includes("/users/learner/repos"),
      ),
    ).toHaveLength(3);
    expect(
      fetch.mock.calls.every(
        ([url]) => new URL(String(url)).hostname === "api.github.com",
      ),
    ).toBe(true);
  });

  it("does not report absent files as missing at the Contents API directory ceiling", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents")
        ? json(
            Array.from({ length: 1000 }, (_, i) => ({
              name: `other-${i}.txt`,
              type: "file",
              sha: "b".repeat(40),
              size: 1,
            })),
          )
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues[0]).toMatchObject({
      operation: "directory",
      code: "directory_limit",
    });
    expect(
      result.repositories[0]?.files.every(
        (file) => file.state === "unavailable",
      ),
    ).toBe(true);
    expect(result.evidence.filter((item) => item.kind === "file")).toEqual([]);
  });

  it.each([
    [401, {}, "connection_expired"],
    [403, {}, "http_error"],
    [404, {}, "not_found"],
    [429, { "retry-after": "120" }, "rate_limited"],
    [
      403,
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" },
      "rate_limited",
    ],
  ] as const)(
    "distinguishes identity status %i",
    async (status, headers, code) => {
      const fetch = transport(() => json({ message: TOKEN }, status, headers));
      const result = await collectGithubProfile(input, { fetch });
      expect(result.issues[0]).toMatchObject({ code, httpStatus: status });
      if (code === "rate_limited")
        expect(result.issues[0]?.retryAt).toEqual(expect.any(String));
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("stops on public rate limit and retains earlier observations", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents")
        ? json({}, 429, { "retry-after": "60" })
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.status).toBe("partial");
    expect(result.evidence.map((item) => item.kind)).toEqual(["languages"]);
    expect(result.issues[0]).toMatchObject({
      code: "rate_limited",
      operation: "directory",
    });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("recognizes a secondary rate limit without reset/retry headers", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents")
        ? json(
            {
              message: "You have exceeded a secondary rate limit. Please wait.",
            },
            403,
          )
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues[0]).toMatchObject({
      code: "rate_limited",
      operation: "directory",
      retryAt: expect.any(String),
    });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it.each([404, 500])(
    "retains missing file versus failed file (%i)",
    async (status) => {
      const result = await collectGithubProfile(input, {
        fetch: transport((url) =>
          url.pathname.endsWith("/contents/package.json")
            ? json({}, status)
            : undefined,
        ),
      });
      expect(
        result.repositories[0]?.files.find(
          (file) => file.path === "package.json",
        )?.state,
      ).toBe(status === 404 ? "missing" : "unavailable");
      expect(result.issues[0]?.code).toBe(
        status === 404 ? "not_found" : "http_error",
      );
    },
  );

  it("rejects tampered immutable blob provenance", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport((url) =>
        url.pathname.endsWith("/contents/package.json")
          ? json({
              ...blob(),
              content: Buffer.from("tampered").toString("base64"),
            })
          : undefined,
      ),
    });
    expect(result.issues[0]?.code).toBe("invalid_response");
    expect(result.evidence.filter((item) => item.kind === "file")).toEqual([]);
  });

  it("does not fetch symlinks, submodules, oversized files or external download URLs", async () => {
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents")
        ? json([
            { name: "package.json", ...blob(), type: "symlink" },
            { name: "README.md", ...blob(), type: "submodule" },
            {
              name: "go.mod",
              ...blob(),
              size: 65537,
              download_url: "https://attacker.invalid",
            },
          ])
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.evidence.filter((item) => item.kind === "file")).toEqual([]);
    expect(result.issues.map((item) => item.code)).toEqual([
      "invalid_response",
      "file_limit",
      "invalid_response",
    ]);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("bounds all requests including identity", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { requests: 2 },
    });
    expect(result.issues[0]?.code).toBe("request_limit");
    expect(result.coverage.requests).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects attempts to raise accepted ceilings before any request", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { requests: 61 },
    });
    expect(result.issues[0]?.code).toBe("invalid_input");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not exceed the full 60-request ceiling or two concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const base = transport((url) =>
      url.pathname.endsWith("/repos")
        ? json(
            Array.from({ length: 15 }, (_, i) =>
              repo({ id: i + 1, name: `project-${i}` }),
            ),
          )
        : undefined,
    );
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      active++;
      peak = Math.max(peak, active);
      try {
        return await base(url, init);
      } finally {
        active--;
      }
    });
    const result = await collectGithubProfile(input, { fetch });
    expect(fetch).toHaveBeenCalledTimes(60);
    expect(result.coverage.requests).toBe(60);
    expect(result.issues.at(-1)?.code).toBe("request_limit");
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("enforces declared and streamed response size independently", async () => {
    const declaredFetch = transport(
      () => new Response("{}", { headers: { "content-length": "1048577" } }),
    );
    expect(
      (await collectGithubProfile(input, { fetch: declaredFetch })).issues[0]
        ?.code,
    ).toBe("response_limit");
    const streamedFetch = transport(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1025));
              controller.close();
            },
          }),
        ),
    );
    const result = await collectGithubProfile(input, {
      fetch: streamedFetch,
      limits: { responseBytes: 1024 },
    });
    expect(result.issues[0]?.code).toBe("response_limit");
    expect(result.coverage.responseBytes).toBe(1024);
  });

  it("enforces aggregate response budget independently of the per-response cap", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport(),
      limits: { aggregateBytes: 500 },
    });
    expect(result.issues.some((item) => item.code === "aggregate_limit")).toBe(
      true,
    );
    expect(result.coverage.responseBytes).toBeLessThanOrEqual(500);
  });

  it("enforces decoded file byte bounds", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport(),
      limits: { fileBytes: 10 },
    });
    expect(result.issues[0]?.code).toBe("file_limit");
    expect(result.evidence.filter((item) => item.kind === "file")).toEqual([]);
  });

  it.each([
    [10, 100, "request_timeout"],
    [100, 10, "total_timeout"],
  ] as const)(
    "bounds stalled request and total deadlines",
    async (requestMs, totalMs, code) => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(
        () => new Promise(() => undefined),
      );
      const pending = collectGithubProfile(input, {
        fetch,
        limits: { requestMs, totalMs },
      });
      await vi.advanceTimersByTimeAsync(Math.min(requestMs, totalMs));
      const result = await pending;
      expect(result.issues[0]?.code).toBe(code);
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    },
  );

  it("deadline includes a stalled response body", async () => {
    vi.useFakeTimers();
    const fetch = transport(
      () =>
        new Response(
          new ReadableStream({
            start() {
              /* deliberately no body chunks */
            },
          }),
        ),
    );
    const pending = collectGithubProfile(input, {
      fetch,
      limits: { requestMs: 10 },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).issues[0]?.code).toBe("request_timeout");
  });

  it("total deadline spans multiple individually successful requests", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
    });
    const base = transport();
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 8));
      return base(url, init);
    });
    const pending = collectGithubProfile(input, {
      fetch,
      limits: { requestMs: 20, totalMs: 25 },
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;
    expect(result.issues.at(-1)?.code).toBe("total_timeout");
    expect(result.coverage.elapsedMs).toBe(25);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(8);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("sanitizes transport exceptions and successful responses that echo credentials", async () => {
    const thrown = await collectGithubProfile(input, {
      fetch: vi.fn(async () => {
        throw new Error(`Bearer ${TOKEN}`);
      }),
    });
    expect(thrown.issues[0]?.code).toBe("network_error");
    const echoed = await collectGithubProfile(input, {
      fetch: transport(() =>
        json({ id: 123, login: "learner", unexpected: TOKEN }),
      ),
    });
    expect(echoed.issues[0]?.code).toBe("invalid_response");
    expect(JSON.stringify([thrown, echoed])).not.toContain(TOKEN);
  });

  it("has the accepted hard ceilings", () => {
    expect(GITHUB_PROFILE_LIMITS).toEqual({
      listedRepos: 300,
      selectedRepos: 15,
      requests: 60,
      requestMs: 10000,
      totalMs: 90000,
      fileBytes: 65536,
      responseBytes: 1048576,
      aggregateBytes: 4194304,
    });
  });
});
