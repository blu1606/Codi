import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";

export async function learnerPageSession(returnPath: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?callbackURL=${encodeURIComponent(returnPath)}`);
  return (await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER)
    ? session
    : null;
}

export async function learnerPageAllowed(returnPath: string) {
  return !!(await learnerPageSession(returnPath));
}
