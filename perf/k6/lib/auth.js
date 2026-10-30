// Better Auth email sign-in. Scripts set `noCookiesReset: true`, so k6 keeps the VU's cookie jar
// across iterations and a VU signs in once. Module state is per VU, so the flag below is never
// shared between VUs. When a protected request returns 401, journey.js calls invalidateSession()
// and the next iteration signs in again.
//
// Better Auth rate-limits sign-in per IP, and every VU of a run shares the runner's IP. A 429 is
// the protection working, not an app failure: wait for the window the server names and retry.
import { check, sleep } from "k6";
import { call } from "./http.js";
import { accountForVu } from "../data/accounts.js";

const MAX_SIGN_IN_ATTEMPTS = 20;

let signedIn = false;

export function invalidateSession() {
  signedIn = false;
}

function retryAfterSeconds(res) {
  const header = Number(res.headers["X-Retry-After"] || res.headers["Retry-After"]);
  // Jitter spreads VUs that were throttled together across the next window.
  return (Number.isFinite(header) && header > 0 ? header : 10) + Math.random() * 3;
}

export function ensureSignedIn() {
  if (signedIn) return accountForVu();
  const account = accountForVu();
  let res;
  for (let attempt = 1; attempt <= MAX_SIGN_IN_ATTEMPTS; attempt++) {
    res = call("POST", "/api/auth/sign-in/email", {
      type: "auth",
      name: "POST /api/auth/sign-in/email",
      origin: true,
      body: { email: account.email, password: account.password },
      expected: [200, 429],
    });
    if (res.status !== 429) break;
    sleep(retryAfterSeconds(res));
  }
  signedIn = check(res, { "signed in (200)": (r) => r.status === 200 });
  if (!signedIn) throw new Error(`sign-in failed for VU ${__VU}: HTTP ${res.status}`);
  return account;
}
