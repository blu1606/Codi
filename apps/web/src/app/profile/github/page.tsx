import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveRoles, ROLE } from "@codi-1/auth";

import { auth, db } from "@/services";
import GithubProfilePanel from "@/components/profile/github-profile-panel";
import { createGithubProfileStore } from "@/lib/github-profile-store";
import {
  projectGithubProfile,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";

export default async function GithubProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const roles = await getActiveRoles(db, session.user.id);
  if (!roles.includes(ROLE.LEARNER)) redirect("/dashboard");

  let initialProfile: GithubProfileProjection | null = null;
  let readFailed = false;
  let initialLinked: boolean | null = null;
  const store = createGithubProfileStore(db);
  try {
    const stored = await store.read(session.user.id);
    if (stored)
      initialProfile = projectGithubProfile(
        stored.snapshot,
        stored.analysis,
        stored.corrections,
      );
  } catch {
    readFailed = true;
  }
  const callback = await searchParams;
  const error = callback?.error;
  // Only select local copy from known callback codes; never render provider descriptions.
  const initialLinkError =
    typeof error !== "string"
      ? null
      : error === "access_denied"
        ? "denied"
        : error === "account_already_linked_to_different_user"
          ? "already_linked"
          : "failed";
  try {
    initialLinked = Boolean(await store.getLinkedAccount(session.user.id));
  } catch {
    // Unknown is not the same as unlinked; preserve any independently loaded profile.
  }

  return (
    <main className="min-h-screen bg-background px-4 pt-6 pb-12 text-foreground sm:pt-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <Link
          href="/profile"
          className="text-sm text-primary underline underline-offset-4"
        >
          Quay lại hồ sơ cá nhân
        </Link>
        {readFailed && (
          <p role="alert" className="text-sm text-destructive">
            Chưa tải được hồ sơ đã lưu. Không có lượt phân tích mới nào được bắt
            đầu.
          </p>
        )}
        <GithubProfilePanel
          initialProfile={initialProfile}
          initialLinked={initialLinked}
          initialLinkError={initialLinkError}
        />
      </div>
    </main>
  );
}
