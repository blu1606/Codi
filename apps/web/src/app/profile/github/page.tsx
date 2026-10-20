import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveRoles, ROLE } from "@codi-1/auth";

import { auth, db } from "@/services";
import GithubProfilePanel from "@/components/profile/github-profile-panel";

export default async function GithubProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const roles = await getActiveRoles(db, session.user.id);
  if (!roles.includes(ROLE.LEARNER)) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/profile"
          className="text-sm text-primary underline underline-offset-4"
        >
          Quay lại hồ sơ cá nhân
        </Link>
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Hồ sơ năng lực từ GitHub</h1>
          <p className="text-sm text-muted-foreground">
            Chỉ bạn xem được kết quả của mình. Kết nối và phân tích luôn là tuỳ
            chọn.
          </p>
        </header>
        <GithubProfilePanel />
      </div>
    </main>
  );
}
