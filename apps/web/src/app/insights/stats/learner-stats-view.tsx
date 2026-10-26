"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ActivityCalendar,
  AnalyticsCard,
  BarChart,
  Donut,
  HorizontalBarChart,
  KpiTile,
  LineChart,
  MASTERY_LABELS,
} from "@codi-1/ui/components/charts";
import { Button } from "@codi-1/ui/components/button";
import { AnalyticsReadPanel, PeriodControl } from "@/components/analytics/analytics-read-panel";
import { type AnalyticsPeriod, type LearnerStatsData } from "@/lib/analytics-contract";

const PASS_PERCENT = 70;
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const TZ_MS = 7 * 3_600_000;

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const formatHours = (value: number) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ`;
const localDay = (iso: string) => new Date(Date.parse(iso) - 1 + TZ_MS).toISOString().slice(0, 10);

export function LearnerStatsView({ initialPeriod = "30", initialCourse = "all" }: {
  initialPeriod?: AnalyticsPeriod; initialCourse?: string;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [course, setCourse] = useState(initialCourse);
  const [expanded, setExpanded] = useState(false);
  const [quizId, setQuizId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl tracking-tight">Thống kê học tập</h1>
        <p className="text-sm text-muted-foreground">Bạn học đều đặn đến đâu và kỹ năng nào đang lên.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PeriodControl value={period} onChange={setPeriod} learner />
      </div>

      <AnalyticsReadPanel
        title="Tổng quan"
        url={`/api/insights/stats?period=${period}&course=${encodeURIComponent(course)}`}
      >
        {(response) => (
          <StatsContent
            data={response as LearnerStatsData}
            course={course}
            onCourse={(value) => { setCourse(value); setQuizId(null); }}
            expanded={expanded}
            onExpand={() => setExpanded((value) => !value)}
            quizId={quizId}
            onQuiz={setQuizId}
          />
        )}
      </AnalyticsReadPanel>
    </div>
  );
}

function StatsContent({ data, course, onCourse, expanded, onExpand, quizId, onQuiz }: {
  data: LearnerStatsData;
  course: string;
  onCourse: (value: string) => void;
  expanded: boolean;
  onExpand: () => void;
  quizId: string | null;
  onQuiz: (value: string) => void;
}) {
  const courseFilter = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">Khóa học
        <select className="rounded-md border border-border bg-background p-2" value={course}
          onChange={(event) => onCourse(event.target.value)}>
          <option value="all">Tất cả khóa học</option>
          {data.courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {course !== "all" && (
        <p className="text-sm text-muted-foreground">Giờ học tính trên mọi khóa (thời gian học chưa tách theo khóa).</p>
      )}
    </div>
  );

  const activeDays = data.days.filter((day) => day.minutes > 0).length;
  const noActivity = data.studyMinutes === 0 && data.completedLessons === 0 && data.skills.items.every((skill) => skill.level === 0);
  if (noActivity) {
    return (
      <div className="space-y-4">
        {courseFilter}
        <div className="grid gap-2 rounded-lg border border-dashed border-border p-6 text-center">
          <h2 className="text-base text-foreground">Chưa có hoạt động trong khoảng này</h2>
          <p className="text-sm text-muted-foreground">
            Học một bài là biểu đồ bắt đầu có số liệu. Thử chọn khoảng thời gian dài hơn.
          </p>
          <Link href="/dashboard" className="mx-auto text-sm font-medium text-primary underline">
            Học bài đầu tiên để xem thống kê
          </Link>
        </div>
      </div>
    );
  }

  const goalMinutes = data.weeklyGoalMinutes;
  const goalNote = data.weeklyGoalSet ? undefined : "Bạn chưa đặt mục tiêu, Codi tạm dùng 5 giờ/tuần (Giả định).";
  const dailyView = data.window.period === "7";
  const passCount = data.scores.filter((score) => score.percent >= PASS_PERCENT).length;
  const average = data.scores.length ? Math.round(data.scores.reduce((sum, score) => sum + score.percent, 0) / data.scores.length) : 0;
  const best = data.scores.length ? Math.max(...data.scores.map((score) => score.percent)) : 0;
  const selectedQuiz = data.quizzes.find((quiz) => quiz.id === quizId) ?? data.quizzes[data.quizzes.length - 1];
  const quizTotal = selectedQuiz ? selectedQuiz.correct + selectedQuiz.wrong + selectedQuiz.unknown : 0;
  const showCourseName = data.courses.length > 1 && course === "all";

  return (
    <div className="space-y-6">
      {courseFilter}
      {activeDays > 0 && activeDays < 3 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          Mới có {activeDays} ngày học trong khoảng này — biểu đồ sẽ rõ hơn sau vài buổi học nữa.
        </p>
      )}

      <AnalyticsCard id="c1-summary" code="C1" title="Tóm tắt kỳ này" wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Giờ học trong kỳ" value={hours(data.studyMinutes)} prev={hours(data.previousStudyMinutes)}
            format={formatHours} />
          <KpiTile label="Chuỗi ngày học" value={data.streak.current} compare={false}
            format={(value) => `${value} ngày`} note={`Dài nhất: ${data.streak.best} ngày`} />
          <KpiTile label="Bài hoàn thành" value={data.completedLessons} prev={data.previousCompletedLessons} />
          <KpiTile label="Kỹ năng thành thạo" value={`${data.skills.mastered}/${data.skills.total}`} compare={false}
            note={'Mức "Thành thạo" trở lên'} />
        </div>
      </AnalyticsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {dailyView ? (
          <AnalyticsCard id="c2-hours" code="C2" title="Phút học mỗi ngày" question="Mỗi ngày bạn học bao lâu so với mục tiêu?"
            table={{ headers: ["Ngày", "Phút"], rows: data.days.map((day) => [dm(day.date), day.minutes]) }}
            note={goalNote}>
            <BarChart
              items={data.days.map((day) => ({ label: `${weekday(day.date)} ${dm(day.date)}`, value: day.minutes }))}
              goal={Math.round(goalMinutes / 7)} goalLabel="Mục tiêu/ngày"
              format={(value) => `${value} phút`} capFormat={(value) => String(value)}
              ariaLabel="Phút học mỗi ngày" />
          </AnalyticsCard>
        ) : (
          <AnalyticsCard id="c2-hours" code="C2" title="Giờ học mỗi tuần" question="Bạn có đạt mục tiêu giờ học hằng tuần?"
            table={{ headers: ["Tuần", "Giờ học"], rows: data.weeks.map((week) => [`Tuần ${dm(week.weekStart)}`, formatHours(hours(week.minutes))]) }}
            note={[goalNote, "Tuần gần nhất có thể chưa kết thúc."].filter(Boolean).join(" ")}>
            <BarChart
              items={data.weeks.map((week) => ({ label: `Tuần ${dm(week.weekStart)}`, value: hours(week.minutes) }))}
              goal={hours(goalMinutes)} goalLabel={data.weeklyGoalSet ? "Mục tiêu tuần" : "Mục tiêu tuần (Giả định)"}
              format={formatHours} capFormat={(value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
              ariaLabel="Giờ học mỗi tuần" />
          </AnalyticsCard>
        )}

        <AnalyticsCard id="c3-calendar" code="C3" title="Lịch học" question={`Chuỗi hiện tại: ${data.streak.current} ngày liên tiếp`}
          table={{ headers: ["Ngày", "Phút"], rows: data.calendar.map((day) => [dm(day.date), day.minutes]) }}>
          <ActivityCalendar
            days={data.calendar.map((day) => ({ date: day.date, value: day.minutes }))}
            today={localDay(data.window.end)} unit="phút" ariaLabel="Lịch học theo ngày" />
        </AnalyticsCard>
      </div>

      <AnalyticsCard id="c4-mastery" code="C4" title="Mức thành thạo theo kỹ năng" question="Kỹ năng nào vững, kỹ năng nào cần ôn?"
        wide state={data.skills.total ? "ok" : "empty"} emptyText="Chưa có kỹ năng nào được ghi nhận."
        note={data.diagnosticSkipped
          ? "Bạn đã bỏ qua bài kiểm tra đầu vào nên không có mốc so sánh. Có thể làm lại từ trang lộ trình."
          : "Vạch mốc lúc làm bài đầu vào chưa khả dụng: hệ thống chưa lưu mức thành thạo theo từng thời điểm."}
        table={{
          headers: ["Kỹ năng", "Mức hiện tại"],
          rows: data.skills.items.map((skill) => [showCourseName ? `${skill.name} · ${skill.courseTitle}` : skill.name, MASTERY_LABELS[skill.level]]),
        }}>
        <HorizontalBarChart
          items={data.skills.items.map((skill) => ({
            label: showCourseName ? `${skill.name} · ${skill.courseTitle}` : skill.name,
            value: skill.level, max: 4, text: MASTERY_LABELS[skill.level],
            tip: `Mức ${skill.level}/4`,
          }))}
          max={4} />
      </AnalyticsCard>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg tracking-tight text-foreground">Chi tiết thêm</h2>
          <Button variant="outline" size="sm" aria-expanded={expanded} onClick={onExpand}>
            {expanded ? "Thu gọn" : "Xem chi tiết (2 thẻ)"}
          </Button>
        </div>
        {expanded && (
          <div className="grid gap-4">
            <AnalyticsCard id="c5-scores" code="C5" title="Điểm quiz & bài code theo thời gian" question="Điểm của bạn có ổn định trên ngưỡng đạt?"
              wide sample={data.scores.length} state={data.scores.length ? "ok" : "empty"} emptyText="Bạn chưa nộp quiz hay bài code nào."
              table={{ headers: ["Lượt", "Loại", "Bài", "Điểm"], rows: data.scores.map((score, index) => [`#${index + 1}`, score.kind, score.label, `${score.percent}%`]) }}>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Trung bình</p><p className="text-lg font-semibold">{average}%</p></div>
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Cao nhất</p><p className="text-lg font-semibold">{best}%</p></div>
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Tỉ lệ đạt (≥ {PASS_PERCENT}%)</p>
                    <p className="text-lg font-semibold">{data.scores.length ? Math.round((passCount / data.scores.length) * 100) : 0}%</p></div>
                </div>
                <LineChart
                  series={[{ name: "Điểm", points: data.scores.map((score, index) => ({ x: index, y: score.percent, label: `#${index + 1}`, note: `${score.kind}: ${score.label}` })) }]}
                  threshold={{ value: PASS_PERCENT, label: `Ngưỡng đạt ${PASS_PERCENT}%` }}
                  yFormat={(value) => `${Math.round(value)}%`} ariaLabel="Điểm theo lượt làm" />
              </div>
            </AnalyticsCard>

            <AnalyticsCard id="c6-quiz" code="C6" title="Kết quả một bài quiz" question="Bạn đúng, sai bao nhiêu câu ở bài đã chọn?"
              wide state={selectedQuiz && quizTotal ? "ok" : "empty"} emptyText="Chưa có bài quiz nào được nộp."
              actions={data.quizzes.length > 1 ? (
                <>
                  <label className="sr-only" htmlFor="ls-quiz">Chọn bài quiz</label>
                  <select id="ls-quiz" className="max-w-[220px] rounded-md border border-border bg-background p-2 text-sm"
                    value={selectedQuiz?.id} onChange={(event) => onQuiz(event.target.value)}>
                    {data.quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.label}</option>)}
                  </select>
                </>
              ) : undefined}
              table={selectedQuiz ? { headers: ["Kết quả", "Số câu"], rows: [["Đúng", selectedQuiz.correct], ["Sai", selectedQuiz.wrong], ["Chưa biết", selectedQuiz.unknown]] } : undefined}>
              {selectedQuiz && quizTotal > 0 && (
                <Donut correct={selectedQuiz.correct} wrong={selectedQuiz.wrong} unknown={selectedQuiz.unknown} label={selectedQuiz.label} />
              )}
            </AnalyticsCard>
          </div>
        )}
      </div>
    </div>
  );
}
