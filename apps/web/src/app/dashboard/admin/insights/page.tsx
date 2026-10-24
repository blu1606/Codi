import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { AdminAnalyticsNav } from "../admin-analytics-nav";
import { AdminInsightsView } from "./admin-insights-view";

export default async function AdminInsightsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <AdminAnalyticsNav />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <AdminInsightsView />
      </main>
    </div>
  );
}
