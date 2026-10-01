import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock, Users, GraduationCap, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { SEED_COURSES } from "@/lib/data/courses";
import EnrollButton from "./enroll-button";

interface CourseDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = await params;

  // Find by ID or Slug
  const course = SEED_COURSES.find(c => c.id === id || c.slug === id);

  if (!course) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10 px-4 md:px-6">
      <Link
        href="/courses"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Quay lại danh sách khóa học
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary text-primary-foreground mb-4">
              {course.category}
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              {course.title}
            </h1>
            <p className="text-xl text-muted-foreground">
              {course.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Clock className="mr-2 h-4 w-4" />
              {course.duration}
            </div>
            <div className="flex items-center">
              <GraduationCap className="mr-2 h-4 w-4" />
              {course.level}
            </div>
            <div className="flex items-center">
              <Users className="mr-2 h-4 w-4" />
              {course.targetAudience}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nội dung khóa học</CardTitle>
              <CardDescription>
                Các chủ đề chính bạn sẽ học trong khóa học này
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {course.topics.map((topic, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle2 className="mr-2 h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span>{topic}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yêu cầu đầu vào</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-center">
                <BookOpen className="mr-2 h-5 w-5 text-muted-foreground" />
                {course.prerequisites}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Đăng ký khóa học</CardTitle>
              <CardDescription>
                Bắt đầu hành trình học tập của bạn ngay hôm nay
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold">Miễn phí</div>
              <p className="text-sm text-muted-foreground">
                Tất cả các khóa học hiện đang trong giai đoạn thử nghiệm và được cung cấp miễn phí.
              </p>
              <EnrollButton courseTitle={course.title} />
              
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

