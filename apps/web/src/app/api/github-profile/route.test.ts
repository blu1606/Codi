import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { APIError, unlinkAccount } from "better-auth/api";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account } from "@codi-1/db/schema/auth";
import { githubProfiles } from "@codi-1/db/schema/github-profile";
import type { GithubCollectionSnapshot } from "@/lib/github-profile-contract";
import { GITHUB_PROFILE_LIMITS } from "@/lib/github-profile-contract";
import { projectGithubProfile } from "@/lib/github-profile-analysis-contract";
import type { GithubProfileRequest } from "@/lib/github-profile-store";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  token: vi.fn(),
  unlink: vi.fn(),
  createStore: vi.fn(),
  run: vi.fn(),
  store: {
    getLinkedAccount: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
    read: vi.fn(),
    publish: vi.fn(),
    reserveGeneration: vi.fn(),
  },
  env: {
    AI_PROVIDER: "openai",
    AI_MODEL: "gpt-6-luna",
    OPENAI_API_KEY: "fixture-ai-key",
    GITHUB_CLIENT_ID: "fixture-app",
    GITHUB_CLIENT_SECRET: "fixture-app-secret",
  },
}));
vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: mocks.session,
      getAccessToken: mocks.token,
      unlinkAccount: mocks.unlink,
    },
  },
  db: { fixture: true },
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/env.server", () => ({ ENV: mocks.env }));
vi.mock("@/lib/github-profile-service", () => ({
  runGithubProfileRequest: mocks.run,
}));
vi.mock("@/lib/github-profile-store", () => ({
  createGithubProfileStore: mocks.createStore,
  GithubProfileStoreError: class extends Error {
    constructor(public readonly code: string) {
      super(`fixture store: ${code}`);
    }
  },
}));
import { GithubProfileStoreError } from "@/lib/github-profile-store";
import { DELETE, GET, POST, maxDuration, runtime } from "./route";
const realService = await vi.importActual<
  typeof import("@/lib/github-profile-service")
>("@/lib/github-profile-service");

const ORIGIN = "https://codi.test";
const NOW = "2026-10-20T00:00:00.000Z";
const validBody = {
  consentVersion: "public-github-v1",
  githubProfileInput: "learner",
};
const claim: GithubProfileRequest = {
  userId: "owner",
  accountId: "local-row",
  githubUserId: "123",
  consentVersion: "public-github-v1",
  requestId: "00000000-0000-4000-8000-000000000001",
  consentedAt: new Date(NOW),
  activeUntil: new Date("2026-10-20T00:00:55Z"),
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function request(
  body: unknown = validBody,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
  return new NextRequest(`${ORIGIN}/api/github-profile?userId=victim`, {
    method: "POST",
    ...init,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...init.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function retained(): GithubCollectionSnapshot {
  return {
    version: 1,
    status: "complete",
    identity: { id: "123", login: "learner" },
    collectedAt: NOW,
    repositories: [
      {
        id: 1,
        name: "project",
        owner: "learner",
        defaultBranch: "main",
        pushedAt: null,
        disposition: "selected",
        commitSha: null,
        files: [],
      },
    ],
    evidence: [
      {
        id: "languages-1",
        repositoryId: 1,
        kind: "languages",
        bytes: { TypeScript: 100 },
        collectedAt: NOW,
        sourceUrl: "https://api.github.com/repos/learner/project/languages",
      },
    ],
    issues: [],
    coverage: {
      publicAccess: "oauth_app",
      listingComplete: true,
      listed: 1,
      selected: 1,
      requests: 5,
      responseBytes: 1000,
      elapsedMs: 10,
      limits: GITHUB_PROFILE_LIMITS,
    },
  };
}
function providerTransport() {
  return vi.fn<typeof fetch>(async (url) => {
    const parsed = new URL(String(url));
    if (parsed.origin === "https://api.github.com") {
      if (parsed.pathname === "/user")
        return json({ id: 123, login: "learner" });
      if (parsed.pathname === "/users/learner/repos")
        return json([
          {
            id: 1,
            name: "project",
            owner: { id: 123, login: "learner" },
            private: false,
            fork: false,
            size: 10,
            default_branch: "main",
            pushed_at: null,
          },
        ]);
      if (parsed.pathname.endsWith("/git/ref/heads/main"))
        return json({ object: { type: "commit", sha: "a".repeat(40) } });
      if (parsed.pathname.endsWith("/languages"))
        return json({ TypeScript: 100 });
      if (parsed.pathname.endsWith("/contents")) return json([]);
    }
    if (String(url) === "https://api.openai.com/v1/responses/input_tokens")
      return json({ object: "response.input_tokens", input_tokens: 1000 });
    if (String(url) === "https://api.openai.com/v1/responses")
      return json({
        model: "gpt-6-luna",
        status: "completed",
        service_tier: "default",
        usage: { input_tokens: 1000, output_tokens: 100 },
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  technologies: { t0: null },
                  areas: [],
                  overall: {
                    level: "basic",
                    confidence: "low",
                    summary: "Ước tính từ repo công khai.",
                    supports: ["e0"],
                  },
                }),
              },
            ],
          },
        ],
      });
    throw new Error("unexpected_fixture_endpoint");
  });
}
let transport: ReturnType<typeof providerTransport>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv("GITHUB_PROFILE_BUDGET_KEY", "fixture-budget");
  vi.stubEnv("GITHUB_PROFILE_BUDGET_SLOT", "pre-integration");
  vi.stubEnv("GITHUB_PROFILE_CANDIDATE_SHA", "a".repeat(40));
  Object.assign(mocks.env, {
    AI_PROVIDER: "openai",
    AI_MODEL: "gpt-6-luna",
    OPENAI_API_KEY: "fixture-ai-key",
    GITHUB_CLIENT_ID: "fixture-app",
    GITHUB_CLIENT_SECRET: "fixture-app-secret",
  });
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.token.mockResolvedValue({ accessToken: "fixture-user-token" });
  mocks.unlink.mockResolvedValue({ status: true });
  mocks.createStore.mockReturnValue(mocks.store);
  mocks.store.getLinkedAccount.mockResolvedValue({
    userId: "owner",
    accountId: "local-row",
    githubUserId: "123",
  });
  mocks.store.claim.mockResolvedValue(claim);
  mocks.store.release.mockResolvedValue(true);
  mocks.store.reserveGeneration.mockResolvedValue(true);
  mocks.store.publish.mockResolvedValue(undefined);
  mocks.store.read.mockResolvedValue(null);
  mocks.run.mockImplementation(realService.runGithubProfileRequest);
  transport = providerTransport();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("installed unlink protections and declared profile cascade (offline)", () => {
  function installedUnlink(accounts: { id: string }[], ageSeconds = 0) {
    const findAccounts = vi.fn().mockResolvedValue(accounts);
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    // Exercise the installed endpoint/middleware with a prevalidated session and
    // adapter doubles, not a DB, cookie-authentication or concurrency simulation.
    const invoke = (accountId = "local-row") =>
      unlinkAccount({
        body: { accountId },
        context: {
          session: {
            user: { id: "owner" },
            session: { createdAt: new Date(Date.now() - ageSeconds * 1000) },
          },
          sessionConfig: { freshAge: 3600 },
          options: { account: { accountLinking: { enabled: true } } },
          internalAdapter: { findAccounts, deleteAccount },
        } as unknown as NonNullable<
          Parameters<typeof unlinkAccount>[0]
        >["context"],
      });
    return { invoke, findAccounts, deleteAccount };
  }

  it("refuses to delete the last sign-in account with unlink-all absent", async () => {
    const task = installedUnlink([{ id: "local-row" }]);
    await expect(task.invoke()).rejects.toMatchObject({
      body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
    });
    expect(task.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a fresh session before account reads or deletion", async () => {
    const task = installedUnlink(
      [{ id: "local-row" }, { id: "password-row" }],
      3600,
    );
    await expect(task.invoke()).rejects.toMatchObject({
      body: { code: "SESSION_NOT_FRESH" },
    });
    expect(task.findAccounts).not.toHaveBeenCalled();
    expect(task.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects a row not owned by the session and deletes only the selected local row", async () => {
    const task = installedUnlink([{ id: "local-row" }, { id: "password-row" }]);
    await expect(task.invoke("foreign-row")).rejects.toMatchObject({
      body: { code: "ACCOUNT_NOT_FOUND" },
    });
    expect(task.deleteAccount).not.toHaveBeenCalled();
    expect(await task.invoke()).toEqual({ status: true });
    expect(task.findAccounts).toHaveBeenCalledWith("owner");
    expect(task.deleteAccount).toHaveBeenCalledExactlyOnceWith("local-row");
  });

  it("declares profile cleanup on account deletion, not user deletion", () => {
    const foreignKey = getTableConfig(githubProfiles).foreignKeys.find(
      (key) => key.reference().columns[0] === githubProfiles.accountId,
    );
    expect(foreignKey?.onDelete).toBe("cascade");
    expect(foreignKey?.reference().foreignTable).toBe(account);
    expect(foreignKey?.reference().foreignColumns).toEqual([account.id]);
  });
});

describe("GitHub disconnect route (offline, no DB/provider calls)", () => {
  const disconnectRequest = (
    options: {
      origin?: string;
      site?: string;
      body?: string;
      query?: string;
    } = {},
  ) =>
    new NextRequest(`${ORIGIN}/api/github-profile${options.query ?? ""}`, {
      method: "DELETE",
      headers: {
        origin: options.origin ?? ORIGIN,
        ...(options.site ? { "sec-fetch-site": options.site } : {}),
      },
      ...(options.body !== undefined ? { body: options.body } : {}),
    });

  afterEach(() => {
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    for (const operation of [
      "claim",
      "release",
      "read",
      "publish",
      "reserveGeneration",
    ] as const)
      expect(mocks.store[operation]).not.toHaveBeenCalled();
  });

  it("unlinks only the server-resolved local account with the caller's session headers", async () => {
    const req = disconnectRequest();
    const response = await DELETE(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disconnected: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.store.getLinkedAccount).toHaveBeenCalledExactlyOnceWith(
      "owner",
    );
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith({
      headers: req.headers,
      body: { accountId: "local-row" },
    });
  });

  it.each([
    { origin: "https://foreign.test" },
    { origin: "null" },
    { origin: "" },
    { site: "cross-site" },
  ])(
    "rejects invalid origin before session/store/unlink: %j",
    async (options) => {
      expect((await DELETE(disconnectRequest(options))).status).toBe(403);
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.createStore).not.toHaveBeenCalled();
      expect(mocks.unlink).not.toHaveBeenCalled();
    },
  );

  it.each([
    { body: JSON.stringify({ accountId: "victim", accessToken: "PRIVATE" }) },
    { body: "{}" },
    { query: "?accountId=victim" },
    { query: "?userId=victim&token=PRIVATE" },
  ])(
    "accepts no client identity, token or other input: %j",
    async (options) => {
      expect((await DELETE(disconnectRequest(options))).status).toBe(400);
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.unlink).not.toHaveBeenCalled();
    },
  );

  it("requires an authenticated learner before account lookup", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await DELETE(disconnectRequest())).status).toBe(401);
    expect(mocks.roles).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    for (const roles of [[], ["ADMIN"], ["LECTURER"]]) {
      mocks.roles.mockResolvedValue(roles);
      expect((await DELETE(disconnectRequest())).status).toBe(401);
    }
    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("is idempotent when no GitHub link exists", async () => {
    mocks.store.getLinkedAccount.mockResolvedValue(null);
    const response = await DELETE(disconnectRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disconnected: true });
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it.each([
    [
      "FAILED_TO_UNLINK_LAST_ACCOUNT",
      "BAD_REQUEST",
      409,
      "last_sign_in_method",
    ],
    ["SESSION_NOT_FRESH", "FORBIDDEN", 403, "session_not_fresh"],
    ["UNAUTHORIZED", "UNAUTHORIZED", 401, "unauthorized"],
    ["ACCOUNT_NOT_FOUND", "BAD_REQUEST", 409, "github_not_linked"],
    ["UNKNOWN", "INTERNAL_SERVER_ERROR", 503, "disconnect_failed"],
  ] as const)(
    "maps auth %s without exposing raw errors",
    async (code, status, httpStatus, safeCode) => {
      mocks.unlink.mockRejectedValue(
        new APIError(status, {
          code,
          message: "PRIVATE fixture-user-token local-row",
        }),
      );
      const response = await DELETE(disconnectRequest());
      expect(response.status).toBe(httpStatus);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.code).toBe(safeCode);
      expect(JSON.stringify(body)).not.toMatch(
        /PRIVATE|fixture|local-row|owner/,
      );
      if (code === "FAILED_TO_UNLINK_LAST_ACCOUNT")
        expect(body.error).toContain("Đặt mật khẩu");
    },
  );

  it("sanitizes lookup/unlink failures and never claims success for a false result", async () => {
    mocks.store.getLinkedAccount.mockRejectedValueOnce(new Error("PRIVATE"));
    expect((await DELETE(disconnectRequest())).status).toBe(503);
    expect(mocks.unlink).not.toHaveBeenCalled();
    mocks.unlink.mockRejectedValueOnce(new Error("PRIVATE"));
    expect((await DELETE(disconnectRequest())).status).toBe(503);
    mocks.unlink.mockResolvedValueOnce({ status: false });
    const response = await DELETE(disconnectRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "disconnect_failed" });
  });
});

describe("GitHub profile route boundaries (offline doubles, not live acceptance)", () => {
  it("preserves safe diagnostics from real helper and service without publication or leakage", async () => {
    const original = providerTransport();
    transport.mockImplementation(async (url, init) =>
      String(url) === "https://api.openai.com/v1/responses"
        ? json({ error: "PRIVATE_PROVIDER_BODY fixture-ai-key owner 123" }, 503)
        : original(url, init),
    );
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({
      code: "ai_failed",
      error: "Chưa tạo được hồ sơ năng lực. Không tự thử lại.",
      diagnostics: {
        phase: "generation",
        category: "http",
        httpStatus: 503,
        elapsedMs: expect.any(Number),
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /PRIVATE|fixture|owner|123|snapshot|reservation/,
    );
    expect(mocks.store.reserveGeneration).toHaveBeenCalledOnce();
    expect(mocks.store.publish).not.toHaveBeenCalled();
  });

  it.each([
    "valid-extra",
    "bad-phase",
    "bad-category",
    "bad-status",
    "bad-elapsed",
  ])("whitelists diagnostic response fields: %s", async (variant) => {
    const diagnostics = {
      phase: "generation",
      category: "http",
      httpStatus: 500,
      elapsedMs: 12,
      rawBody: "PRIVATE",
      message: "PRIVATE",
      token: "PRIVATE",
      userId: "PRIVATE",
    };
    if (variant === "bad-phase") diagnostics.phase = "PRIVATE_PROVIDER_PHASE";
    if (variant === "bad-category")
      diagnostics.category = "PRIVATE_PROVIDER_CODE";
    if (variant === "bad-status") diagnostics.httpStatus = 999;
    if (variant === "bad-elapsed") diagnostics.elapsedMs = -1;
    mocks.run.mockResolvedValue({
      ok: false,
      code: "ai_failed",
      error: "safe",
      diagnostics,
    });
    const response = await POST(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      code: "ai_failed",
      error: "safe",
      ...(variant === "valid-extra"
        ? {
            diagnostics: {
              phase: "generation",
              category: "http",
              httpStatus: 500,
              elapsedMs: 12,
            },
          }
        : {}),
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
  });

  it.each(["https://foreign.test", "null", ""])(
    "rejects missing/foreign Origin %s before authentication",
    async (origin) => {
      const req = request();
      if (origin) req.headers.set("origin", origin);
      else req.headers.delete("origin");
      const response = await POST(req);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "invalid_origin" });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.createStore).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-site fetch metadata even when Origin matches", async () => {
    expect(
      (
        await POST(
          request(validBody, { headers: { "sec-fetch-site": "cross-site" } }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST"])(
    "rejects anonymous %s before role/store/token access",
    async (method) => {
      mocks.session.mockResolvedValue(null);
      const response = await (method === "GET"
        ? GET(request())
        : POST(request()));
      expect(response.status).toBe(401);
      expect(mocks.roles).not.toHaveBeenCalled();
      expect(mocks.createStore).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
    },
  );
  it.each([[], ["ADMIN"], ["LECTURER"]])(
    "rejects non-learner roles %j",
    async (...roles) => {
      mocks.roles.mockResolvedValue(roles);
      expect((await POST(request())).status).toBe(401);
      expect((await GET(request())).status).toBe(401);
      expect(mocks.createStore).not.toHaveBeenCalled();
    },
  );
  it.each(["{", " ", "x".repeat(2049)])(
    "rejects invalid or oversized JSON before store/service",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.createStore).not.toHaveBeenCalled();
    },
  );
  it("counts bytes, not characters or declared Content-Length", async () => {
    const content = JSON.stringify({ pad: "ệ".repeat(700) });
    expect(content.length).toBeLessThan(2048);
    expect(
      (await POST(request(content, { headers: { "content-length": "1" } })))
        .status,
    ).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("accepts exactly 2048 bytes and reaches consent validation", async () => {
    expect((await POST(request("{}".padEnd(2048, " ")))).status).toBe(400);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.store.getLinkedAccount).not.toHaveBeenCalled();
  });
  it("rejects absent/wrong content type, absent body and malformed UTF-8", async () => {
    const req = request();
    req.headers.delete("content-type");
    expect((await POST(req)).status).toBe(400);
    expect(
      (
        await POST(
          request(validBody, { headers: { "content-type": "text/plain" } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new NextRequest(`${ORIGIN}/api/github-profile`, {
            method: "POST",
            headers: { origin: ORIGIN, "content-type": "application/json" },
          }),
        )
      ).status,
    ).toBe(400);
    const broken = new NextRequest(`${ORIGIN}/api/github-profile`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: new Uint8Array([0x22, 0xff, 0x22]),
    });
    expect((await POST(broken)).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([
    ["GITHUB_PROFILE_BUDGET_KEY", ""],
    ["GITHUB_PROFILE_BUDGET_KEY", "x".repeat(301)],
    ["GITHUB_PROFILE_BUDGET_SLOT", "client-slot"],
    ...[
      "",
      "test-",
      "test-A",
      "test-a_b",
      "test-a/b",
      " test-a",
      "test-a\n",
      "test-a\r",
      "test-a b",
      `test-${"a".repeat(65)}`,
    ].map((slot) => ["GITHUB_PROFILE_BUDGET_SLOT", slot]),
    ["GITHUB_PROFILE_CANDIDATE_SHA", "bad"],
  ])("fails closed for runtime budget %s=%s", async (key, value) => {
    vi.stubEnv(key, value);
    const response = await POST(
      request({
        ...validBody,
        budgetKey: "client-budget",
        candidateSha: "a".repeat(40),
        slot: "integrated",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "not_ready" });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
  });
  it.each([
    "AI_PROVIDER",
    "AI_MODEL",
    "OPENAI_API_KEY",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ] as const)(
    "fails closed on runtime provider configuration %s",
    async (key) => {
      mocks.env[key] = "";
      expect((await POST(request())).status).toBe(503);
      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { consentVersion: "old" },
    { ...validBody, githubProfileInput: "https://foreign.test/user" },
    { ...validBody, githubUserId: "999" },
  ])(
    "lets the real service reject invalid consent/intent before account/token %j",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.store.getLinkedAccount).not.toHaveBeenCalled();
      expect(mocks.store.claim).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it.each([
    "pre-integration",
    "diagnostic-preintegration",
    "integrated",
    "test-a",
    "test--",
    "test-a-",
    `test-${"a".repeat(64)}`,
  ])(
    "uses session-owned local row and trusted %s reservation",
    async (slot) => {
      vi.stubEnv("GITHUB_PROFILE_BUDGET_SLOT", slot);
      const req = request();
      const response = await POST(req);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(mocks.store.getLinkedAccount).toHaveBeenCalledExactlyOnceWith(
        "owner",
      );
      expect(mocks.store.claim).toHaveBeenCalledExactlyOnceWith({
        userId: "owner",
        accountId: "local-row",
        githubUserId: "123",
        consentVersion: "public-github-v1",
      });
      expect(mocks.token).toHaveBeenCalledExactlyOnceWith({
        headers: req.headers,
        body: { accountId: "local-row" },
      });
      expect(mocks.createStore).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        {
          budgetKey: "fixture-budget",
          slot,
          candidateSha: "a".repeat(40),
        },
      );
      expect(mocks.store.reserveGeneration).toHaveBeenCalledExactlyOnceWith(
        claim,
        expect.objectContaining({
          model: "openai/gpt-6-luna",
          inputTokens: 1000,
        }),
      );
      expect(mocks.store.publish).toHaveBeenCalledTimes(1);
      expect(mocks.store.release).toHaveBeenCalledWith(claim);
      expect(Object.keys(data)).toEqual(["profile"]);
      expect(data.profile.identity).toEqual({ id: "123", login: "learner" });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const text = JSON.stringify(data);
      for (const hidden of [
        "fixture-user-token",
        "fixture-app-secret",
        "fixture-ai-key",
        "local-row",
        "maximumCostMicroUsd",
        "preflightInputTokens",
      ])
        expect(text).not.toContain(hidden);
    },
  );
  it("waits for publication before resolving a success response", async () => {
    let finish!: () => void;
    mocks.store.publish.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let settled = false;
    const pending = POST(request()).then((response) => {
      settled = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.store.publish).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    finish();
    expect((await pending).status).toBe(200);
  });
  it("returns no success if publication fails and does not echo private details", async () => {
    mocks.store.publish.mockRejectedValue(
      new Error("private database fixture-user-token"),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "request_failed",
      error: "Chưa hoàn tất phân tích GitHub. Không tự thử lại.",
    });
    expect(mocks.store.release).toHaveBeenCalledWith(claim);
  });
  it("does not publish empty observations or perform any generation", async () => {
    transport.mockImplementation(async (url) =>
      String(url).includes("/user") && !String(url).includes("/users/")
        ? json({ id: 123, login: "learner" })
        : json([]),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).profile.observationAvailability).toBe(
      "none_observed",
    );
    expect(mocks.store.publish).not.toHaveBeenCalled();
    expect(mocks.store.reserveGeneration).not.toHaveBeenCalled();
  });
  it("does not publish failures and strips private service result fields", async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      code: "rate_limited",
      error: "GitHub giới hạn.",
      retryAt: NOW,
      snapshot: retained(),
      reservationState: "consumed",
      rawProvider: "fixture-user-token",
    });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "rate_limited",
      error: "GitHub giới hạn.",
      retryAt: NOW,
    });
    expect(mocks.store.publish).not.toHaveBeenCalled();
  });
  it("returns unlinked status without token, provider or publish", async () => {
    mocks.store.getLinkedAccount.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.store.publish).not.toHaveBeenCalled();
  });
  it("returns the active-request conflict through the real service", async () => {
    mocks.store.claim.mockRejectedValue(
      new GithubProfileStoreError("active_request"),
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "active_request" });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it("releases a late claim after cancellation without token or AI dispatch", async () => {
    let finish!: (value: GithubProfileRequest) => void;
    mocks.store.claim.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = POST(request(validBody, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.store.claim).toHaveBeenCalledTimes(1);
    controller.abort();
    expect((await pending).status).toBe(504);
    finish(claim);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.store.release).toHaveBeenCalledWith(claim);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.store.reserveGeneration).not.toHaveBeenCalled();
  });
  it("bounds a stalled body without reaching service/account/provider", async () => {
    const req = new NextRequest(`${ORIGIN}/api/github-profile`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start() {} }),
      duplex: "half",
    } as NonNullable<ConstructorParameters<typeof NextRequest>[1]>);
    const pending = POST(req);
    await vi.advanceTimersByTimeAsync(55_000);
    expect((await pending).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it("reads only the session owner's stored projection without budget, token or provider access", async () => {
    vi.stubEnv("GITHUB_PROFILE_BUDGET_KEY", "");
    const snapshot = retained();
    const analysis = { technologies: [], areas: [], overall: null };
    mocks.store.read.mockResolvedValue({
      accountId: "local-row",
      githubUserId: "123",
      snapshot,
      analysis,
      corrections: {},
      publishedAt: new Date(NOW),
    });
    const response = await GET(
      new NextRequest(`${ORIGIN}/api/github-profile?userId=victim`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profile: projectGithubProfile(snapshot, analysis),
    });
    expect(mocks.store.read).toHaveBeenCalledExactlyOnceWith("owner");
    expect(mocks.createStore).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
    );
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("returns null for an absent saved profile and sanitizes store read failures", async () => {
    expect(await (await GET(request())).json()).toEqual({ profile: null });
    mocks.store.read.mockRejectedValue(
      new Error("fixture-user-token private provider"),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "store_failed",
      error: "Chưa tải được hồ sơ đã lưu.",
    });
  });
  it("exports the selected Node request duration", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });
});
