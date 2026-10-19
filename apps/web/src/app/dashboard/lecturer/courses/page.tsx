import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Plus } from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { cn } from "@codi-1/ui/lib/utils";
import { auth, db } from "@/services";
import {
  COURSE_LEVEL_LABELS,
  COURSE_STATUSES,
  type CourseLevel,
  type CourseStatusType,
} from "@/lib/course-constants";
import {
  getLecturerCourses,
  getLecturerDashboardStats,
} from "../actions";

interface CoursesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function LecturerCoursesPage({ searchParams }: CoursesPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const resolvedParams = await searchParams;
  const rawStatus = resolvedParams.status;
  const currentStatus: CourseStatusType | "all" =
    rawStatus && COURSE_STATUSES.includes(rawStatus as CourseStatusType)
      ? (rawStatus as CourseStatusType)
      : "all";

  const { counts } = await getLecturerDashboardStats();
  const filteredCourses = await getLecturerCourses(currentStatus);
  const totalCount =
    counts.byStatus.draft +
    counts.byStatus.pending +
    counts.byStatus.rejected +
    counts.byStatus.published +
    counts.byStatus.hidden;

  const tabs: Array<{ status: CourseStatusType | "all"; label: string; count: number }> = [
    { status: "all", label: "Tất cả", count: totalCount },
    { status: "draft", label: "Bản nháp", count: counts.byStatus.draft },
    { status: "pending", label: "Chờ duyệt", count: counts.byStatus.pending },
    { status: "rejected", label: "Bị từ chối", count: counts.byStatus.rejected },
    { status: "published", label: "Đã xuất bản", count: counts.byStatus.published },
    { status: "hidden", label: "Đã ẩn", count: counts.byStatus.hidden },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Tiêu đề & Nút Tạo khoá học */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khoá học của tôi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý các khoá học bạn đang biên soạn và giảng dạy trên Codi.
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

      {/* Tabs lọc theo trạng thái */}
      <div className="border-b border-border/80 flex items-center gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const isSelected = currentStatus === tab.status;
          return (
            <Link
              key={tab.status}
              href={
                tab.status === "all"
                  ? "/dashboard/lecturer/courses"
                  : `/dashboard/lecturer/courses?status=${tab.status}`
              }
              className={cn(
                "flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                isSelected
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 text-xs rounded-full",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Danh sách khoá học hoặc Empty State */}
      {filteredCourses.length === 0 ? (
        <Card className="border border-dashed border-border/80">
          <CardContent className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpen className="size-5 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>Không có khoá học ở trạng thái này</EmptyTitle>
                <EmptyDescription>
                  {currentStatus === "all"
                    ? "Bạn chưa có khoá học nào. Hãy bấm 'Tạo khóa học' để bắt đầu."
                    : `Hiện tại bạn không có khoá học nào ở trạng thái "${tabs.find((t) => t.status === currentStatus)?.label || "này"}".`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCourses.map((c) => (
            <Card key={c.id} className="border border-border/80 hover:border-border transition-colors">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-foreground text-base">
                      {c.title}
                    </span>
                    <StatusBadge kind="course" status={c.status} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{c.chaptersCount} chương</span>
                    <span>•</span>
                    <span>{c.lessonsCount} bài</span>
                    <span>•</span>
                    <span>{c.learnersCount} học viên</span>
                    <span>•</span>
                    <span>Danh mục: {c.category}</span>
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
                  {c.status === "rejected" ? (
                    <Button
                      variant="default"
                      size="sm"
                      disabled
                      className="gap-1 cursor-not-allowed opacity-70"
                      title="Trình chỉnh sửa khoá học sẽ mở ở bước tiếp theo (#130)"
                    >
                      Sửa và gửi lại
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="gap-1 cursor-not-allowed opacity-70"
                      title="Trình chỉnh sửa khoá học sẽ mở ở bước tiếp theo (#130)"
                    >
                      Mở
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
