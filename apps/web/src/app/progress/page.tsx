import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import LearnerWorkspace from "@/components/learner-workspace";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  if (!(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER))
    redirect("/dashboard");
  const { tab } = await searchParams;
  return (
    <LearnerWorkspace
      key={session.user.id}
      mode="progress"
      tab={tab === "done" ? "done" : "active"}
    />
  );
}
