import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { loadGithubProfilePageState } from "@/components/profile/github-profile-page-state";
import { createGithubProfileStore } from "@/lib/github-profile-store";
import { resolveProfileTab } from "./profile-tabs";
import { ProfileView } from "./profile-view";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const activeRoles = await getActiveRoles(db, session.user.id);
  const params = await searchParams;
  const isLearner = activeRoles.includes(ROLE.LEARNER);
  const tab = resolveProfileTab(params.tab, isLearner);
  // The GitHub profile is only read when its tab is open.
  const github =
    tab === "nang-luc"
      ? await loadGithubProfilePageState(
          createGithubProfileStore(db),
          session.user.id,
          params.error,
        )
      : null;

  return (
    <ProfileView
      user={session.user}
      roles={activeRoles}
      activeTab={tab}
      github={github}
    />
  );
}
