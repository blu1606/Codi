"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  AnalyticsCard,
  AnalyticsGrid,
  AnalyticsToolbar,
  BarChart,
  FunnelChart,
  HorizontalBarChart,
  InlineBar,
  KpiGrid,
  KpiTile,
  LineChart,
  StackedBar,
  StackedCols,
  downloadCsv,
  formatCompact,
  formatNum,
  formatVnd,
  formatVndCompact,
  type PeriodValue,
} from "@codi-1/ui/components/charts";
import {
  formatRangeText,
  getAnalyticsWindow,
  getFinanceB1,
  getFinanceB2,
  getFinanceB3,
  getFinanceB4,
  getFinanceB5,
  getFinanceB6,
  getFinanceB7,
  getFinanceB8,
} from "@/lib/admin-analytics-service";

export function AdminFinanceView() {
  const [period, setPeriod] = React.useState<PeriodValue>("30");
  const [compare, setCompare] = React.useState<boolean>(true);
  const [openMore, setOpenMore] = React.useState<boolean>(false);
  const [b3Group, setB3Group] = React.useState<"course" | "category" | "lecturer">("course");

  const w = React.useMemo(() => {
    return getAnalyticsWindow(period, compare);
  }, [period, compare]);

  const b1 = React.useMemo(() => getFinanceB1(w), [w]);
  const b2 = React.useMemo(() => getFinanceB2(w), [w]);
  const b4 = React.useMemo(() => getFinanceB4(w), [w]);
  const b8 = React.useMemo(() => getFinanceB8(), []);

  const b3 = React.useMemo(() => getFinanceB3(w, b3Group), [w, b3Group]);
  const b5 = React.useMemo(() => getFinanceB5(w), [w]);
  const b6 = React.useMemo(() => getFinanceB6(w), [w]);
  const b7 = React.useMemo(() => getFinanceB7(w), [w]);

  const buildDetailHref = (cardId: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams({
      period,
      compare: compare ? "true" : "false",
      ...(extra || {}),
    });
    return `/dashboard/admin/finance/${cardId}?${params.toString()}`;
  };

  const rangeText = formatRangeText(w);

  const handleExportAll = () => {
    const combinedRows: (string | number)[][] = [];
    [b1, b2, b4, b8, b3, b5, b6, b7].forEach((card) => {
      combinedRows.push([`${card.code} · ${card.title}`]);
      combinedRows.push(card.table.headers);
      card.table.rows.forEach((r) => combinedRows.push(r));
      combinedRows.push([]);
    });
    downloadCsv(`codi-finance-${w.asOf}.csv`, ["Báo cáo tài chính Codi", rangeText], combinedRows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tài chính</h1>
          <p className="text-sm text-muted-foreground">
            Doanh thu, đơn hàng và việc cần đối soát.
          </p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="size-4 mr-1.5" aria-hidden="true" />
            Xuất CSV tài chính
          </Button>
        </div>
      </div>

      {/* Shared Toolbar */}
      <AnalyticsToolbar
        selectedPeriod={period}
        onSelectPeriod={setPeriod}
        compare={compare}
        onToggleCompare={setCompare}
        rangeText={rangeText}
      />

      {/* Section 1: Tổng quan (B1, B2, B4, B8) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Tổng quan</h2>

        {/* B1: KPI Doanh thu */}
        <AnalyticsCard
          id="b1"
          code={b1.code}
          title={b1.title}
          question={b1.question}
          detailHref={buildDetailHref("b1")}
          table={{
            headers: b1.table.headers,
            rows: b1.tiles.map((t) => [
              t.label,
              t.isVnd ? formatVnd(t.value) : formatNum(t.value),
              t.prev != null ? (t.isVnd ? formatVnd(t.prev) : formatNum(t.prev)) : "—",
            ]),
          }}
          wide
        >
          <KpiGrid>
            {b1.tiles.map((t) => (
              <KpiTile
                key={t.label}
                label={t.label}
                value={t.value}
                prev={t.prev}
                compare={w.compare}
                prevMissing={w.compare && !w.prev}
                deltaGood={t.deltaGood}
                format={t.isVnd ? formatVndCompact : formatNum}
              />
            ))}
          </KpiGrid>
        </AnalyticsCard>

        {/* B2: Doanh thu theo thời gian */}
        <AnalyticsCard
          id="b2"
          code={b2.code}
          title={b2.title}
          question={b2.question}
          detailHref={buildDetailHref("b2")}
          table={b2.table}
          wide
        >
          <LineChart
            series={[
              { name: "Kỳ này", points: b2.cur },
              ...(b2.prev ? [{ name: "Kỳ trước", points: b2.prev, dashed: true }] : []),
              {
                name: "Trung bình kỳ này",
                role: "average" as const,
                points: b2.cur.map((p) => ({ x: p.x, y: b2.mean, label: p.label })),
              },
            ]}
            yFormat={(v) => formatCompact(v)}
            height={220}
            ariaLabel="Doanh thu theo thời gian"
          />
        </AnalyticsCard>

        <AnalyticsGrid>
          {/* B4: Trạng thái đơn hàng */}
          <AnalyticsCard
            id="b4"
            code={b4.code}
            title={b4.title}
            question={b4.question}
            detailHref={buildDetailHref("b4")}
            table={b4.table}
          >
            <div className="p-3 rounded bg-muted/60 mb-3">
              <span className="block text-xs text-muted-foreground">Tỉ lệ thanh toán thành công</span>
              <span className="text-lg font-bold">{b4.successRate}%</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                {formatNum(b4.created)} đơn được tạo · {formatNum(b4.paidCount)} đơn đã thanh toán
              </span>
            </div>

            <StackedBar segments={b4.segs} format={formatNum} amountFormat={formatVndCompact} />

            {b4.wk.length > 1 && (
              <div className="mt-4 pt-3 border-t border-border">
                <StackedCols
                  cols={b4.wk}
                  keys={[
                    { label: "Đã thanh toán", tone: "good" as const },
                    { label: "Hết hạn / huỷ", tone: "neutral" as const },
                    { label: "Thiếu tiền / chờ", tone: "serious" as const },
                  ]}
                  format={formatNum}
                  height={150}
                  ariaLabel="Đơn theo tuần"
                />
              </div>
            )}
          </AnalyticsCard>

          {/* B8: Cần đối soát */}
          <AnalyticsCard
            id="b8"
            code={b8.code}
            title={b8.title}
            question={b8.question}
            detailHref={buildDetailHref("b8")}
            note={b8.note}
            table={b8.table}
          >
            {b8.total > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {b8.cards.map((c) => (
                  <div
                    key={c.title}
                    className={`p-3 rounded-lg border flex flex-col justify-between gap-2 ${
                      c.count > 0 ? "border-warning bg-warning-soft" : "border-border bg-card"
                    }`}
                  >
                    <div>
                      <span className="block text-xs text-muted-foreground">{c.title}</span>
                      <span className="text-2xl font-bold leading-tight">{c.count}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{c.hint}</span>
                    {c.count > 0 && (
                      <Link
                        href={"/dashboard/admin/orders?status=pending&overdue=1&range=all" as import("next").Route}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-7 text-xs")}
                      >
                        Mở danh sách
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-sm text-muted-foreground">
                Không có đơn cần đối soát.
              </div>
            )}
          </AnalyticsCard>
        </AnalyticsGrid>
      </div>

      {/* Section 2: Chi tiết thêm (B3, B5, B6, B7, B9) */}
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
            {openMore ? "Thu gọn" : "Xem chi tiết (5 thẻ)"}
          </Button>
        </div>

        {openMore && (
          <div className="mt-4 space-y-4">
            {/* B3: Doanh thu theo khóa học / danh mục / giảng viên */}
            <AnalyticsCard
              id="b3"
              code={b3.code}
              title={b3.title}
              question={b3.question}
              detailHref={buildDetailHref("b3", { group: b3Group })}
              actions={
                <div className="inline-flex p-0.5 border border-border rounded bg-muted text-xs">
                  {(["course", "category", "lecturer"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={b3Group === mode}
                      onClick={() => setB3Group(mode)}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        b3Group === mode ? "bg-card font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {mode === "course" ? "Khóa học" : mode === "category" ? "Danh mục" : "Giảng viên"}
                    </button>
                  ))}
                </div>
              }
              note={b3.note}
              table={b3.table}
              wide
            >
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs font-semibold">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">{b3.head}</th>
                      <th scope="col" className="px-3 py-2 text-right">Đơn (ước tính)</th>
                      <th scope="col" className="px-3 py-2 text-right">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {b3.rows.map((r) => (
                      <tr key={r.k} className="hover:bg-muted/40">
                        <th scope="row" className="px-3 py-1.5 text-left text-xs font-medium">
                          {r.k}
                        </th>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                          {formatNum(r.orders)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs">
                          <InlineBar value={r.v} max={b3.rows[0]?.v || 1} text={formatVnd(r.v)} />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/60 font-semibold border-t-2 border-border">
                      <th scope="row" className="px-3 py-2 text-left text-xs">Tổng</th>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {formatNum(b3.rows.reduce((s, r) => s + r.orders, 0))}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {formatVnd(b3.totalRev)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </AnalyticsCard>

            <AnalyticsGrid>
              {/* B5: Phễu thanh toán */}
              <AnalyticsCard
                id="b5"
                code={b5.code}
                title={b5.title}
                question={b5.question}
                detailHref={buildDetailHref("b5")}
                note={b5.note}
                table={b5.table}
              >
                <FunnelChart steps={b5.steps} />
                <h4 className="text-xs font-semibold mt-4 mb-2">Theo nguồn</h4>
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted font-semibold">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left">Nguồn</th>
                        <th className="px-2.5 py-1.5 text-right">Lượt bấm</th>
                        <th className="px-2.5 py-1.5 text-right">Tạo đơn</th>
                        <th className="px-2.5 py-1.5 text-right">Tỉ lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {b5.sources.map((src) => (
                        <tr key={src.source}>
                          <th className="px-2.5 py-1 text-left font-normal">{src.source}</th>
                          <td className="px-2.5 py-1 text-right tabular-nums">{formatNum(src.clicks)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums">{formatNum(src.orders)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums font-medium">{src.rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AnalyticsCard>

              {/* B6: Thời gian thanh toán */}
              <AnalyticsCard
                id="b6"
                code={b6.code}
                title={b6.title}
                question={b6.question}
                detailHref={buildDetailHref("b6")}
                table={b6.table}
              >
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="p-2.5 rounded bg-muted/60">
                    <span className="block text-xs text-muted-foreground">Trung vị</span>
                    <span className="text-base font-semibold">{b6.medianLabel || "—"}</span>
                  </div>
                  <div className="p-2.5 rounded bg-muted/60">
                    <span className="block text-xs text-muted-foreground">Hết hạn (&gt; 30 phút)</span>
                    <span className="text-base font-semibold">{formatNum(b6.expired)}</span>
                  </div>
                </div>

                <BarChart
                  items={[
                    ...b6.buckets.map((x) => ({ label: x.label, value: x.value })),
                    { label: "Hết hạn", value: b6.expired, tone: "neutral" as const },
                  ]}
                  format={formatNum}
                  valueLabel="Số đơn"
                  ariaLabel="Phân bố thời gian thanh toán"
                />
              </AnalyticsCard>
            </AnalyticsGrid>

            {/* B7: Voucher Performance */}
            <AnalyticsCard
              id="b7"
              code={b7.code}
              title={b7.title}
              question={b7.question}
              detailHref={buildDetailHref("b7")}
              note={b7.note}
              table={{
                headers: b7.table.headers,
                rows: b7.rows.map((r) => [
                  r.code,
                  r.uses,
                  formatVnd(r.discount),
                  formatVnd(r.revenue),
                  r.status,
                ]),
              }}
              wide
            >
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs font-semibold">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Mã</th>
                      <th scope="col" className="px-3 py-2 text-right">Lượt dùng</th>
                      <th scope="col" className="px-3 py-2 text-right">Tiền giảm</th>
                      <th scope="col" className="px-3 py-2 text-right">Doanh thu có mã</th>
                      <th scope="col" className="px-3 py-2 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {b7.rows.map((r) => (
                      <tr key={r.code} className="hover:bg-muted/40">
                        <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs">
                          {r.code}
                        </th>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                          {formatNum(r.uses)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                          {formatVnd(r.discount)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums font-semibold">
                          {formatVnd(r.revenue)}
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${
                              r.status === "Đang chạy"
                                ? "bg-success-soft text-success font-medium"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnalyticsCard>

            {/* B9: Xuất CSV info card */}
            <AnalyticsCard
              id="b9"
              code="B9"
              title="Xuất CSV cho kế toán"
              question="Tải số liệu của trang này cho kế toán"
              wide
            >
              <p className="text-sm text-muted-foreground mb-3">
                File dùng đúng khoảng thời gian đang chọn, giờ theo GMT+7.
              </p>
              <Button onClick={handleExportAll} size="sm">
                <Download className="size-4 mr-1.5" aria-hidden="true" />
                Tải toàn bộ số liệu tài chính (.csv)
              </Button>
            </AnalyticsCard>
          </div>
        )}
      </div>
    </div>
  );
}
