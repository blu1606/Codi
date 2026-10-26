"use client";

import { useState } from "react";
import { Button } from "@codi-1/ui/components/button";
import {
  AnalyticsCard,
  FunnelChart,
  HorizontalBarChart,
  KpiTile,
  LineChart,
  StackedBar,
  formatNum,
  formatPct,
} from "@codi-1/ui/components/charts";
import { PeriodControl } from "@/components/analytics/analytics-read-panel";
import { AnalyticsUnavailableCard } from "@/components/analytics/analytics-unavailable-card";
import { dayLabel, dayLabelFull, rangeLabel, sumOf } from "@/components/analytics/analytics-format";
import { useAnalyticsQuery } from "@/components/analytics/use-analytics-query";
import { type AdminInsightsData, type AnalyticsPeriod } from "@/lib/analytics-contract";

const UNAVAILABLE_DETAILS = [
  {
    code: "A4",
    title: "Giữ chân theo nhóm ghi danh",
    question: "Sau bao nhiêu tuần học viên bắt đầu bỏ học?",
    reason: "Chưa có số liệu giữ chân theo tuần: chưa có nhật ký hoạt động theo nhóm ghi danh đã xác minh.",
  },
  {
    code: "A6",
    title: "Làm bài kiểm tra đầu vào hay học từ bài 1",
    question: "Bao nhiêu học viên mới chọn tìm điểm bắt đầu?",
    reason: "Chưa có số liệu: hệ thống chưa ghi nhận lựa chọn học từ bài 1 hay làm bài đầu vào.",
  },
  {
    code: "A9",
    title: "Sức khỏe AI",
    question: "AI có đang chậm hoặc lỗi nhiều hơn?",
    reason: "Chưa có số liệu độ trễ p95 và lần chạm giới hạn tốc độ AI: chưa có nguồn dữ liệu đã xác minh.",
  },
];

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

export function AdminInsightsView() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30");
  const [expanded, setExpanded] = useState(false);
  const { query, retry } = useAnalyticsQuery<AdminInsightsData>(`/api/admin/insights/overview?period=${period}`);
  const data = query.status === "ready" ? query.data : undefined;
  const state = data ? "ok" : "loading";
  const quietPeriod = data
    ? sumOf(data.daily, (d) => d.signups + d.newEnrolments + d.lessonsCompleted + d.activeLearners) === 0
    : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl tracking-tight">Quan sát hệ thống</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Người dùng, nội dung, vận hành và AI — cùng một khoảng thời gian cho mọi thẻ.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PeriodControl value={period} onChange={setPeriod} />
        {data && (
          <span className="text-sm text-muted-foreground">
            {rangeLabel(data.window, data.previousWindow)}
          </span>
        )}
      </div>

      {query.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p>Không tải được thống kê.</p>
          <Button variant="outline" size="sm" onClick={retry}>Thử lại</Button>
        </div>
      )}
      {quietPeriod && (
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Không có hoạt động nào được ghi nhận trong kỳ này.
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-lg tracking-tight text-foreground">Tổng quan</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {data ? <OverviewCards data={data} /> : <LoadingCards />}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg tracking-tight text-foreground">Chi tiết thêm</h2>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Thu gọn" : `Xem chi tiết (${UNAVAILABLE_DETAILS.length + 1} thẻ)`}
          </Button>
        </div>
        {expanded && (
          <div className="grid gap-4 lg:grid-cols-2">
            {data && <CompletionCard data={data} state={state} />}
            {UNAVAILABLE_DETAILS.map((card) => (
              <AnalyticsUnavailableCard key={card.code} {...card} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingCards() {
  return (
    <>
      {["A1", "A2", "A3", "A7", "A8"].map((code) => (
        <AnalyticsCard key={code} id={code.toLowerCase()} code={code} title="Đang tải…" state="loading">{null}</AnalyticsCard>
      ))}
    </>
  );
}

function OverviewCards({ data }: { data: AdminInsightsData }) {
  const state = "ok" as const;
  const { totals: t, previousTotals: p, daily, previousDaily } = data;
  const dau = data.daily.map((d) => ({ date: d.date, value: d.activeLearners }));
  const previousDau = data.previousDaily.map((d) => ({ date: d.date, value: d.activeLearners }));
  const funnel = data.funnel;
  const statuses = data.courseStatus;

  return (
    <>
      <AnalyticsCard
        id="a1"
        code="A1"
        title="Chỉ số chính"
        question="Nền tảng đang lớn lên hay chững lại?"
        wide
        className="lg:col-span-2"
        table={{
          headers: ["Chỉ số", "Kỳ này", "Kỳ trước"],
          rows: [
            ["Học viên có học (TB/ngày)", formatNum(t.activeLearnersAvg), formatNum(p.activeLearnersAvg)],
            ["Đăng ký mới", formatNum(t.signups), formatNum(p.signups)],
            ["Ghi danh mới", formatNum(t.newEnrolments), formatNum(p.newEnrolments)],
            ["Bài học hoàn thành", formatNum(t.lessonsCompleted), formatNum(p.lessonsCompleted)],
            ["Khóa đang bán (hiện tại)", formatNum(data.publishedCourses), "—"],
          ],
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile label="Học viên có học (TB/ngày)" value={t.activeLearnersAvg} prev={p.activeLearnersAvg} />
          <KpiTile label="Đăng ký mới" value={t.signups} prev={p.signups} spark={daily.map((d) => d.signups)} />
          <KpiTile label="Ghi danh mới" value={t.newEnrolments} prev={p.newEnrolments} spark={daily.map((d) => d.newEnrolments)} />
          <KpiTile label="Bài học hoàn thành" value={t.lessonsCompleted} prev={p.lessonsCompleted} spark={daily.map((d) => d.lessonsCompleted)} />
          <KpiTile label="Khóa đang bán" value={data.publishedCourses} compare={false} note="Tại thời điểm hiện tại" />
        </div>
      </AnalyticsCard>

      <AnalyticsCard
        id="a2"
        code="A2"
        title="Học viên có học mỗi ngày"
        question="Số học viên có ghi nhận thời gian học trong ngày, so với kỳ trước"
        wide
        className="lg:col-span-2"
        state={state}
        table={{
          headers: ["Ngày", "Kỳ này", "Kỳ trước (cùng vị trí)"],
          rows: dau.map((d, i) => [dayLabelFull(d.date), formatNum(d.value), previousDau[i] ? formatNum(previousDau[i].value) : "—"]),
        }}
        note="Tính theo thời gian học được ghi nhận, không phải lượt đăng nhập."
      >
        <LineChart
          ariaLabel="Học viên có học mỗi ngày"
          height={200}
          series={[
            { name: "Kỳ này", points: dau.map((d) => ({ x: d.date, y: d.value, label: dayLabel(d.date) })) },
            { name: "Kỳ trước", dashed: true, points: previousDau.map((d) => ({ x: d.date, y: d.value, label: dayLabel(d.date) })) },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          TB: {formatNum(t.activeLearnersAvg)} học viên/ngày · Kỳ trước: {formatNum(p.activeLearnersAvg)}
        </p>
      </AnalyticsCard>

      <AnalyticsCard
        id="a3"
        code="A3"
        title="Phễu kích hoạt"
        question="Người mới rơi rụng ở bước nào?"
        state={state}
        sample={funnel.signups}
        note="Nhóm = tài khoản tạo trong kỳ. Xác thực, mua và bài đầu tiên tính theo trạng thái hiện tại."
        table={{
          headers: ["Bước", "Số lượng", "% so với đăng ký"],
          rows: [
            ["Đăng ký", formatNum(funnel.signups), "100%"],
            ["Xác thực email", formatNum(funnel.verified), formatPct(pct(funnel.verified, funnel.signups))],
            ["Mua lần đầu", formatNum(funnel.purchased), formatPct(pct(funnel.purchased, funnel.signups))],
            ["Hoàn thành bài đầu tiên", formatNum(funnel.firstLesson), formatPct(pct(funnel.firstLesson, funnel.signups))],
          ],
        }}
      >
        <FunnelChart
          steps={[
            { label: "Đăng ký", value: funnel.signups },
            { label: "Xác thực email", value: funnel.verified },
            { label: "Mua lần đầu", value: funnel.purchased },
            { label: "Hoàn thành bài đầu tiên", value: funnel.firstLesson },
          ]}
          emptyText="Không có tài khoản nào được tạo trong kỳ này."
        />
      </AnalyticsCard>

      <AnalyticsCard
        id="a7"
        code="A7"
        title="Khóa học theo trạng thái"
        question="Có khóa nào đang tắc ở khâu duyệt?"
        state={state}
        note="Tại thời điểm hiện tại, không theo kỳ."
        table={{
          headers: ["Trạng thái", "Số khóa"],
          rows: [
            ["Bản nháp", formatNum(statuses.draft)],
            ["Chờ duyệt", formatNum(statuses.pending)],
            ["Đã xuất bản", formatNum(statuses.published)],
            ["Đã ẩn", formatNum(statuses.hidden)],
            ["Bị từ chối", formatNum(statuses.rejected)],
          ],
        }}
      >
        <StackedBar
          segments={[
            { label: "Bản nháp", value: statuses.draft, tone: "neutral" },
            { label: "Chờ duyệt", value: statuses.pending, tone: "warning" },
            { label: "Đã xuất bản", value: statuses.published, tone: "accent" },
            { label: "Đã ẩn", value: statuses.hidden, tone: "slot-3" },
            { label: "Bị từ chối", value: statuses.rejected, tone: "critical" },
          ]}
          keepZero
          emptyText="Chưa có khóa học nào."
        />
      </AnalyticsCard>

      <AnalyticsCard
        id="a8"
        code="A8"
        title="Sức khỏe vận hành"
        question="Học viên có đang phải chờ quá lâu?"
        state={state}
        note="Tại thời điểm hiện tại. Thời gian chấm bài trung vị chưa có số liệu đã xác minh."
        table={{
          headers: ["Chỉ số (thấp hơn là tốt)", "Hiện tại"],
          rows: [
            ["Câu hỏi chưa trả lời > 48 giờ", formatNum(data.operations.unansweredQuestions)],
            ["Đánh giá chưa phản hồi", formatNum(data.operations.unrepliedReviews)],
          ],
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile label="Câu hỏi chưa trả lời > 48 giờ" value={data.operations.unansweredQuestions} compare={false} />
          <KpiTile label="Đánh giá chưa phản hồi" value={data.operations.unrepliedReviews} compare={false} />
        </div>
      </AnalyticsCard>
    </>
  );
}

function CompletionCard({ data, state }: { data: AdminInsightsData; state: "ok" | "loading" }) {
  const rows = data.completion.filter((course) => course.learners > 0);
  const rate = (course: { learners: number; completed: number }) => pct(course.completed, course.learners);
  return (
    <AnalyticsCard
      id="a5"
      code="A5"
      title="Tỉ lệ hoàn thành theo khóa"
      question="Khóa nào học viên học tới cùng?"
      state={state}
      emptyText="Chưa có khóa học xuất bản nào có học viên."
      wide
      className="lg:col-span-2"
      note="Snapshot ghi danh hiện tại, không theo kỳ."
      table={{
        headers: ["Khóa học", "Học viên", "Hoàn thành", "Tỉ lệ"],
        rows: rows.map((course) => [course.title, formatNum(course.learners), formatNum(course.completed), formatPct(rate(course))]),
      }}
    >
      <HorizontalBarChart
        items={rows.map((course) => ({
          label: course.title,
          value: rate(course),
          max: 100,
          text: `${formatPct(rate(course))} (${formatNum(course.completed)}/${formatNum(course.learners)})`,
        }))}
        format={(v) => formatPct(v)}
        emptyText="Chưa có khóa học xuất bản nào có học viên."
      />
    </AnalyticsCard>
  );
}
