import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getCourseEditorData } from "../actions";
import { getKnowledgeMapData } from "../kmap/actions";
import { getPublicationData } from "../publish/actions";
import { CourseEditor } from "../course-editor";

interface CourseTabProps {
  params: Promise<{ courseId: string; tab: string }>;
}

export default async function CourseTabEditorPage({ params }: CourseTabProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const { courseId, tab } = await params;

  const validTabs = ["content", "info", "kmap", "publish"] as const;
  if (!validTabs.includes(tab as any)) {
    redirect(`/dashboard/lecturer/courses/${courseId}/content`);
  }

  const activeTab = tab as (typeof validTabs)[number];

  try {
    const data = await getCourseEditorData(courseId);
    let kmapData = null;
    let publicationData = null;

    if (activeTab === "kmap") {
      kmapData = await getKnowledgeMapData(courseId);
    } else if (activeTab === "publish") {
      publicationData = await getPublicationData(courseId);
    }

    return (
      <CourseEditor
        courseId={courseId}
        activeTab={activeTab}
        data={{ ...data, kmapData, publicationData }}
      />
    );
  } catch (error) {
    console.error("[CourseTabEditorPage] Error loading course tab:", error);
    notFound();
  }
}
