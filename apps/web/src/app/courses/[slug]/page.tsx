import CourseDetailView from "@/components/courses/course-detail-view";

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseDetailView key={slug} slug={slug} />;
}
