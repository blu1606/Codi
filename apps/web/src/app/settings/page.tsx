import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AccountSettings, { type SettingsTab } from "@/components/settings/account-settings";
import { loadGithubConnectionState } from "@/components/profile/github-profile-page-state";
import { createGithubProfileStore } from "@/lib/github-profile-store";
import { auth, db } from "@/services";

function resolveTab(tab: string | undefined): SettingsTab {
  if (tab === "security" || tab === "connections") return tab;
  return "account";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { tab } = await searchParams;
  const initialTab = resolveTab(tab);
  // Read-only link status for the "Tài khoản liên kết" section; the profile itself lives in /profile.
  const githubConnection =
    initialTab === "connections"
      ? await loadGithubConnectionState(createGithubProfileStore(db), session.user.id)
      : undefined;

  // key remounts the tab state when the ?tab= query changes.
  return (
    <AccountSettings
      key={initialTab}
      user={session.user}
      initialTab={initialTab}
      githubConnection={githubConnection}
    />
  );
}
