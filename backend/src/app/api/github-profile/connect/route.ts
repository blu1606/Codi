import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { ENV } from "@/env.server";
import {
  authorizeUrl,
  CALLBACK_PATH,
  encodeLinkState,
  linkCookie,
  newLinkState,
  safeReturnTo,
  withParam,
} from "@/lib/github-profile-link";

export const runtime = "nodejs";

/**
 * GET /api/github-profile/connect?returnTo=/path — a top-level navigation that sends the signed-in learner straight
 * to GitHub's authorize page. Any GitHub account may be chosen, even one already linked to another Codi account.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const back = (code: string) => NextResponse.redirect(new URL(withParam(returnTo, "error", code), request.nextUrl.origin));
  if (!ENV.GITHUB_CLIENT_ID || !ENV.GITHUB_CLIENT_SECRET) return back("not_configured");
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session?.user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, request.nextUrl.origin));
  const roles = await getActiveRoles(db, session.user.id);
  if (!roles.includes(ROLE.LEARNER)) return back("unauthorized");

  const state = newLinkState(session.user.id, returnTo);
  const redirectUri = new URL(CALLBACK_PATH, ENV.BETTER_AUTH_URL).toString();
  const res = NextResponse.redirect(authorizeUrl(ENV.GITHUB_CLIENT_ID, redirectUri, state.state));
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.append("Set-Cookie", linkCookie(encodeLinkState(state), redirectUri.startsWith("https:")));
  return res;
}
