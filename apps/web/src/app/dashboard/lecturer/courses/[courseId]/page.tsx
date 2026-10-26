import { redirect } from "next/navigation";

interface CoursePageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const { courseId } = await params;
  redirect(`/dashboard/lecturer/courses/${courseId}/content`);
}
