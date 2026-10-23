import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { FINANCE_UNAVAILABLE } from "@/lib/analytics-contract";

export default async function AnalyticsDetailPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-xl font-semibold">Chi tiết chưa khả dụng</h1>
    <p role="status">{FINANCE_UNAVAILABLE}</p>
    <Link className="text-primary underline" href="/dashboard/admin/finance">Về tổng quan</Link>
  </main>;
}
