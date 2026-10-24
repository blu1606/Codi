import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getLecturerReviewsData } from "./actions";
import { ReviewsClient } from "./reviews-client";

interface ReviewsPageProps {
  searchParams: Promise<{
    filter?: string;
  }>;
}

export default async function LecturerReviewsPage({
  searchParams,
}: ReviewsPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const resolved = await searchParams;
  const filter = resolved.filter === "unreplied" ? "unreplied" : "all";

  const data = await getLecturerReviewsData({ filter });

  return <ReviewsClient initialData={data} />;
}
