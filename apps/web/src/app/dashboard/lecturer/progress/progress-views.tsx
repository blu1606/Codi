import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, BookX, Users } from "lucide-react";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import type { CourseProgressSummaryDto } from "@/lib/lecturer-progress-service";

/** Presentational progress views; the RSC pages load the data and render these. */

export function ProgressCoursesView({ courses }: { courses: CourseProgressSummaryDto[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tiến độ học viên</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chọn khoá học để xem tiến độ và kết quả quiz của học viên.
        </p>
      </div>

      {!courses.length ? (
        <Card className="border border-border/80">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 bg-muted rounded-full text-muted-foreground">
              <BarChart3 className="size-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Chưa có khoá học đang bán
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Tiến độ học viên xuất hiện khi khoá học được xuất bản và có
                người học.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((c) => (
            <Link
              key={c.courseId}
              href={`/dashboard/lecturer/progress/${c.courseId}` as any}
              className="group"
            >
              <Card className="h-full border border-border/70 transition-all hover:border-primary/50 hover:shadow-sm">
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-1">
                        {c.title}
                      </h2>
                      <StatusBadge
                        kind="course"
                        status={c.status as "published" | "hidden"}
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="size-3.5" />
                      <span>{c.learnersCount} học viên</span>
                      <span>·</span>
                      <span>Hoàn thành TB {c.averageCompletionRate}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium text-primary pt-2 border-t border-border/40">
                    <span>Xem chi tiết tiến độ</span>
                    <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown when the course is missing or not visible to the lecturer. */
export function ProgressCourseMissingView() {
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
            <h1 className="text-base font-semibold">
              Khoá học không tồn tại
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm">
              Không tìm thấy thông tin khoá học hoặc bạn không có quyền xem
              tiến độ của khoá này.
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
