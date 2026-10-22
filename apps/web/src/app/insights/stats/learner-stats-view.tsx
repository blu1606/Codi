"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  ActivityCalendar,
  AnalyticsCard,
  AnalyticsGrid,
  AnalyticsToolbar,
  BarChart,
  Donut,
  HorizontalBarChart,
  KpiGrid,
  KpiTile,
  LineChart,
  type PeriodValue,
} from "@codi-1/ui/components/charts";
import { getLearnerStatsData } from "@/lib/learner-insights-service";

export function LearnerStatsView({
  initialData,
}: {
  initialData: ReturnType<typeof getLearnerStatsData>;
}) {
  const [period, setPeriod] = React.useState<"7" | "month" | "30">(initialData.period);
  const [course, setCourse] = React.useState<string>(initialData.courseIdFilter);
  const [openDetail, setOpenDetail] = React.useState(false);
  const [selectedQuizId, setSelectedQuizId] = React.useState<string>(
    initialData.c6.quizzes[0]?.id || "",
  );

  // Re-compute stats client side when period / course dropdown changes
  const data = React.useMemo(() => {
    return getLearnerStatsData(period, course);
  }, [period, course]);

  const selectedQuiz =
    data.c6.quizzes.find((q) => q.id === selectedQuizId) || data.c6.quizzes[0];

  const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const rangeSubtitle = `${dm(data.w.start)} – ${dm(data.w.end)} · so với ${dm(data.w.prevStart)} – ${dm(data.w.prevEnd)}${course !== "all" ? " · Giờ học tính trên mọi khóa (thời gian học chưa tách theo khóa)." : ""}`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thống kê học tập</h1>
          <p className="text-sm text-muted-foreground">
            Bạn học đều đặn đến đâu và kỹ năng nào đang lên.
          </p>
        </div>
        <div>
          <Link
            href={"/insights/knowledge-map" as import("next").Route}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Bản đồ kiến thức
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <AnalyticsToolbar
        periods={[
          { value: "7", label: "Tuần" },
          { value: "month", label: "Tháng" },
          { value: "30", label: "30 ngày" },
        ]}
        selectedPeriod={period as PeriodValue}
        onSelectPeriod={(p) => setPeriod(p as "7" | "month" | "30")}
        extraFilters={
          <div className="flex items-center gap-2">
            <label htmlFor="course-filter" className="sr-only">
              Khóa học
            </label>
            <select
              id="course-filter"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="h-9 px-3 rounded-md border border-border bg-card text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Tất cả khóa học</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <p className="text-xs text-muted-foreground m-0">{rangeSubtitle}</p>

      {/* Little Data Warning */}
      {data.littleData && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-warning-soft text-foreground text-sm">
          <span>▲ Mới có {data.activeDays} ngày học trong khoảng này — biểu đồ sẽ rõ hơn sau vài buổi học nữa.</span>
        </div>
      )}

      {/* Empty State when no activity */}
      {data.noActivity ? (
        <div className="grid place-items-center min-h-[220px] p-8 border border-dashed border-border rounded-lg text-center">
          <h3 className="text-base font-semibold">Chưa có hoạt động trong khoảng này</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Học một bài là biểu đồ bắt đầu có số liệu. Thử chọn khoảng thời gian dài hơn.
          </p>
          <Link
            href={"/dashboard" as import("next").Route}
            className={cn(buttonVariants({ size: "sm" }), "mt-4")}
          >
            Học tiếp
          </Link>
        </div>
      ) : (
        <>
          {/* C1: KPI Row */}
          <AnalyticsCard
            code="C1"
            title="Tóm tắt kỳ này"
            question="Nhịp học và độ tập trung của bạn"
            wide
          >
            <KpiGrid>
              <KpiTile
                label="Giờ học trong kỳ"
                value={data.c1.studyHours}
                prev={data.c1.prevHours}
                format={(v) => `${(Math.round(v * 10) / 10).toLocaleString("vi-VN")} giờ`}
                spark={data.c1.spark}
              />
              <KpiTile
                label="Chuỗi ngày học"
                value={data.c1.streakCur}
                format={(v) => `${v} ngày`}
                compare={false}
                note={`Dài nhất: ${data.c1.streakBest} ngày`}
              />
              <KpiTile
                label="Bài hoàn thành"
                value={data.c1.completedLessons}
                compare={false}
              />
              <KpiTile
                label="Kỹ năng thành thạo"
                value={data.c1.masteredRatio}
                compare={false}
                note='Mức "Thành thạo" trở lên'
              />
            </KpiGrid>
          </AnalyticsCard>

          {/* C2, C3, C4 Grid */}
          <AnalyticsGrid>
            {/* C2: Study hours per week / day */}
            <AnalyticsCard
              code="C2"
              title={data.c2.title}
              question={data.c2.question}
              note={data.c2.note}
              table={data.c2.table}
            >
              <BarChart
                items={data.c2.items}
                goal={data.c2.goal}
                goalLabel={data.c2.goalLabel}
                format={(v) => `${v} ${data.c2.unit}`}
                capFormat={(v) => String(v)}
                ariaLabel={data.c2.title}
              />
            </AnalyticsCard>

            {/* C3: Calendar */}
            <AnalyticsCard
              code="C3"
              title={data.c3.title}
              question={data.c3.question}
              table={data.c3.table}
            >
              <ActivityCalendar
                days={data.c3.days}
                today={data.c3.today}
                unit="phút"
                ariaLabel="Lịch học theo ngày"
              />
            </AnalyticsCard>

            {/* C4: Mastery */}
            <AnalyticsCard
              code="C4"
              title={data.c4.title}
              question={data.c4.question}
              note={data.c4.note}
              table={data.c4.table}
              wide
            >
              <HorizontalBarChart
                items={data.c4.items}
                emptyText="Chưa có kỹ năng nào được ghi nhận."
              />
              {!data.c4.skipped && (
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <span className="w-0 h-3 border-l-2 border-dashed border-foreground/60 inline-block" aria-hidden="true" />
                  <span>Vạch đứt: mức lúc làm bài kiểm tra đầu vào</span>
                </div>
              )}
            </AnalyticsCard>
          </AnalyticsGrid>

          {/* Progressive Detail Section: C5 & C6 */}
          <div className="pt-2">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-lg font-semibold">Chi tiết thêm</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDetail((prev) => !prev)}
                aria-expanded={openDetail}
              >
                {openDetail ? (
                  <ChevronDown className="size-4 mr-1" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4 mr-1" aria-hidden="true" />
                )}
                {openDetail ? "Thu gọn" : "Xem chi tiết (2 thẻ)"}
              </Button>
            </div>

            {openDetail && (
              <div className="mt-4 space-y-4">
                {/* C5: Scores */}
                <AnalyticsCard
                  code="C5"
                  title={data.c5.title}
                  question={data.c5.question}
                  sample={data.c5.sample}
                  table={data.c5.table}
                  wide
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="p-3 rounded-md bg-muted">
                      <div className="text-xs text-muted-foreground">Trung bình</div>
                      <div className="text-lg font-bold">{data.c5.avgScore}%</div>
                    </div>
                    <div className="p-3 rounded-md bg-muted">
                      <div className="text-xs text-muted-foreground">Cao nhất</div>
                      <div className="text-lg font-bold">{data.c5.maxScore}%</div>
                    </div>
                    <div className="p-3 rounded-md bg-muted">
                      <div className="text-xs text-muted-foreground">Tỉ lệ đạt (≥ {data.c5.passThreshold}%)</div>
                      <div className="text-lg font-bold">{data.c5.passRate}%</div>
                    </div>
                  </div>

                  <LineChart
                    series={[{ name: "Điểm", points: data.c5.pts }]}
                    threshold={{ value: data.c5.passThreshold, label: `Ngưỡng đạt ${data.c5.passThreshold}%` }}
                    yFormat={(v) => `${Math.round(v)}%`}
                    ariaLabel="Điểm theo lượt làm"
                  />
                </AnalyticsCard>

                {/* C6: Donut */}
                <AnalyticsCard
                  code="C6"
                  title={data.c6.title}
                  question={data.c6.question}
                  actions={
                    <select
                      value={selectedQuizId}
                      onChange={(e) => setSelectedQuizId(e.target.value)}
                      className="h-8 px-2 rounded-md border border-border bg-card text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-w-[220px]"
                    >
                      {data.c6.quizzes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  }
                  table={
                    selectedQuiz
                      ? {
                          headers: ["Kết quả", "Số câu"],
                          rows: [
                            ["Đúng", selectedQuiz.correct],
                            ["Sai", selectedQuiz.wrong],
                            ["Chưa biết", selectedQuiz.unknown],
                          ],
                        }
                      : undefined
                  }
                  wide
                >
                  {selectedQuiz ? (
                    <Donut
                      correct={selectedQuiz.correct}
                      wrong={selectedQuiz.wrong}
                      unknown={selectedQuiz.unknown}
                      label={selectedQuiz.label}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">Chưa có bài quiz nào.</div>
                  )}
                </AnalyticsCard>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
