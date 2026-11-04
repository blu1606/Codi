import { NextRequest, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth, db } from "@/services";
import { ENV } from "@/env.server";
import {
  CALLBACK_PATH,
  decodeLinkState,
  exchangeCode,
  LINK_COOKIE,
  linkCookie,
  sameState,
  saveProfileLink,
  withParam,
} from "@/lib/github-profile-link";

export const runtime = "nodejs";

const betterAuth = toNextJsHandler(auth);

/**
 * GitHub's OAuth callback (the URL registered on the GitHub app, which must match exactly). A redirect whose state
 * matches the skill-profile link cookie set by /api/github-profile/connect is handled here: the link is stored as the
 * learner's own "github-profile" account row and the browser returns with ?github=linked or ?error=<code>. Every
 * other callback (Sign in with GitHub, Better Auth linking) goes to Better Auth unchanged.
 */
export async function GET(request: NextRequest) {
  const saved = decodeLinkState(request.cookies.get(LINK_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  if (!saved || !sameState(saved.state, params.get("state"))) return betterAuth.GET(request);

  const redirectUri = new URL(CALLBACK_PATH, ENV.BETTER_AUTH_URL).toString();
  const finish = (key: string, value: string) => {
    const res = NextResponse.redirect(new URL(withParam(saved.returnTo, key, value), request.nextUrl.origin));
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.append("Set-Cookie", linkCookie("", redirectUri.startsWith("https:"), 0));
    return res;
  };

  if (params.get("error")) return finish("error", params.get("error") === "access_denied" ? "denied" : "failed");
  const code = params.get("code");
  if (!code || code.length > 512 || !ENV.GITHUB_CLIENT_ID || !ENV.GITHUB_CLIENT_SECRET) return finish("error", "failed");

  // The flow belongs to the Codi user who started it; a sign-out or account switch in between cancels it.
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (session?.user?.id !== saved.userId) return finish("error", "session_changed");

  try {
    const gh = await exchangeCode({ clientId: ENV.GITHUB_CLIENT_ID, clientSecret: ENV.GITHUB_CLIENT_SECRET, code, redirectUri });
    await saveProfileLink(db, { userId: saved.userId, githubUserId: gh.githubUserId, accessToken: gh.accessToken, scope: gh.scope });
    return finish("github", "linked");
  } catch (error) {
    console.error("[github-profile] link failed", error instanceof Error ? error.message : "unknown");
    return finish("error", "failed");
  }
}

export const POST = (request: NextRequest) => betterAuth.POST(request);
