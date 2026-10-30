// Better Auth email sign-in. Scripts set `noCookiesReset: true`, so k6 keeps the VU's cookie jar
// across iterations and a VU signs in once. Module state is per VU, so the flag below is never
// shared between VUs. When a protected request returns 401, journey.js calls invalidateSession()
// and the next iteration signs in again.
import { check } from "k6";
import { call } from "./http.js";
import { accountForVu } from "../data/accounts.js";

let signedIn = false;

export function invalidateSession() {
  signedIn = false;
}

export function ensureSignedIn() {
  if (signedIn) return accountForVu();
  const account = accountForVu();
  const res = call("POST", "/api/auth/sign-in/email", {
    type: "auth",
    name: "POST /api/auth/sign-in/email",
    origin: true,
    body: { email: account.email, password: account.password },
  });
  signedIn = check(res, { "signed in (200)": (r) => r.status === 200 });
  if (!signedIn) throw new Error(`sign-in failed for VU ${__VU}: HTTP ${res.status}`);
  return account;
}
