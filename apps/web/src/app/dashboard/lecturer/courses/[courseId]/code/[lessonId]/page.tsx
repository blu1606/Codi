import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getCodingExerciseData } from "../actions";
import { CodingBuilderClient } from "./coding-builder-client";

interface CodingExercisePageProps {
  params: Promise<{
    courseId: string;
    lessonId: string;
  }>;
}

export default async function CodingExerciseBuilderPage({
  params,
}: CodingExercisePageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const { courseId, lessonId } = await params;

  try {
    const data = await getCodingExerciseData(courseId, lessonId);
    return (
      <CodingBuilderClient
        courseId={courseId}
        lessonId={lessonId}
        initialData={data}
      />
    );
  } catch {
    notFound();
  }
}
