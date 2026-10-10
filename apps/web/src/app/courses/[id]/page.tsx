import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock, Users, GraduationCap, CheckCircle2, Star, PlayCircle } from "lucide-react";
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
            <p className="text-xl text-muted-foreground mb-4">
              {course.description}
            </p>
            {course.rating && course.reviewCount && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center text-amber-500">
                  <Star className="h-4 w-4 fill-current" />
                  <span className="ml-1 font-semibold">{course.rating.toFixed(1)}</span>
                </div>
                <span>({course.reviewCount} đánh giá)</span>
              </div>
            )}
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

          {course.chapters && course.chapters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Chương trình học</CardTitle>
                <CardDescription>
                  Chi tiết các bài học và thời lượng
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {course.chapters.map((chapter, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-3 font-semibold border-b">
                      {chapter.title}
                    </div>
                    <div className="divide-y">
                      {chapter.lessons.map((lesson, idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <PlayCircle className="h-4 w-4 text-primary" />
                            <span className="text-sm">{lesson.title}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {lesson.isPreview && (
                              <span className="text-xs text-primary font-medium border border-primary/20 bg-primary/10 px-2 py-0.5 rounded-full">
                                Học thử
                              </span>
                            )}
                            <span>{lesson.duration}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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

          {course.instructor && (
            <Card>
              <CardHeader>
                <CardTitle>Giảng viên</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={course.instructor.avatarUrl} 
                      alt={course.instructor.name}
                      className="w-24 h-24 rounded-full object-cover border-2 border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">{course.instructor.name}</h3>
                    <p className="text-primary font-medium">{course.instructor.title}</p>
                    <p className="text-muted-foreground mt-2 leading-relaxed">
                      {course.instructor.bio}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
              <EnrollButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}