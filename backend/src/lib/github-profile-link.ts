// GitHub link for the skill profile, owned by Codi rather than Better Auth.
//
// Better Auth keeps one owner per GitHub identity (provider "github"), which is right for "Sign in with GitHub" but
// stops two Codi accounts (say a learner's school and personal accounts) from analysing the same GitHub. The profile
// link is therefore stored as its own account row, provider "github-profile": several Codi users may hold a row for
// the same GitHub id, and Better Auth never resolves sign-ins through it (no such social provider is configured).
//
// Flow: GET /api/github-profile/connect → github.com/login/oauth/authorize (prompt=select_account, so GitHub always
// shows its page and the learner can pick another account) → GET /api/auth/callback/github/profile. The callback
// path sits under the OAuth app's registered callback URL (/api/auth/callback/github), which GitHub requires.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { account } from "@codi-1/db/schema/auth";

export const PROFILE_PROVIDER = "github-profile";
/** Rows that can back the skill profile: the Codi-owned link first, then a "Sign in with GitHub" account. */
export const PROFILE_PROVIDERS = [PROFILE_PROVIDER, "github"] as const;
export const LINK_COOKIE = "codi_gh_link";
export const CALLBACK_PATH = "/api/auth/callback/github/profile";
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

/** Exchanges the code and reads the GitHub user. Throws GithubLinkError without echoing any token. */
export async function exchangeCode(
  input: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetcher: FetchLike = fetch,
): Promise<{ accessToken: string; scope: string; githubUserId: string; login: string }> {
  const signal = AbortSignal.timeout(15000);
  const tokenRes = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri }),
    signal,
  });
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: unknown; scope?: unknown } | null;
  if (!tokenRes.ok || typeof token?.access_token !== "string" || !token.access_token) throw new GithubLinkError("token_exchange_failed");
  const userRes = await fetcher("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`, "User-Agent": "codi-github-profile" },
    signal,
  });
  const gh = (await userRes.json().catch(() => null)) as { id?: unknown; login?: unknown } | null;
  if (!userRes.ok || typeof gh?.id !== "number" || !Number.isSafeInteger(gh.id) || gh.id <= 0) throw new GithubLinkError("user_read_failed");
  return {
    accessToken: token.access_token,
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
  input: { userId: string; githubUserId: string; accessToken: string; scope: string },
): Promise<void> {
  await database.transaction(async (tx) => {
    const rows = await tx.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, input.userId), eq(account.providerId, PROFILE_PROVIDER))).for("update");
    const values = { accountId: input.githubUserId, accessToken: input.accessToken, scope: input.scope, updatedAt: new Date() };
    if (rows.length) {
      await tx.update(account).set(values).where(eq(account.id, rows[0]!.id));
      if (rows.length > 1) await tx.delete(account).where(inArray(account.id, rows.slice(1).map((r) => r.id)));
    } else {
      await tx.insert(account).values({ id: randomUUID(), userId: input.userId, providerId: PROFILE_PROVIDER, ...values });
    }
  });
}

/** The stored token of a Codi-owned profile link (null for any other row, or another user's row). */
export async function readProfileLinkToken(database: Database, userId: string, accountRowId: string): Promise<string | null> {
  const [row] = await database.select({ accessToken: account.accessToken }).from(account)
    .where(and(eq(account.id, accountRowId), eq(account.userId, userId), eq(account.providerId, PROFILE_PROVIDER))).limit(1);
  return row?.accessToken ?? null;
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
