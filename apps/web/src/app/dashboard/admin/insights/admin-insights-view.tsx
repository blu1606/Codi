"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  AnalyticsCard,
  AnalyticsGrid,
  AnalyticsToolbar,
  Heatmap,
  HorizontalBarChart,
  InlineBar,
  KpiGrid,
  KpiTile,
  LineChart,
  StackedBar,
  formatCompact,
  formatNum,
  type PeriodValue,
} from "@codi-1/ui/components/charts";
import {
  formatRangeText,
  getAnalyticsWindow,
  getInsightsA1,
  getInsightsA2,
  getInsightsA3,
  getInsightsA4,
  getInsightsA5,
  getInsightsA6,
  getInsightsA7,
  getInsightsA8,
  getInsightsA9,
} from "@/lib/admin-analytics-service";

export function AdminInsightsView() {
  const [period, setPeriod] = React.useState<PeriodValue>("30");
  const [compare, setCompare] = React.useState<boolean>(true);
  const [openMore, setOpenMore] = React.useState<boolean>(false);
  const [a5Sort, setA5Sort] = React.useState<"rate" | "n">("rate");

  const w = React.useMemo(() => {
    return getAnalyticsWindow(period, compare);
  }, [period, compare]);

  const a1 = React.useMemo(() => getInsightsA1(w), [w]);
  const a2 = React.useMemo(() => getInsightsA2(w), [w]);
  const a3 = React.useMemo(() => getInsightsA3(w), [w]);
  const a7 = React.useMemo(() => getInsightsA7(), []);
  const a8 = React.useMemo(() => getInsightsA8(), []);

  const a4 = React.useMemo(() => getInsightsA4(w), [w]);
  const a5 = React.useMemo(() => getInsightsA5(a5Sort), [a5Sort]);
  const a6 = React.useMemo(() => getInsightsA6(w), [w]);
  const a9 = React.useMemo(() => getInsightsA9(w), [w]);

  const rangeText = formatRangeText(w);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quan sát hệ thống</h1>
        <p className="text-sm text-muted-foreground">
          Người dùng, nội dung, vận hành và AI — cùng một khoảng thời gian cho mọi thẻ.
        </p>
      </div>

      {/* Shared Toolbar */}
      <AnalyticsToolbar
        selectedPeriod={period}
        onSelectPeriod={setPeriod}
        compare={compare}
        onToggleCompare={setCompare}
        rangeText={rangeText}
      />

      {/* Section 1: Tổng quan (A1, A2, A3, A7, A8) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Tổng quan</h2>

        {/* A1: Chỉ số chính */}
        <AnalyticsCard
          id="a1"
          code={a1.code}
          title={a1.title}
          question={a1.question}
          detailHref="/dashboard/admin/insights/a1"
          table={a1.table}
          wide
        >
          <KpiGrid>
            {a1.tiles.map((t) => (
              <KpiTile
                key={t.label}
                label={t.label}
                value={t.value}
                prev={t.prev}
                compare={t.compare !== false ? w.compare : false}
                prevMissing={w.compare && !w.prev}
                spark={t.spark}
                note={t.note}
              />
            ))}
          </KpiGrid>
        </AnalyticsCard>

        {/* 2-column Grid for A2, A3, A7, A8 */}
        <AnalyticsGrid>
          {/* A2: DAU */}
          <AnalyticsCard
            id="a2"
            code={a2.code}
            title={a2.title}
            question={a2.question}
            detailHref="/dashboard/admin/insights/a2"
            table={a2.table}
          >
            <LineChart
              series={[
                { name: "Kỳ này", points: a2.cur },
                ...(a2.prev ? [{ name: "Kỳ trước", points: a2.prev, dashed: true }] : []),
              ]}
              yFormat={formatNum}
              ariaLabel="DAU theo ngày"
            />
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
              <div className="p-2 rounded bg-muted/60">
                <span className="block text-xs text-muted-foreground">DAU trung bình</span>
                <span className="text-base font-semibold">{formatNum(a2.curAvgDau)}</span>
              </div>
              <div className="p-2 rounded bg-muted/60">
                <span className="block text-xs text-muted-foreground">Độ gắn bó (DAU/WAU)</span>
                <span className="text-base font-semibold">{a2.curSticky.toFixed(1)}%</span>
                {a2.prevSticky != null && (
                  <span className="block text-[11px] text-muted-foreground">
                    Kỳ trước {a2.prevSticky.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </AnalyticsCard>

          {/* A3: Activation Funnel */}
          <AnalyticsCard
            id="a3"
            code={a3.code}
            title={a3.title}
            question={a3.question}
            detailHref="/dashboard/admin/insights/a3"
            table={a3.table}
          >
            <HorizontalBarChart
              items={a3.steps.map((s, i) => ({
                label: `${i + 1}. ${s.label}`,
                value: s.value,
                max: a3.steps[0]?.value || 1,
              }))}
              sort={false}
            />
          </AnalyticsCard>

          {/* A7: Course Status Breakdown */}
          <AnalyticsCard
            id="a7"
            code={a7.code}
            title={a7.title}
            question={a7.question}
            detailHref="/dashboard/admin/insights/a7"
            table={a7.table}
          >
            <StackedBar segments={a7.segs} format={formatNum} />
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
              <div className="p-2 rounded bg-muted/60">
                <span className="block text-xs text-muted-foreground">Chờ duyệt lâu nhất</span>
                <span className="text-base font-semibold">
                  {a7.longestWait != null ? `${a7.longestWait} ngày` : "—"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {a7.pendingCount ? `${a7.pendingCount} khóa đang chờ` : "Không có khóa chờ"}
                </span>
              </div>
              <div className="p-2 rounded bg-muted/60">
                <span className="block text-xs text-muted-foreground">Thời gian chờ trung vị</span>
                <span className="text-base font-semibold">
                  {a7.medianWait != null ? `${a7.medianWait} ngày` : "—"}
                </span>
              </div>
            </div>
          </AnalyticsCard>

          {/* A8: Operational Health */}
          <AnalyticsCard
            id="a8"
            code={a8.code}
            title={a8.title}
            question={a8.question}
            detailHref="/dashboard/admin/insights/a8"
            note={a8.note}
            table={a8.table}
          >
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Sức khỏe vận hành</caption>
                <thead className="bg-muted text-xs font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Chỉ số (thấp là tốt)</th>
                    {a8.windows.map((w) => (
                      <th key={w} scope="col" className="px-3 py-2 text-right">
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {a8.rows.map(([label, vals]) => (
                    <tr key={label} className="hover:bg-muted/40">
                      <th scope="row" className="px-3 py-2 text-left text-xs font-medium">
                        {label}
                      </th>
                      {vals.map((v, i) => (
                        <td key={i} className="px-3 py-2 text-right text-xs tabular-nums font-semibold">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnalyticsCard>
        </AnalyticsGrid>
      </div>

      {/* Section 2: Chi tiết thêm (A4, A5, A6, A9) */}
      <div className="pt-2">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h2 className="text-lg font-semibold tracking-tight">Chi tiết thêm</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenMore((prev) => !prev)}
            aria-expanded={openMore}
          >
            {openMore ? (
              <ChevronDown className="size-4 mr-1" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4 mr-1" aria-hidden="true" />
            )}
            {openMore ? "Thu gọn" : "Xem chi tiết (4 thẻ)"}
          </Button>
        </div>

        {openMore && (
          <div className="mt-4 space-y-4">
            {/* A4: Cohort Retention Heatmap */}
            <AnalyticsCard
              id="a4"
              code={a4.code}
              title={a4.title}
              question={a4.question}
              detailHref="/dashboard/admin/insights/a4"
              note={a4.note}
              table={a4.table}
              wide
            >
              <Heatmap
                rowHeader="Nhóm ghi danh"
                cols={a4.cols}
                rows={a4.rows}
                caption="Tỉ lệ còn học theo tuần"
              />
            </AnalyticsCard>

            <AnalyticsGrid>
              {/* A5: Course Completion Ranking */}
              <AnalyticsCard
                id="a5"
                code={a5.code}
                title={a5.title}
                question={a5.question}
                detailHref="/dashboard/admin/insights/a5"
                actions={
                  <div className="inline-flex p-0.5 border border-border rounded bg-muted text-xs">
                    <button
                      type="button"
                      aria-pressed={a5Sort === "rate"}
                      onClick={() => setA5Sort("rate")}
                      className={`px-2 py-0.5 rounded cursor-pointer ${a5Sort === "rate" ? "bg-card font-semibold" : "text-muted-foreground"}`}
                    >
                      Tỉ lệ
                    </button>
                    <button
                      type="button"
                      aria-pressed={a5Sort === "n"}
                      onClick={() => setA5Sort("n")}
                      className={`px-2 py-0.5 rounded cursor-pointer ${a5Sort === "n" ? "bg-card font-semibold" : "text-muted-foreground"}`}
                    >
                      Học viên
                    </button>
                  </div>
                }
                note={a5.note}
                table={a5.table}
              >
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Tỉ lệ hoàn thành theo khóa</caption>
                    <thead className="bg-muted text-xs font-semibold">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">Khóa học</th>
                        <th scope="col" className="px-3 py-2 text-right">Học viên</th>
                        <th scope="col" className="px-3 py-2 text-right">Hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {a5.rows.map((r) => (
                        <tr key={r.c.id} className="hover:bg-muted/40">
                          <th scope="row" className="px-3 py-1.5 text-left text-xs font-medium">
                            {r.c.title}
                          </th>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                            {formatNum(r.n)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs">
                            <InlineBar value={r.rate} max={100} text={`${r.rate}%`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AnalyticsCard>

              {/* A6: Diagnostic vs Lesson 1 */}
              <AnalyticsCard
                id="a6"
                code={a6.code}
                title={a6.title}
                question={a6.question}
                detailHref="/dashboard/admin/insights/a6"
                table={a6.table}
              >
                <StackedBar segments={a6.segs} format={formatNum} />
                {a6.trend.length > 1 && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <LineChart
                      series={[{ name: "% làm bài đầu vào", points: a6.trend }]}
                      yFormat={(v) => `${Math.round(v)}%`}
                      height={140}
                      ariaLabel="Tỉ lệ làm bài đầu vào theo tuần"
                    />
                  </div>
                )}
              </AnalyticsCard>
            </AnalyticsGrid>

            {/* A9: AI Health */}
            <AnalyticsCard
              id="a9"
              code={a9.code}
              title={a9.title}
              question={a9.question}
              detailHref="/dashboard/admin/insights/a9"
              note={a9.note}
              table={a9.table}
              wide
            >
              <KpiGrid>
                {a9.tiles.map((t) => (
                  <KpiTile
                    key={t.label}
                    label={t.label}
                    value={t.value}
                    prev={t.prev}
                    compare={t.compare}
                    prevMissing={w.compare && !w.prev}
                    deltaGood={t.deltaGood}
                    format={t.format}
                  />
                ))}
              </KpiGrid>
              <div className="mt-4 pt-3 border-t border-border">
                <LineChart
                  series={[
                    { name: "Kỳ này", points: a9.cur },
                    ...(a9.prev ? [{ name: "Kỳ trước", points: a9.prev, dashed: true }] : []),
                  ]}
                  threshold={{ value: 1500, label: "Mục tiêu p95 ≤ 1.500 ms" }}
                  yFormat={(v) => `${formatNum(Math.round(v))} ms`}
                  ariaLabel="Độ trễ p95"
                />
              </div>
            </AnalyticsCard>
          </div>
        )}
      </div>
    </div>
  );
}
