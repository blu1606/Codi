import Link from "next/link";
import { ArrowLeft, BookX } from "lucide-react";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { getCourseLearnerProgress } from "../actions";
import { CourseProgressClient } from "../course-progress-client";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseProgressDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const data = await getCourseLearnerProgress(courseId);

  if (!data) {
    return (
      <div className="space-y-6">
        <Link
          href={"/dashboard/lecturer/progress" as any}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Tất cả khoá học</span>
        </Link>

        <Card className="border border-border/80">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 bg-muted rounded-full text-muted-foreground">
              <BookX className="size-8" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold">Khoá học không tồn tại</h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                Không tìm thấy thông tin khoá học hoặc bạn không có quyền xem tiến độ của khoá này.
              </p>
            </div>
            <Link
              href={"/dashboard/lecturer/progress" as any}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Quay lại danh sách
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CourseProgressClient data={data} />;
}
