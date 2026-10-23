import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { endSession } from "./session-requests";

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export function signOutSession(sessionId: string) {
  return endSession(sessionId, () => authClient.signOut());
}
