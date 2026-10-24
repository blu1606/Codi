import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getFeedbackSnippets } from "./actions";
import { SnippetsClient } from "./snippets-client";

export default async function LecturerSnippetsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const snippets = await getFeedbackSnippets();

  return <SnippetsClient initialSnippets={snippets} />;
}
