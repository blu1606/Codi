import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import {
  getAdminCourseReview,
  getAdminPublicationQueue,
  type AdminCourseReviewDetailDto,
} from "./actions";
import { PublicationReviewClient } from "./publication-review-client";

interface AdminPublicationPageProps {
  searchParams: Promise<{
    tab?: string;
    id?: string;
  }>;
}

export default async function AdminPublicationPage({ searchParams }: AdminPublicationPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const params = await searchParams;
  const validTab = ["pending", "changes", "approved"].includes(params.tab || "")
    ? (params.tab as "pending" | "changes" | "approved")
    : "pending";

  const queue = await getAdminPublicationQueue(validTab);

  const selectedCourseId = params.id || queue.items[0]?.id;

  let detail: AdminCourseReviewDetailDto | null = null;
  if (selectedCourseId) {
    try {
      detail = await getAdminCourseReview(selectedCourseId);
    } catch {
      detail = null;
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <PublicationReviewClient
        key={`${selectedCourseId ?? "empty"}_${detail?.round?.id ?? "0"}`}
        queue={queue}
        selectedCourseId={selectedCourseId}
        detail={detail}
      />
    </div>
  );
}
