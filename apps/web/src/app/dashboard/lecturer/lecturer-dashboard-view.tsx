import Link from "next/link";
import { ArrowRight, BookOpen, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { StatCard } from "@codi-1/ui/components/stat-card";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { cn } from "@codi-1/ui/lib/utils";
import { COURSE_LEVEL_LABELS, type CourseLevel } from "@/lib/course-constants";
import type { LecturerCounts, LecturerCourseItem } from "./actions";

type LecturerDashboardViewProps = {
  userName?: string | null;
  counts: LecturerCounts;
  rejectedCourseAlert?: { id: string; title: string; rejectReason: string } | null;
  courses: LecturerCourseItem[];
};

/** Presentational S20 home; the RSC page loads the data and passes it in. */
export function LecturerDashboardView({ userName, counts, rejectedCourseAlert, courses }: LecturerDashboardViewProps) {
  const recentCourses = courses.slice(0, 4);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header trang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Tổng quan giảng dạy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chào {userName || "Giảng viên"}. Đây là những việc đang chờ bạn.
          </p>
        </div>
        <div>
          <Link
            href="/dashboard/lecturer/new"
            className={cn(buttonVariants({ variant: "default" }), "gap-2 shadow-xs")}
          >
            <Plus className="size-4" />
            Tạo khóa học
          </Link>
        </div>
      </div>

      {/* Cảnh báo khoá học bị từ chối xuất bản */}
      {rejectedCourseAlert && (
        <Alert variant="destructive">
          <AlertTitle className="text-base font-semibold">
            &ldquo;{rejectedCourseAlert.title}&rdquo; bị từ chối xuất bản
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>Lý do từ chối: {rejectedCourseAlert.rejectReason}</span>
            <Link
              href={`/dashboard/lecturer/courses/${rejectedCourseAlert.id}/publish`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "shrink-0 gap-1.5 cursor-pointer"
              )}
            >
              Sửa và gửi lại
              <ArrowRight className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* 3 việc cần làm chính */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          value={counts.grading}
          label="Bài chờ chấm"
          action={<Link href={"/dashboard/lecturer/grading" as any} className="hover:underline">Mở hàng chờ →</Link>}
        />
        <StatCard
          value={counts.questions}
          label="Câu hỏi chưa trả lời"
          action={<Link href={"/dashboard/lecturer/questions" as any} className="hover:underline">Trả lời →</Link>}
        />
        <StatCard
          value={counts.reviews}
          label="Đánh giá chưa phản hồi"
          action={<Link href={"/dashboard/lecturer/reviews" as any} className="hover:underline">Phản hồi →</Link>}
        />
      </div>

      {/* 4 thẻ phân loại khoá học theo trạng thái */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Khoá học theo trạng thái</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            value={counts.byStatus.draft}
            label="Bản nháp"
            action={<Link href="/dashboard/lecturer/courses?status=draft" className="hover:underline">Xem →</Link>}
          />
          <StatCard
            value={counts.byStatus.pending}
            label="Chờ duyệt"
            action={<Link href="/dashboard/lecturer/courses?status=pending" className="hover:underline">Xem →</Link>}
          />
          <StatCard
            value={counts.byStatus.rejected}
            label="Bị từ chối"
            action={<Link href="/dashboard/lecturer/courses?status=rejected" className="hover:underline">Xem →</Link>}
          />
          <StatCard
            value={counts.byStatus.published}
            label="Đã xuất bản"
            action={<Link href="/dashboard/lecturer/courses?status=published" className="hover:underline">Xem →</Link>}
          />
        </div>
      </div>

      {/* Danh sách khoá học gần đây */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Khoá học của tôi</h2>
          {courses.length > 0 && (
            <Link
              href="/dashboard/lecturer/courses"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
            >
              Xem tất cả ({courses.length})
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>

        {recentCourses.length === 0 ? (
          <Card className="border border-dashed border-border/80">
            <CardContent className="p-0">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpen className="size-5 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>Bạn chưa có khoá học nào</EmptyTitle>
                  <EmptyDescription>
                    Tạo khoá học đầu tiên chỉ với tên, mô tả ngắn, danh mục và trình độ. Bạn có thể bổ sung nội dung sau.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    href="/dashboard/lecturer/new"
                    className={cn(buttonVariants({ variant: "default" }), "gap-2")}
                  >
                    <Plus className="size-4" />
                    Tạo khóa học
                  </Link>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {recentCourses.map((c) => (
              <Card key={c.id} className="border border-border/80 hover:border-border transition-colors">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Link
                        href={`/dashboard/lecturer/courses/${c.id}`}
                        className="font-semibold text-foreground text-base hover:underline hover:text-primary transition-colors"
                      >
                        {c.title}
                      </Link>
                      <StatusBadge kind="course" status={c.status} />
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{c.chaptersCount} chương</span>
                      <span>•</span>
                      <span>{c.lessonsCount} bài</span>
                      <span>•</span>
                      <span>{c.learnersCount} học viên</span>
                      <span>•</span>
                      <span>Trình độ: {COURSE_LEVEL_LABELS[c.level as CourseLevel] || c.level}</span>
                    </div>

                    {c.status === "rejected" && c.rejectReason && (
                      <p className="text-xs text-destructive font-medium line-clamp-2">
                        Lý do từ chối: {c.rejectReason}
                      </p>
                    )}

                    {c.status === "hidden" && c.hideReason && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Lý do ẩn: {c.hideReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={
                        c.status === "rejected"
                          ? `/dashboard/lecturer/courses/${c.id}/publish`
                          : `/dashboard/lecturer/courses/${c.id}`
                      }
                      className={cn(
                        buttonVariants({
                          variant: c.status === "rejected" ? "default" : "outline",
                          size: "sm",
                        }),
                        "gap-1 cursor-pointer"
                      )}
                    >
                      {c.status === "rejected" ? (
                        "Sửa và gửi lại"
                      ) : (
                        <>
                          Mở
                          <ArrowRight className="size-3.5" />
                        </>
                      )}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
