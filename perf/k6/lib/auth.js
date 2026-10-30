// Better Auth email sign-in. k6 keeps cookies in the VU's own jar, so a VU signs in once and
// every later request of that VU carries the session. Module state is per VU, so the flag
// below is never shared between VUs.
import { check } from "k6";
import { call } from "./http.js";
import { accountForVu } from "../data/accounts.js";

let signedIn = false;

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
