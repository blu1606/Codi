import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  MessageCircle,
  Plus,
  Star,
} from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
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
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { cn } from "@codi-1/ui/lib/utils";
import { auth, db } from "@/services";
import { getLecturerCourses, getLecturerDashboardStats } from "./actions";

export default async function LecturerDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const { counts, rejectedCourseAlert } = await getLecturerDashboardStats();
  const coursesList = await getLecturerCourses("all");
  const recentCourses = coursesList.slice(0, 4);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header trang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan giảng dạy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chào {session.user.name || "Giảng viên"}. Đây là những việc đang chờ bạn.
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
              href={`/dashboard/lecturer/courses/${rejectedCourseAlert.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 gap-1.5")}
            >
              Sửa và gửi lại
              <ArrowRight className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* 3 Thẻ việc cần làm chính (Link tới hàng đợi có bộ lọc) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/dashboard/lecturer/grading" className="group">
          <Card className="h-full border border-border/80 transition-all hover:border-primary/50 hover:shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Bài chờ chấm</span>
                <ClipboardCheck className="size-4 text-primary" />
              </div>
              <div className="text-3xl font-bold tracking-tight">{counts.grading}</div>
              <div className="flex items-center text-xs font-medium text-primary group-hover:underline">
                Mở hàng chờ chấm
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-0.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/lecturer/questions?status=unanswered" className="group">
          <Card className="h-full border border-border/80 transition-all hover:border-primary/50 hover:shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Câu hỏi chưa trả lời</span>
                <MessageCircle className="size-4 text-primary" />
              </div>
              <div className="text-3xl font-bold tracking-tight">{counts.questions}</div>
              <div className="flex items-center text-xs font-medium text-primary group-hover:underline">
                Trả lời học viên
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-0.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/lecturer/reviews?filter=unreplied" className="group">
          <Card className="h-full border border-border/80 transition-all hover:border-primary/50 hover:shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Đánh giá chưa phản hồi</span>
                <Star className="size-4 text-primary" />
              </div>
              <div className="text-3xl font-bold tracking-tight">{counts.reviews}</div>
              <div className="flex items-center text-xs font-medium text-primary group-hover:underline">
                Phản hồi đánh giá
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-0.5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 4 Thẻ phân loại khoá học theo trạng thái */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Khoá học theo trạng thái</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link href="/dashboard/lecturer/courses?status=draft" className="group">
            <Card className="border border-border/60 transition-colors hover:border-border">
              <CardContent className="p-4 flex flex-col justify-between space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Bản nháp</span>
                <div className="text-2xl font-bold">{counts.byStatus.draft}</div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center">
                  Xem danh sách <ArrowRight className="size-3 ml-1" />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/lecturer/courses?status=pending" className="group">
            <Card className="border border-border/60 transition-colors hover:border-border">
              <CardContent className="p-4 flex flex-col justify-between space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Chờ duyệt</span>
                <div className="text-2xl font-bold">{counts.byStatus.pending}</div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center">
                  Xem danh sách <ArrowRight className="size-3 ml-1" />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/lecturer/courses?status=rejected" className="group">
            <Card className="border border-border/60 transition-colors hover:border-border">
              <CardContent className="p-4 flex flex-col justify-between space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Bị từ chối</span>
                <div className="text-2xl font-bold">{counts.byStatus.rejected}</div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center">
                  Xem danh sách <ArrowRight className="size-3 ml-1" />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/lecturer/courses?status=published" className="group">
            <Card className="border border-border/60 transition-colors hover:border-border">
              <CardContent className="p-4 flex flex-col justify-between space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Đã xuất bản</span>
                <div className="text-2xl font-bold">{counts.byStatus.published}</div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center">
                  Xem danh sách <ArrowRight className="size-3 ml-1" />
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Danh sách khoá học gần đây */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Khoá học của tôi</h2>
          {coursesList.length > 0 && (
            <Link
              href="/dashboard/lecturer/courses"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
            >
              Xem tất cả ({coursesList.length})
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
                        className="font-semibold text-foreground hover:text-primary transition-colors text-base"
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
                      <span>Trình độ: {c.level}</span>
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
                    {c.status === "rejected" ? (
                      <Link
                        href={`/dashboard/lecturer/courses/${c.id}`}
                        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1")}
                      >
                        Sửa và gửi lại
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/lecturer/courses/${c.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
                      >
                        Mở
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
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
