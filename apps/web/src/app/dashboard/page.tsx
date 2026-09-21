import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "../../services";
import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <Dashboard session={session} />;
}
