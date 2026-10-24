import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getFeedbackSnippets } from "../../snippets/actions";
import { getGradingQueueData } from "../actions";
import { GradingQueueClient } from "../grading-queue-client";

interface GradingDetailPageProps {
  params: Promise<{
    submissionId: string;
  }>;
  searchParams: Promise<{
    status?: string;
    course?: string;
    assignment?: string;
    date?: string;
  }>;
}

export default async function LecturerGradingDetailPage({
  params,
  searchParams,
}: GradingDetailPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const [resolvedParams, resolvedSearch] = await Promise.all([
    params,
    searchParams,
  ]);

  const submissionId = Number(resolvedParams.submissionId);
  const status = resolvedSearch.status === "graded" ? "graded" : "pending";
  const courseId = resolvedSearch.course || "all";
  const assignmentId = resolvedSearch.assignment || "all";
  const date = resolvedSearch.date || "all";

  const [queueData, snippets] = await Promise.all([
    getGradingQueueData({
      status,
      courseId,
      assignmentId,
      date,
      submissionId: isNaN(submissionId) ? undefined : submissionId,
    }),
    getFeedbackSnippets(),
  ]);

  return <GradingQueueClient data={queueData} snippets={snippets} />;
}
