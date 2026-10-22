import { type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getLecturerDashboardStats } from "./actions";
import { LecturerNav } from "./lecturer-nav";

export default async function LecturerLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  let counts;
  try {
    const stats = await getLecturerDashboardStats();
    counts = stats.counts;
  } catch {
    // If querying stats fails, still render the layout gracefully
  }

  return (
    <div className="min-h-screen bg-background">
      <LecturerNav
        counts={{
          grading: counts?.grading,
          questions: counts?.questions,
          reviews: counts?.reviews,
        }}
      />
      <main>{children}</main>
    </div>
  );
}
