"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  HelpCircle,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { ProgressRing } from "@codi-1/ui/components/progress-ring";
import { Sheet } from "@codi-1/ui/components/sheet";
import type {
  CourseProgressDetailDto,
  LearnerProgressDto,
} from "@/lib/lecturer-progress-service";

interface CourseProgressClientProps {
  data: CourseProgressDetailDto;
}

export function CourseProgressClient({ data }: CourseProgressClientProps) {
  const [activeTab, setActiveTab] = useState<"learners" | "quiz">("learners");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLearner, setSelectedLearner] = useState<LearnerProgressDto | null>(null);

  // Lọc học viên theo từ khoá tìm kiếm
  const filteredLearners = data.learners.filter((l) =>
    l.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb quay lại */}
      <div>
        <Link
          href={"/dashboard/lecturer/progress" as any}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="size-3.5" />
          <span>Tất cả khoá học</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{data.courseTitle}</h1>
      </div>

      {/* 3 Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/80">
          <CardContent className="p-5 flex flex-col justify-between space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Học viên</span>
            <div className="text-3xl font-bold tracking-tight">{data.learnersCount}</div>
            <span className="text-xs text-muted-foreground">Đã ghi danh khoá học</span>
          </CardContent>
        </Card>

        <Card className="border border-border/80">
          <CardContent className="p-5 flex flex-col justify-between space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Tỉ lệ hoàn thành trung bình
            </span>
            <div className="text-3xl font-bold tracking-tight">
              {data.averageCompletionRate}%
            </div>
            <span className="text-xs text-muted-foreground">Trên toàn bộ bài học</span>
          </CardContent>
        </Card>

        <Card className="border border-border/80">
          <CardContent className="p-5 flex flex-col justify-between space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Điểm quiz trung bình
            </span>
            <div className="text-3xl font-bold tracking-tight">
              {data.averageQuizScore !== null ? `${data.averageQuizScore}%` : "—"}
            </div>
            <span className="text-xs text-muted-foreground">Các bài kiểm tra trắc nghiệm</span>
          </CardContent>
        </Card>
      </div>

      {/* Thanh chuyển Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("learners")}
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "learners"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Học viên ({data.learnersCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("quiz")}
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "quiz"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Kết quả quiz ({data.quizQuestions.length})
        </button>
      </div>

      {/* Tab 1: Danh sách học viên */}
      {activeTab === "learners" && (
        <div className="space-y-4">
          {data.learnersCount === 0 ? (
            <Card className="border border-border/80">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <div className="p-3 bg-muted rounded-full text-muted-foreground">
                  <Users className="size-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">Chưa có học viên</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Khi có người mua khoá học, tiến độ của họ sẽ hiển thị ở đây.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Ô tìm kiếm học viên */}
              <div className="flex items-center gap-2 max-w-sm">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo tên học viên..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>

              {/* Bảng danh sách học viên */}
              <div className="rounded-md border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                      <tr>
                        <th className="p-3">Học viên</th>
                        <th className="p-3 min-w-[140px]">Tiến độ</th>
                        <th className="p-3 text-center">Bài hoàn thành</th>
                        <th className="p-3 text-center">Quiz TB</th>
                        <th className="p-3 text-center">Gợi ý dùng</th>
                        <th className="p-3">Hoạt động gần nhất</th>
                        <th className="p-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredLearners.map((learner) => (
                        <tr key={learner.userId} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {learner.avatar ? (
                                <img
                                  src={learner.avatar}
                                  alt={learner.name}
                                  className="size-7 rounded-full object-cover"
                                />
                              ) : (
                                <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                                  {learner.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-foreground">
                                {learner.name}
                              </span>
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full transition-all"
                                  style={{ width: `${learner.progressPercent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-medium text-muted-foreground w-8 text-right">
                                {learner.progressPercent}%
                              </span>
                            </div>
                          </td>

                          <td className="p-3 text-center">
                            {learner.completedLessonsCount}/{learner.totalLessonsCount}
                          </td>

                          <td className="p-3 text-center font-medium">
                            {learner.averageQuizScore !== null
                              ? `${learner.averageQuizScore}%`
                              : "—"}
                          </td>

                          <td className="p-3 text-center text-muted-foreground">
                            {learner.hintUsageCount > 0
                              ? `${learner.hintUsageCount} (L${learner.maxHintLevel})`
                              : "0"}
                          </td>

                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(learner.lastActive)}
                          </td>

                          <td className="p-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLearner(learner)}
                              className="h-8 text-xs font-medium"
                            >
                              Xem chi tiết
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Kết quả câu hỏi Quiz */}
      {activeTab === "quiz" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Câu có tỉ lệ đúng dưới 60% được đánh dấu để bạn xem lại cách giảng hoặc đề bài.
          </p>

          {!data.quizQuestions.length ? (
            <Card className="border border-border/80">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <div className="p-3 bg-muted rounded-full text-muted-foreground">
                  <HelpCircle className="size-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">Chưa có câu hỏi quiz nào</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Khoá học chưa có bài trắc nghiệm hoặc chưa có câu hỏi nào được tạo.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                    <tr>
                      <th className="p-3">Bài học</th>
                      <th className="p-3">Câu hỏi</th>
                      <th className="p-3 text-center">Lượt trả lời</th>
                      <th className="p-3 text-center">Tỉ lệ đúng</th>
                      <th className="p-3 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.quizQuestions.map((q) => (
                      <tr key={q.questionId} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-muted-foreground whitespace-nowrap">
                          {q.lessonTitle}
                        </td>
                        <td className="p-3 font-normal max-w-md line-clamp-2">
                          {q.questionText}
                        </td>
                        <td className="p-3 text-center">{q.totalAnswers}</td>
                        <td className="p-3 text-center font-medium">
                          {q.correctPercent !== null ? `${q.correctPercent}%` : "—"}
                        </td>
                        <td className="p-3 text-right">
                          {q.needsReview ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-destructive/10 text-destructive">
                              <AlertTriangle className="size-3" />
                              <span>Cần xem lại</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">Bình thường</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drill-down Sheet cho từng học viên */}
      <Sheet
        open={!!selectedLearner}
        onOpenChange={(open) => !open && setSelectedLearner(null)}
        title={selectedLearner?.name || "Chi tiết học viên"}
        description="Chi tiết tiến độ học tập và bài làm của học viên"
      >
        {selectedLearner && (
          <div className="space-y-6 pt-2">
            {/* Header tóm tắt tiến độ */}
            <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <ProgressRing value={selectedLearner.progressPercent} size={76} />
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">
                  {selectedLearner.completedLessonsCount}/{data.totalLessons} bài hoàn thành
                </h3>
                <p className="text-xs text-muted-foreground">
                  Quiz trung bình:{" "}
                  {selectedLearner.averageQuizScore !== null
                    ? `${selectedLearner.averageQuizScore}%`
                    : "chưa có"}
                </p>
              </div>
            </div>

            {/* Panel thông tin gợi ý AI (không phạt điểm) */}
            {selectedLearner.hintUsageCount > 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-border bg-card text-xs">
                <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-medium text-foreground">Sử dụng gợi ý AI</span>
                  <p className="text-muted-foreground">
                    Đã dùng {selectedLearner.hintUsageCount} lần gợi ý (cấp độ cao nhất: L
                    {selectedLearner.maxHintLevel}). Gợi ý hỗ trợ học viên giải bài và không bị trừ điểm.
                  </p>
                </div>
              </div>
            )}

            {/* Danh sách các bài học */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tiến độ theo bài học ({selectedLearner.lessons.length})
              </h4>

              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {selectedLearner.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex items-start gap-3 p-3 text-xs bg-card hover:bg-muted/20 transition-colors"
                  >
                    {lesson.isCompleted ? (
                      <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/60 shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 space-y-0.5">
                      <div className="font-medium text-foreground">{lesson.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-[11px]">
                        <span>{lesson.isCompleted ? "Hoàn thành" : "Chưa hoàn thành"}</span>
                        {lesson.quizScore !== null && lesson.quizScore !== undefined && (
                          <span>· Quiz {lesson.quizScore}%</span>
                        )}
                        {lesson.assignmentSubmission && (
                          <span>
                            · Bài tập:{" "}
                            {lesson.assignmentSubmission.status === "graded"
                              ? `${lesson.assignmentSubmission.score}/${lesson.assignmentSubmission.maxScore}`
                              : "Chờ chấm"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
