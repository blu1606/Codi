// GitHub link for the skill profile, owned by Codi rather than Better Auth.
//
// Better Auth keeps one owner per GitHub identity (provider "github"), which is right for "Sign in with GitHub" but
// stops two Codi accounts (say a learner's school and personal accounts) from analysing the same GitHub. The profile
// link is therefore stored as its own account row, provider "github-profile": several Codi users may hold a row for
// the same GitHub id, and Better Auth never resolves sign-ins through it (no such social provider is configured).
//
// Flow: GET /api/github-profile/connect → github.com/login/oauth/authorize (prompt=select_account, so GitHub always
// shows its page and the learner can pick another account) → GET /api/auth/callback/github, the GitHub app's registered
// callback, which tells this flow from Better Auth's by the state in the link cookie.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { account } from "@codi-1/db/schema/auth";

export const PROFILE_PROVIDER = "github-profile";
/** Rows that can back the skill profile: the Codi-owned link first, then a "Sign in with GitHub" account. */
export const PROFILE_PROVIDERS = [PROFILE_PROVIDER, "github"] as const;
export const LINK_COOKIE = "codi_gh_link";
export const CALLBACK_PATH = "/api/auth/callback/github";
const SCOPE = "read:user";
const STATE_TTL_S = 600;

/** Same-site path only ("/x", never "//x", "/\x" or control characters); anything else returns to the profile tab. */
export function safeReturnTo(value: string | null | undefined): string {
  const ok = typeof value === "string" && value.length <= 512 && /^\/(?![/\\])/.test(value) && !/[\u0000-\u001f\\]/.test(value);
  return ok ? value : "/profile?tab=nang-luc";
}

/** `returnTo` with `key=value` set (replacing an earlier one), still a same-site path. */
export function withParam(returnTo: string, key: string, value: string): string {
  const url = new URL(returnTo, "http://codi.local");
  url.searchParams.delete("error");
  url.searchParams.delete("github");
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

type LinkState = { state: string; userId: string; returnTo: string };

export function newLinkState(userId: string, returnTo: string): LinkState {
  return { state: randomBytes(24).toString("base64url"), userId, returnTo };
}

export const encodeLinkState = (s: LinkState) => Buffer.from(JSON.stringify(s)).toString("base64url");

export function decodeLinkState(raw: string | undefined): LinkState | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof v?.state !== "string" || typeof v.userId !== "string" || typeof v.returnTo !== "string") return null;
    return { state: v.state, userId: v.userId, returnTo: safeReturnTo(v.returnTo) };
  } catch {
    return null;
  }
}

export function sameState(a: string, b: string | null): boolean {
  if (!b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const linkCookie = (value: string, secure: boolean, maxAge = STATE_TTL_S) =>
  `${LINK_COOKIE}=${value}; Path=${CALLBACK_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export class GithubLinkError extends Error {}

type FetchLike = typeof fetch;

/**
 * Token fields of a GitHub OAuth response. A GitHub App with expiring user tokens returns an 8-hour access token plus a
 * single-use refresh token (about 6 months); an OAuth App returns only the access token, so the rest stays null.
 */
export type GithubTokenSet = { accessToken: string; refreshToken: string | null; accessTokenExpiresAt: Date | null; refreshTokenExpiresAt: Date | null };
/** Refresh a little before GitHub's expiry so a long collection run does not start on a token that dies midway. */
const REFRESH_EARLY_MS = 5 * 60 * 1000;

function tokenSet(body: Record<string, unknown> | null, now: number): GithubTokenSet | null {
  if (typeof body?.access_token !== "string" || !body.access_token) return null;
  const seconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(now + v * 1000) : null);
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    accessTokenExpiresAt: seconds(body.expires_in),
    refreshTokenExpiresAt: seconds(body.refresh_token_expires_in),
  };
}

/** True when the stored access token is expired or about to expire (tokens without an expiry never need it). */
export function needsRefresh(accessTokenExpiresAt: Date | null, now = Date.now()): boolean {
  return !!accessTokenExpiresAt && accessTokenExpiresAt.getTime() - REFRESH_EARLY_MS <= now;
}

/** Trades a refresh token for a new token set. Null when GitHub refuses it (expired, revoked or already used). */
export async function refreshGithubToken(
  input: { clientId: string; clientSecret: string; refreshToken: string },
  fetcher: FetchLike = fetch,
  now = Date.now(),
): Promise<GithubTokenSet | null> {
  const res = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, grant_type: "refresh_token", refresh_token: input.refreshToken }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return tokenSet((await res.json().catch(() => null)) as Record<string, unknown> | null, now);
}

/** Exchanges the code and reads the GitHub user. Throws GithubLinkError without echoing any token. */
export async function exchangeCode(
  input: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetcher: FetchLike = fetch,
): Promise<GithubTokenSet & { scope: string; githubUserId: string; login: string }> {
  const signal = AbortSignal.timeout(15000);
  const tokenRes = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri }),
    signal,
  });
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: unknown; scope?: unknown } | null;
  const tokens = tokenRes.ok ? tokenSet(token as Record<string, unknown> | null, Date.now()) : null;
  if (!tokens || typeof token?.access_token !== "string") throw new GithubLinkError("token_exchange_failed");
  const userRes = await fetcher("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`, "User-Agent": "codi-github-profile" },
    signal,
  });
  const gh = (await userRes.json().catch(() => null)) as { id?: unknown; login?: unknown } | null;
  if (!userRes.ok || typeof gh?.id !== "number" || !Number.isSafeInteger(gh.id) || gh.id <= 0) throw new GithubLinkError("user_read_failed");
  return {
    ...tokens,
    scope: typeof token.scope === "string" ? token.scope : SCOPE,
    githubUserId: String(gh.id),
    login: typeof gh.login === "string" ? gh.login : "",
  };
}

/**
 * Stores the profile link for `userId`: one "github-profile" row per Codi user, replaced when the learner connects
 * another GitHub. Other Codi users holding the same GitHub id are not touched.
 */
export async function saveProfileLink(
  database: Database,
  input: { userId: string; githubUserId: string; scope: string } & GithubTokenSet,
): Promise<void> {
  await database.transaction(async (tx) => {
    const rows = await tx.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, input.userId), eq(account.providerId, PROFILE_PROVIDER))).for("update");
    const values = { accountId: input.githubUserId, accessToken: input.accessToken, refreshToken: input.refreshToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt, refreshTokenExpiresAt: input.refreshTokenExpiresAt, scope: input.scope, updatedAt: new Date() };
    if (rows.length) {
      await tx.update(account).set(values).where(eq(account.id, rows[0]!.id));
      if (rows.length > 1) await tx.delete(account).where(inArray(account.id, rows.slice(1).map((r) => r.id)));
    } else {
      await tx.insert(account).values({ id: randomUUID(), userId: input.userId, providerId: PROFILE_PROVIDER, ...values });
    }
  });
}

/**
 * The token of a Codi-owned profile link (null for any other row, or another user's row). An expiring token is
 * refreshed first when the app credentials are given: the row is locked so two jobs never spend the same single-use
 * refresh token, and the rotated pair is saved. If GitHub refuses the refresh, the old token is returned and the
 * collector reports connection_expired as before (the learner reconnects).
 */
export async function readProfileLinkToken(
  database: Database,
  userId: string,
  accountRowId: string,
  app?: { clientId: string; clientSecret: string; fetcher?: FetchLike },
): Promise<string | null> {
  const where = and(eq(account.id, accountRowId), eq(account.userId, userId), eq(account.providerId, PROFILE_PROVIDER));
  const cols = { accessToken: account.accessToken, refreshToken: account.refreshToken, accessTokenExpiresAt: account.accessTokenExpiresAt };
  const [row] = await database.select(cols).from(account).where(where).limit(1);
  if (!row || !app?.clientId || !app.clientSecret || !row.refreshToken || !needsRefresh(row.accessTokenExpiresAt)) return row?.accessToken ?? null;
  return database.transaction(async (tx) => {
    const [locked] = await tx.select(cols).from(account).where(where).for("update");
    if (!locked) return null;
    // Another job may have refreshed while this one waited for the lock.
    if (!locked.refreshToken || !needsRefresh(locked.accessTokenExpiresAt)) return locked.accessToken;
    const next = await refreshGithubToken({ clientId: app.clientId, clientSecret: app.clientSecret, refreshToken: locked.refreshToken }, app.fetcher);
    if (!next) return locked.accessToken;
    await tx.update(account).set({ accessToken: next.accessToken, refreshToken: next.refreshToken ?? locked.refreshToken,
      accessTokenExpiresAt: next.accessTokenExpiresAt, ...(next.refreshTokenExpiresAt ? { refreshTokenExpiresAt: next.refreshTokenExpiresAt } : {}),
      updatedAt: new Date() }).where(where);
    return next.accessToken;
  });
}

export async function isProfileLinkRow(database: Database, accountRowId: string): Promise<boolean> {
  const [row] = await database.select({ n: sql<number>`1` }).from(account)
    .where(and(eq(account.id, accountRowId), eq(account.providerId, PROFILE_PROVIDER))).limit(1);
  return !!row;
}

/** Removes the Codi-owned profile link rows of `userId` (cascades to github_profiles). */
export async function deleteProfileLink(database: Database, userId: string): Promise<void> {
  await database.delete(account).where(and(eq(account.userId, userId), eq(account.providerId, PROFILE_PROVIDER)));
}
