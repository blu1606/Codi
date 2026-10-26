import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getQuizBuilderData } from "../../actions";
import { QuizBuilderClient } from "./quiz-builder-client";

interface QuizBuilderPageProps {
  params: Promise<{
    courseId: string;
    lessonId: string;
  }>;
}

export default async function QuizBuilderPage({ params }: QuizBuilderPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const { courseId, lessonId } = await params;

  try {
    const data = await getQuizBuilderData(courseId, lessonId);
    return (
      <QuizBuilderClient
        courseId={courseId}
        lessonId={lessonId}
        initialData={data}
      />
    );
  } catch {
    notFound();
  }
}
