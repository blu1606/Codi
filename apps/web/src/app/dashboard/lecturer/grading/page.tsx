import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getFeedbackSnippets } from "../snippets/actions";
import { getGradingQueueData } from "./actions";
import { GradingQueueClient } from "./grading-queue-client";

interface GradingPageProps {
  searchParams: Promise<{
    status?: string;
    course?: string;
    submissionId?: string;
  }>;
}

export default async function LecturerGradingPage({ searchParams }: GradingPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const resolved = await searchParams;
  const status = resolved.status === "graded" ? "graded" : "pending";
  const courseId = resolved.course || "all";
  const submissionId = resolved.submissionId ? Number(resolved.submissionId) : undefined;

  const [queueData, snippets] = await Promise.all([
    getGradingQueueData({
      status,
      courseId,
      submissionId: isNaN(submissionId as number) ? undefined : submissionId,
    }),
    getFeedbackSnippets(),
  ]);

  return <GradingQueueClient data={queueData} snippets={snippets} />;
}
