import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AccountSettings from "@/components/settings/account-settings";
import { auth } from "@/services";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <AccountSettings user={session.user} currentSessionId={session.session.id} />;
}
