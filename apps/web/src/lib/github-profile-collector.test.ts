import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectGithubProfile } from "./github-profile-collector";
import { GITHUB_PROFILE_LIMITS } from "./github-profile-contract";
import { extractGithubTechnologies } from "./github-profile-extraction";
import { projectGithubProfile } from "./github-profile-analysis-contract";

const TOKEN = "server-transport-test-credential";
const input = {
  githubUserId: "123",
  accessToken: TOKEN,
  publicAccess: { mode: "anonymous" as const },
};
const appInput = {
  ...input,
  publicAccess: {
    mode: "oauth_app" as const,
    clientId: "test-app-id",
    clientSecret: "test-app-client-secret",
  },
};
const BASIC = Buffer.from("test-app-id:test-app-client-secret").toString(
  "base64",
);
const COMMIT = "a".repeat(40);
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status, headers });
const languages = (overrides: Record<string, unknown> = {}) => ({
  edges: [
    { size: 100, node: { name: "TypeScript" } },
    { size: 50, node: { name: "JavaScript" } },
  ],
  pageInfo: { hasNextPage: false },
  ...overrides,
});
const repo = (overrides: Record<string, unknown> = {}) => ({
  databaseId: 10,
  name: "project",
  owner: { databaseId: 123, login: "learner" },
  isPrivate: false,
  visibility: "PUBLIC",
  isFork: false,
  isEmpty: false,
  diskUsage: 10,
  pushedAt: "2026-10-20T00:00:00Z",
  defaultBranchRef: {
    name: "main",
    target: { __typename: "Commit", oid: COMMIT },
  },
  languages: languages(),
  ...overrides,
});
const page = (
  nodes: unknown[] = [repo()],
  hasNextPage = false,
  endCursor: string | null = null,
  viewer = { databaseId: 123, login: "learner" },
) => ({
  data: {
    viewer: {
      ...viewer,
      repositories: { nodes, pageInfo: { hasNextPage, endCursor } },
    },
  },
});
const graph = (nodes: unknown[]) => json(page(nodes));
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
      .update("blob " + data.length + "\0")
      .update(data)
      .digest("hex"),
    encoding: "base64",
    content: data.toString("base64"),
  };
};
type Handler = (
  url: URL,
  init: RequestInit,
) => Response | Promise<Response | undefined> | undefined;
function transport(handler?: Handler) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const parsed = new URL(String(url));
    const custom = await handler?.(parsed, init!);
    if (custom) return custom;
    if (parsed.pathname === "/graphql") return graph([repo()]);
    if (parsed.pathname.endsWith("/contents"))
      return json([
        {
          name: "package.json",
          ...blob(),
          download_url: "https://attacker.invalid/secret",
        },
      ]);
    if (parsed.pathname.endsWith("/contents/package.json")) return json(blob());
    throw new Error("Unexpected fixture path: " + parsed.pathname);
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GitHub public GraphQL collector", () => {
  it.each([input, appInput])(
    "batches public metadata with bearer POST and keeps REST files public and commit-pinned",
    async (credentials) => {
      const fetch = transport();
      const result = await collectGithubProfile(credentials, { fetch });
      expect(result.status).toBe("complete");
      expect(result.coverage.requests).toBe(3);
      expect(result.identity).toEqual({ id: "123", login: "learner" });
      expect(result.coverage.listingComplete).toBe(true);
      for (const [url, init] of fetch.mock.calls) {
        const parsed = new URL(String(url));
        expect(parsed.origin).toBe("https://api.github.com");
        const graphql = parsed.pathname === "/graphql";
        expect(init).toMatchObject({
          method: graphql ? "POST" : "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
        });
        expect(new Headers(init?.headers).get("authorization")).toBe(
          graphql
            ? "Bearer " + TOKEN
            : credentials.publicAccess.mode === "oauth_app"
              ? "Basic " + BASIC
              : null,
        );
        if (!graphql) {
          expect(parsed.pathname).toContain("/contents");
          expect(parsed.searchParams.get("ref")).toBe(COMMIT);
        }
      }
      const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({
        operationName: "CodiPublicProfile",
        variables: { first: 100, after: null },
      });
      expect(body.query).toMatch(/viewer\s*\{/);
      expect(body.query).toContain("privacy: PUBLIC");
      expect(body.query).toContain("ownerAffiliations: OWNER");
      expect(body.query).toContain("field: PUSHED_AT, direction: DESC");
      expect(body.query).not.toMatch(
        /contributionsCollection|email|contents|object\(/,
      );
      expect(
        result.evidence.find((item) => item.kind === "file"),
      ).toMatchObject({
        commitSha: COMMIT,
        blobSha: blob().sha,
        text: manifest,
        sourceUrl:
          "https://github.com/learner/project/blob/" + COMMIT + "/package.json",
      });
      const languageEvidence = result.evidence.find(
        (item) => item.kind === "languages",
      );
      expect(languageEvidence).toMatchObject({
        sourceUrl: "https://api.github.com/repos/learner/project/languages",
        bytes: { TypeScript: 100, JavaScript: 50 },
      });
      expect(languageEvidence).not.toHaveProperty("commitSha");
      expect(
        result.repositories[0]?.files.find((file) => file.path === "pom.xml")
          ?.state,
      ).toBe("missing");
      expect(
        extractGithubTechnologies(result).map((item) => item.technology),
      ).toContain("React");
      expect(extractGithubTechnologies(result, [10])).toEqual([]);
      const citations = projectGithubProfile(result, null)
        .technologies.flatMap((item) => item.observations)
        .flatMap((item) => item.citations);
      expect(citations).toContainEqual(
        expect.objectContaining({
          kind: "languages",
          sourceUrl: languageEvidence!.sourceUrl,
        }),
      );
      for (const forbidden of [
        TOKEN,
        BASIC,
        "test-app-client-secret",
        "attacker.invalid",
      ])
        expect(JSON.stringify(result)).not.toContain(forbidden);
    },
  );

  it("paginates cursor variables and respects a nonmultiple listing ceiling", async () => {
    const fetch = transport((url, init) => {
      if (url.pathname !== "/graphql") return;
      const { first, after } = JSON.parse(String(init.body)).variables;
      return json(
        page(
          Array.from({ length: first }, (_, i) =>
            repo({ databaseId: (after ? 101 : 1) + i }),
          ),
          !after,
          after ? null : "cursor-1",
        ),
      );
    });
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { listedRepos: 101, selectedRepos: 1 },
    });
    expect(result.repositories).toHaveLength(101);
    expect(result.coverage.listingComplete).toBe(true);
    expect(
      JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).variables,
    ).toEqual({ first: 1, after: "cursor-1" });
  });

  it.each([1, 100])(
    "caps three listing pages with %i nodes per page and ignores Link URLs",
    async (length) => {
      let count = 0;
      const fetch = transport((url) =>
        url.pathname === "/graphql"
          ? json(
              page(
                Array.from({ length }, () => repo({ databaseId: ++count })),
                true,
                "cursor-" + count,
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
      expect(count).toBe(length * 3);
      expect(result.coverage.listingComplete).toBe(false);
      expect(result.issues).toContainEqual({
        operation: "listing",
        code: "pagination_limit",
      });
      expect(result.status).toBe("partial");
    },
  );

  it.each([
    repo({ isPrivate: true }),
    repo({ visibility: "PRIVATE" }),
    repo({ owner: { databaseId: 321, login: "other" } }),
    repo({ owner: { databaseId: 123, login: "other" } }),
    repo({ name: ".." }),
    repo({ databaseId: null }),
    repo({ databaseId: 1.5 }),
    repo({
      defaultBranchRef: {
        name: "main",
        target: { __typename: "Tag", oid: COMMIT },
      },
    }),
    repo({
      defaultBranchRef: {
        name: "../unsafe",
        target: { __typename: "Commit", oid: COMMIT },
      },
    }),
    repo({
      defaultBranchRef: {
        name: "main",
        target: { __typename: "Commit", oid: "invalid" },
      },
    }),
  ])(
    "rejects nonpublic, foreign or malformed repository output atomically",
    async (entry) => {
      const fetch = transport((url) =>
        url.pathname === "/graphql"
          ? graph([repo({ databaseId: 11 }), entry])
          : undefined,
      );
      const result = await collectGithubProfile(input, { fetch });
      expect(result.issues[0]).toMatchObject({
        operation: "listing",
        code: "invalid_response",
      });
      expect(result.repositories).toEqual([]);
      expect(result.evidence).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("blocks evidence and REST reads on numeric identity mismatch", async () => {
    const fetch = transport();
    const result = await collectGithubProfile(
      { ...input, githubUserId: "124" },
      { fetch },
    );
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual([
      { operation: "identity", code: "identity_mismatch" },
    ]);
    expect(result.evidence).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    "../evil",
    "learner?scope=repo",
    "learner#fragment",
    "https://attacker.invalid/",
  ])("rejects unsafe viewer login %s", async (login) => {
    const fetch = transport(() =>
      json(page([], false, null, { databaseId: 123, login })),
    );
    expect((await collectGithubProfile(input, { fetch })).issues[0]?.code).toBe(
      "invalid_response",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["identity", "duplicate", "cursor", "empty"])(
    "rejects invalid subsequent page %s, retaining only earlier validated data",
    async (failure) => {
      let count = 0;
      const fetch = transport((url) => {
        if (url.pathname !== "/graphql") return;
        if (++count === 1) return json(page([repo()], true, "cursor-1"));
        return json(
          page(
            failure === "empty"
              ? []
              : [repo({ databaseId: failure === "duplicate" ? 10 : 11 })],
            true,
            failure === "cursor" ? "cursor-1" : "cursor-2",
            {
              databaseId: failure === "identity" ? 124 : 123,
              login: "learner",
            },
          ),
        );
      });
      const result = await collectGithubProfile(input, { fetch });
      expect(result.repositories.map((item) => item.id)).toEqual([10]);
      expect(result.status).toBe("partial");
      expect(result.coverage.listingComplete).toBe(false);
      expect(result.issues[0]?.code).toBe(
        failure === "identity" ? "identity_mismatch" : "invalid_response",
      );
    },
  );

  it.each([
    [{ errors: [{ message: "private provider detail" }] }, "graphql_error"],
    [
      {
        ...page(),
        errors: [
          {
            message: "private provider detail",
            path: ["viewer", "repositories"],
          },
        ],
      },
      "graphql_partial",
    ],
    [{ data: null }, "invalid_response"],
    [{ data: { viewer: null } }, "invalid_response"],
    [{ ...page(), errors: [] }, "invalid_response"],
    [{ ...page(), errors: [{ message: 123 }] }, "invalid_response"],
  ] as const)(
    "distinguishes errors from malformed envelopes without REST fallback",
    async (response, code) => {
      const fetch = transport(() => json(response));
      const result = await collectGithubProfile(input, { fetch });
      expect(result.issues[0]?.code).toBe(code);
      expect(result.evidence).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("private provider detail");
    },
  );

  it("retains earlier validated pages but discards all data from partial-error pages", async () => {
    let count = 0;
    const fetch = transport((url) =>
      url.pathname === "/graphql"
        ? json(
            ++count === 1
              ? page([repo()], true, "next")
              : {
                  ...page([repo({ databaseId: 11 })]),
                  errors: [{ message: "resolver unavailable" }],
                },
          )
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.repositories.map((item) => item.id)).toEqual([10]);
    expect(result.evidence.every((item) => item.repositoryId === 10)).toBe(
      true,
    );
    expect(result.issues[0]?.code).toBe("graphql_partial");
    expect(result.status).toBe("partial");
  });

  it.each([
    { type: "RATE_LIMITED", message: "hidden" },
    { extensions: { type: "RATE_LIMITED" }, message: "hidden" },
    { extensions: { code: "RATE_LIMITED" }, message: "hidden" },
    { message: "You have exceeded a secondary rate limit." },
    { type: "UNAUTHENTICATED", message: "hidden" },
    { message: "Bad credentials" },
  ])(
    "classifies HTTP-200 auth/rate errors without leaking provider text",
    async (error) => {
      const fetch = transport(() =>
        json({ ...page(), errors: [error] }, 200, {
          "x-ratelimit-reset": "1800000000",
        }),
      );
      const result = await collectGithubProfile(input, { fetch });
      const code = /UNAUTHENTICATED|Bad credentials/.test(JSON.stringify(error))
        ? "connection_expired"
        : "rate_limited";
      expect(result.issues[0]).toMatchObject({ code, httpStatus: 200 });
      if (code === "rate_limited")
        expect(result.issues[0]?.retryAt).toBe("2027-01-15T08:00:00.000Z");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain(error.message);
    },
  );

  it.each([401, 403])(
    "stops on REST app auth failure %i without fallback",
    async (status) => {
      const fetch = transport((url) =>
        url.pathname.endsWith("/contents")
          ? json({ message: "Bad credentials test-app-client-secret" }, status)
          : undefined,
      );
      const result = await collectGithubProfile(appInput, { fetch });
      expect(result.issues[0]).toMatchObject({
        operation: "directory",
        code: "app_auth_failed",
        httpStatus: status,
      });
      expect(result.evidence.map((item) => item.kind)).toEqual(["languages"]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toContain("test-app-client-secret");
    },
  );

  it.each([301, 302, 307, 308])(
    "rejects GraphQL redirects %i",
    async (status) => {
      const fetch = transport(
        () =>
          new Response(null, {
            status,
            headers: { location: "https://attacker.invalid" },
          }),
      );
      expect(
        (await collectGithubProfile(input, { fetch })).issues[0]?.code,
      ).toBe("redirect_rejected");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("retains fork/empty/capped metadata and selects by pushed time then ID", async () => {
    const fetch = transport((url) =>
      url.pathname === "/graphql"
        ? graph([
            repo({ databaseId: 13, isFork: true }),
            repo({ databaseId: 12, isEmpty: true, defaultBranchRef: null }),
            repo({ databaseId: 9, pushedAt: null }),
            repo({ databaseId: 11 }),
            repo(),
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
      [9, "capped"],
    ]);
    expect(result.status).toBe("partial");
    expect(result.evidence.every((item) => item.repositoryId === 10)).toBe(
      true,
    );
  });

  it("does not confuse zero disk size with an empty repository", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport((url) =>
        url.pathname === "/graphql"
          ? graph([repo({ diskUsage: 0 })])
          : undefined,
      ),
    });
    expect(result.repositories[0]?.disposition).toBe("selected");
    expect(result.status).toBe("complete");
  });

  it("does not invent branches or files when a nonempty repository has no ref", async () => {
    const fetch = transport((url) =>
      url.pathname === "/graphql"
        ? graph([repo({ defaultBranchRef: null })])
        : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.issues[0]).toMatchObject({
      operation: "ref",
      code: "invalid_response",
    });
    expect(result.repositories[0]).toMatchObject({
      defaultBranch: "",
      commitSha: null,
    });
    expect(result.evidence.map((item) => item.kind)).toEqual(["languages"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports an empty account without inventing observations", async () => {
    const fetch = transport(() => graph([]));
    const result = await collectGithubProfile(input, { fetch });
    expect(result.status).toBe("complete");
    expect(extractGithubTechnologies(result)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [languages({ pageInfo: { hasNextPage: true } }), "language_limit"],
    [null, "invalid_response"],
    [
      languages({ edges: [{ size: -1, node: { name: "TypeScript" } }] }),
      "invalid_response",
    ],
    [
      languages({
        edges: [
          { size: 1, node: { name: "Python" } },
          { size: 2, node: { name: "Python" } },
        ],
      }),
      "invalid_response",
    ],
  ])(
    "rejects truncated/malformed language totals but keeps files",
    async (value, code) => {
      const result = await collectGithubProfile(input, {
        fetch: transport((url) =>
          url.pathname === "/graphql"
            ? graph([repo({ languages: value })])
            : undefined,
        ),
      });
      expect(result.issues[0]).toMatchObject({ operation: "languages", code });
      expect(
        result.evidence.filter((item) => item.kind === "languages"),
      ).toEqual([]);
      expect(
        result.evidence.filter((item) => item.kind === "file"),
      ).toHaveLength(1);
      expect(result.status).toBe("partial");
    },
  );

  it.each([TOKEN, "test-app-client-secret", BASIC])(
    "rejects JSON-escaped credential reflection",
    async (secret) => {
      const escaped = [...secret]
        .map(
          (character) =>
            "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
        )
        .join("");
      const fetch = transport(
        () =>
          new Response(
            JSON.stringify(page()).replace('"TypeScript"', '"' + escaped + '"'),
          ),
      );
      const result = await collectGithubProfile(appInput, { fetch });
      expect(result.issues[0]?.code).toBe("invalid_response");
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it.each([
    { mode: "oauth_app", clientId: "bad:id", clientSecret: "secret" },
    { mode: "oauth_app", clientId: "app", clientSecret: "" },
    { mode: "oauth_app", clientId: "app", clientSecret: "bad\r\nheader" },
    { mode: "anonymous", clientSecret: "unexpected" },
    undefined,
  ])("rejects invalid public access before transport", async (publicAccess) => {
    const fetch = transport();
    const result = await collectGithubProfile(
      { ...input, publicAccess } as typeof input,
      { fetch },
    );
    expect(result.issues[0]?.code).toBe("invalid_input");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the full 60-request cap across GraphQL and REST", async () => {
    const fetch = transport((url) => {
      if (url.pathname === "/graphql")
        return graph(
          Array.from({ length: 15 }, (_, i) =>
            repo({ databaseId: i + 1, name: `project-${i}` }),
          ),
        );
      if (url.pathname.endsWith("/contents"))
        return json(
          ["package.json", "requirements.txt", "README.md"].map((name) => ({
            name,
            ...blob(),
          })),
        );
      if (url.pathname.includes("/contents/")) return json(blob());
    });
    const result = await collectGithubProfile(input, { fetch });
    expect(fetch).toHaveBeenCalledTimes(60);
    expect(result.coverage.requests).toBe(60);
    expect(result.issues.some((item) => item.code === "request_limit")).toBe(
      true,
    );
    expect(result.status).toBe("partial");
  });

  it("shares aggregate bytes across the GraphQL response and REST file reads", async () => {
    const aggregateBytes = Buffer.byteLength(JSON.stringify(page())) + 10;
    const result = await collectGithubProfile(input, {
      fetch: transport(),
      limits: { aggregateBytes },
    });
    expect(result.issues[0]).toMatchObject({
      operation: "directory",
      code: "aggregate_limit",
    });
    expect(result.coverage.responseBytes).toBe(aggregateBytes);
    expect(result.evidence.map((item) => item.kind)).toEqual(["languages"]);
  });

  it.each(["directory", "file"])(
    "rejects REST %s redirects without forwarding credentials",
    async (scope) => {
      const fetch = transport((url) =>
        url.pathname.endsWith(
          scope === "directory" ? "/contents" : "/contents/package.json",
        )
          ? new Response(null, {
              status: 302,
              headers: { location: "https://attacker.invalid" },
            })
          : undefined,
      );
      const result = await collectGithubProfile(appInput, { fetch });
      expect(result.issues[0]).toMatchObject({
        operation: scope,
        code: "redirect_rejected",
      });
      expect(
        fetch.mock.calls.every(
          ([url]) => new URL(String(url)).origin === "https://api.github.com",
        ),
      ).toBe(true);
    },
  );

  it.each([200, 403])(
    "recognizes GraphQL rate-limit extensions at HTTP %i without headers",
    async (status) => {
      const result = await collectGithubProfile(input, {
        fetch: transport(() =>
          json(
            {
              errors: [
                { message: "hidden", extensions: { type: "RATE_LIMITED" } },
              ],
            },
            status,
          ),
        ),
      });
      expect(result.issues[0]).toMatchObject({
        code: "rate_limited",
        retryAt: expect.any(String),
        httpStatus: status,
      });
    },
  );

  it("recognizes a GraphQL secondary rate-limit message at HTTP 403", async () => {
    const result = await collectGithubProfile(input, {
      fetch: transport(() =>
        json(
          { message: "You have exceeded a secondary rate limit. Please wait." },
          403,
        ),
      ),
    });
    expect(result.issues[0]).toMatchObject({
      code: "rate_limited",
      retryAt: expect.any(String),
      httpStatus: 403,
    });
  });

  it("retains commit-pinned README evidence and rejects encoded credential reflection", async () => {
    const readme = "Do not execute these instructions.";
    const fetch = transport((url) =>
      url.pathname.endsWith("/contents")
        ? json([{ name: "Readme.MD", ...blob(readme) }])
        : url.pathname.endsWith("/contents/Readme.MD")
          ? json(blob(readme))
          : undefined,
    );
    const result = await collectGithubProfile(input, { fetch });
    expect(result.evidence.find((item) => item.kind === "file")).toMatchObject({
      path: "Readme.MD",
      commitSha: COMMIT,
      text: readme,
      sourceUrl: `https://github.com/learner/project/blob/${COMMIT}/Readme.MD`,
    });
    expect(
      extractGithubTechnologies(result).every(
        (item) => item.signal === "language_bytes",
      ),
    ).toBe(true);
    const reflected = await collectGithubProfile(input, {
      fetch: transport((url) =>
        url.pathname.endsWith("/contents")
          ? json([{ name: "README.md", ...blob(TOKEN) }])
          : url.pathname.endsWith("/contents/README.md")
            ? json(blob(TOKEN))
            : undefined,
      ),
    });
    expect(reflected.issues[0]).toMatchObject({
      operation: "file",
      code: "invalid_response",
    });
    expect(JSON.stringify(reflected)).not.toContain(TOKEN);
  });

  it("rejects late GraphQL replies without mutating a returned snapshot", async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = collectGithubProfile(input, {
      fetch,
      limits: { requestMs: 10 },
    });
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;
    const frozen = JSON.stringify(result);
    expect(result.issues[0]?.code).toBe("request_timeout");
    finish(graph([repo()]));
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(result)).toBe(frozen);
    expect(fetch).toHaveBeenCalledTimes(1);
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
    expect(fetch).toHaveBeenCalledTimes(2);
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
    expect(fetch).toHaveBeenCalledTimes(2);
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
    expect(fetch).toHaveBeenCalledTimes(2);
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

  it("uses 31 requests for 15 manifests while retaining the two-worker ceiling", async () => {
    let active = 0;
    let peak = 0;
    const base = transport((url) =>
      url.pathname === "/graphql"
        ? graph(
            Array.from({ length: 15 }, (_, i) =>
              repo({ databaseId: i + 1, name: `project-${i}` }),
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
    expect(fetch).toHaveBeenCalledTimes(31);
    expect(result.coverage.requests).toBe(31);
    expect(result.issues).toEqual([]);
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
      limits: { requestMs: 20, totalMs: 17 },
    });
    await vi.advanceTimersByTimeAsync(17);
    const result = await pending;
    expect(result.issues.at(-1)?.code).toBe("total_timeout");
    expect(result.coverage.elapsedMs).toBe(17);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8);
    expect(fetch).toHaveBeenCalledTimes(3);
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

  it("overlaps two repository reads without exceeding two workers and keeps evidence ordered", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const fetch = transport(async (url) => {
      if (url.pathname === "/graphql")
        return graph(
          [10, 11, 12, 13].map((id) =>
            repo({ databaseId: id, name: `project-${id}` }),
          ),
        );
      if (url.pathname.startsWith("/repos/")) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) =>
          setTimeout(resolve, url.pathname.includes("project-10") ? 20 : 5),
        );
        active--;
      }
    });
    const pending = collectGithubProfile(input, { fetch });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(result.status).toBe("complete");
    expect(result.evidence.map((item) => item.repositoryId)).toEqual([
      10, 10, 11, 11, 12, 12, 13, 13,
    ]);
    expect(
      result.repositories.every((item) =>
        item.files.some((file) => file.state === "collected"),
      ),
    ).toBe(true);
  });

  it("shares the request ceiling across both workers and starts no extra request after exhaustion", async () => {
    const fetch = transport((url) =>
      url.pathname === "/graphql"
        ? graph(
            [10, 11, 12].map((id) =>
              repo({ databaseId: id, name: `project-${id}` }),
            ),
          )
        : undefined,
    );
    const result = await collectGithubProfile(input, {
      fetch,
      limits: { requests: 4 },
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.coverage.requests).toBe(4);
    expect(result.status).toBe("partial");
    expect(result.issues.some((issue) => issue.code === "request_limit")).toBe(
      true,
    );
  });
});
