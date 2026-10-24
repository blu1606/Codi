import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getLecturerQuestionsData } from "./actions";
import { QuestionsInboxClient } from "./questions-inbox-client";

interface QuestionsPageProps {
  searchParams: Promise<{
    view?: string;
    status?: string;
    id?: string;
  }>;
}

export default async function LecturerQuestionsPage({
  searchParams,
}: QuestionsPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const resolved = await searchParams;
  const view = resolved.view === "conversations" ? "conversations" : "questions";
  const status = resolved.status === "answered" ? "answered" : "unanswered";

  const data = await getLecturerQuestionsData({
    view,
    status,
    id: resolved.id,
  });

  return <QuestionsInboxClient initialData={data} />;
}
