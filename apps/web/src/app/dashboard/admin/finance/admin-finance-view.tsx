"use client";

import { useState } from "react";
import { Button } from "@codi-1/ui/components/button";
import {
  AnalyticsCard,
  BarChart,
  HorizontalBarChart,
  KpiTile,
  LineChart,
  StackedBar,
  formatNum,
  formatPct,
  formatVnd,
  formatVndCompact,
} from "@codi-1/ui/components/charts";
import { PeriodControl } from "@/components/analytics/analytics-read-panel";
import { AnalyticsUnavailableCard } from "@/components/analytics/analytics-unavailable-card";
import { dayKeyOfIso, dayLabel, dayLabelFull, rangeLabel } from "@/components/analytics/analytics-format";
import { useAnalyticsQuery } from "@/components/analytics/use-analytics-query";
import type { AnalyticsPeriod, FinanceData, OrderStatusBucket, ReconciliationItem } from "@/lib/analytics-contract";

const BUCKET_LABEL: Record<OrderStatusBucket, string> = {
  paid: "Đã thanh toán",
  awaiting: "Chờ thanh toán",
  underpaid: "Thiếu tiền",
  expired: "Hết hạn",
  failed: "Thất bại",
  cancelled: "Đã huỷ",
  refunded: "Hoàn tiền",
};

const BUCKET_TONE: Record<OrderStatusBucket, "good" | "warning" | "serious" | "neutral" | "critical" | "slot-3"> = {
  paid: "good",
  awaiting: "warning",
  underpaid: "serious",
  expired: "neutral",
  failed: "critical",
  cancelled: "slot-3",
  refunded: "critical",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  failed: "Thất bại / hết hạn",
  cancelled: "Đã huỷ",
  refunded: "Đã hoàn tiền",
};

const REASON_LABEL: Record<ReconciliationItem["reasons"][number], string> = {
  underpaid: "Thiếu tiền",
  stale: "Chờ quá 24 giờ",
  flagged: "Cần đối soát",
};

export function AdminFinanceView() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30");
  const { query, retry } = useAnalyticsQuery<FinanceData>(`/api/admin/finance/overview?period=${period}`);
  const data = query.status === "ready" ? query.data : undefined;
  const state = data ? "ok" : "loading";
  const quiet = data ? data.totals.paidOrders === 0 && data.statusDistribution.every((row) => row.orders === 0) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl tracking-tight">Tài chính</h1>
        <p className="mt-1 text-sm text-muted-foreground">Doanh thu, đơn hàng và việc cần đối soát.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PeriodControl value={period} onChange={setPeriod} />
        {data && <span className="text-sm text-muted-foreground">{rangeLabel(data.window, data.previousWindow)}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Gộp = tổng giá gốc của đơn đã thanh toán, tính theo ngày thanh toán. Ròng = gộp − giảm giá. Hoàn tiền = đơn đã hoàn, tính theo ngày cập nhật gần nhất.
      </p>

      {query.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p>Không tải được số liệu tài chính.</p>
          <Button variant="outline" size="sm" onClick={retry}>Thử lại</Button>
        </div>
      )}
      {quiet && (
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Không có đơn hàng nào được thanh toán trong kỳ này.
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-lg tracking-tight text-foreground">Tổng quan</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {data ? <OverviewCards data={data} /> : <LoadingCards />}
        </div>
      </div>

      {data && (
        <div className="space-y-3">
          <h2 className="text-lg tracking-tight text-foreground">Chi tiết thêm</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <CoursesCard data={data} state={state} />
            <AnalyticsUnavailableCard
              code="B5"
              title="Phễu thanh toán"
              question="Khách bỏ ở bước nào trước khi trả tiền?"
              reason="Chưa có số liệu: hệ thống chưa lưu lịch sử thêm giỏ hàng và mua ngay để dựng phễu từ giỏ tới thanh toán."
            />
            <PaymentTimeCard data={data} state={state} />
            <VouchersCard data={data} state={state} />
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingCards() {
  return (
    <>
      {["B1", "B2", "B4", "B8"].map((code) => (
        <AnalyticsCard key={code} id={code.toLowerCase()} code={code} title="Đang tải…" state="loading">{null}</AnalyticsCard>
      ))}
    </>
  );
}

function OverviewCards({ data }: { data: FinanceData }) {
  const t = data.totals;
  const p = data.previousTotals;
  const statusTotal = data.statusDistribution.reduce((sum, row) => sum + row.orders, 0);
  const avgNet = t.averageOrderValue;
  const recon = data.reconciliation;

  return (
    <>
      <AnalyticsCard
        id="b1"
        code="B1"
        title="Chỉ số doanh thu"
        question="Kỳ này thu được bao nhiêu?"
        wide
        className="lg:col-span-2"
        table={{
          headers: ["Chỉ số", "Kỳ này", "Kỳ trước"],
          rows: [
            ["Doanh thu gộp", formatVnd(t.gross), formatVnd(p.gross)],
            ["Doanh thu ròng sau giảm giá", formatVnd(t.net), formatVnd(p.net)],
            ["Tiền giảm giá", formatVnd(t.discount), formatVnd(p.discount)],
            ["Hoàn tiền", formatVnd(t.refunds), formatVnd(p.refunds)],
            ["Đơn đã thanh toán", formatNum(t.paidOrders), formatNum(p.paidOrders)],
            ["Giá trị đơn trung bình (ròng)", formatVnd(t.averageOrderValue), formatVnd(p.averageOrderValue)],
          ],
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile label="Doanh thu gộp" value={t.gross} prev={p.gross} format={formatVnd} />
          <KpiTile label="Doanh thu ròng sau giảm giá" value={t.net} prev={p.net} format={formatVnd} />
          <KpiTile label="Tiền giảm giá" value={t.discount} prev={p.discount} format={formatVnd} deltaGood="down" />
          <KpiTile label="Hoàn tiền" value={t.refunds} prev={p.refunds} format={formatVnd} deltaGood="down" />
          <KpiTile label="Đơn đã thanh toán" value={t.paidOrders} prev={p.paidOrders} />
          <KpiTile label="Giá trị đơn trung bình" value={avgNet} prev={p.averageOrderValue} format={formatVnd} />
        </div>
      </AnalyticsCard>

      <AnalyticsCard
        id="b2"
        code="B2"
        title="Doanh thu ròng theo ngày"
        question="Doanh thu theo ngày trong kỳ, so với kỳ trước"
        wide
        className="lg:col-span-2"
        state={data ? "ok" : "loading"}
        note={`Trung bình kỳ này: ${formatVnd(Math.round(t.net / Math.max(data.daily.length, 1)))}/ngày`}
        table={{
          headers: ["Ngày", "Ròng kỳ này", "Ròng kỳ trước (cùng vị trí)"],
          rows: data.daily.map((d, i) => [dayLabelFull(d.date), formatVnd(d.net), data.previousDaily[i] ? formatVnd(data.previousDaily[i]!.net) : "—"]),
        }}
      >
        <LineChart
          ariaLabel="Doanh thu ròng theo ngày"
          height={220}
          yFormat={(v) => formatVndCompact(v)}
          series={[
            { name: "Kỳ này", points: data.daily.map((d) => ({ x: d.date, y: d.net, label: dayLabel(d.date) })) },
            { name: "Kỳ trước", dashed: true, points: data.previousDaily.map((d) => ({ x: d.date, y: d.net, label: dayLabel(d.date) })) },
          ]}
        />
      </AnalyticsCard>

      <AnalyticsCard
        id="b4"
        code="B4"
        title="Trạng thái đơn hàng"
        question="Bao nhiêu đơn tạo ra thực sự được thanh toán?"
        wide
        className="lg:col-span-2"
        state={data ? "ok" : "loading"}
        emptyText="Không có đơn nào được tạo trong kỳ này."
        note={`Tỉ lệ thanh toán: ${formatPct(statusTotal ? (t.paidOrders / statusTotal) * 100 : 0)} trên ${formatNum(statusTotal)} đơn tạo trong kỳ. Theo ngày tạo đơn.`}
        table={{
          headers: ["Trạng thái", "Số đơn", "Tổng tiền đơn"],
          rows: data.statusDistribution.map((row) => [BUCKET_LABEL[row.bucket], formatNum(row.orders), formatVnd(row.amount)]),
        }}
      >
        <StackedBar
          segments={data.statusDistribution.map((row) => ({
            label: BUCKET_LABEL[row.bucket],
            value: row.orders,
            amount: row.amount,
            tone: BUCKET_TONE[row.bucket],
          }))}
          amountFormat={formatVnd}
          emptyText="Không có đơn nào được tạo trong kỳ này."
        />
      </AnalyticsCard>

      <AnalyticsCard
        id="b8"
        code="B8"
        title="Cần đối soát"
        question="Việc gì cần làm ngay?"
        wide
        className="lg:col-span-2"
        state={data ? "ok" : "loading"}
        note="Không phụ thuộc khoảng thời gian. Danh sách hiển thị tối đa 50 đơn, cũ nhất trước."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiTile label="Đơn thiếu tiền" value={recon.underpaid} compare={false} note="Liên hệ người mua để nhận đủ tiền." />
          <KpiTile label="Đơn chờ quá 24 giờ" value={recon.stalePending} compare={false} note="Đối soát sao kê với mã CODI#####." />
          <KpiTile label="Đơn được đánh dấu đối soát" value={recon.flagged} compare={false} note="Thanh toán thừa, muộn hoặc hết hạn khi thiếu tiền." />
        </div>
        {recon.items.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">Không có đơn cần đối soát.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Đơn cần đối soát</caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="num">Tổng tiền</th>
                  <th scope="col" className="num">Đã nhận</th>
                  <th scope="col">Lý do</th>
                  <th scope="col">Tạo lúc</th>
                </tr>
              </thead>
              <tbody>
                {recon.items.map((item) => (
                  <tr key={item.code}>
                    <th scope="row"><span className="font-mono">{item.code}</span></th>
                    <td>{ORDER_STATUS_LABEL[item.status] ?? item.status}</td>
                    <td className="num">{formatVnd(item.totalAmount)}</td>
                    <td className="num">{formatVnd(item.receivedAmount)}</td>
                    <td>{item.reasons.map((r) => REASON_LABEL[r]).join(", ")}</td>
                    <td>{dayLabelFull(dayKeyOfIso(item.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnalyticsCard>
    </>
  );
}

function CoursesCard({ data, state }: { data: FinanceData; state: "ok" | "loading" }) {
  const rows = data.courses.filter((course) => course.gross > 0 || course.refunds > 0);
  const max = rows.reduce((m, row) => Math.max(m, row.net), 0);
  return (
    <AnalyticsCard
      id="b3"
      code="B3"
      title="Doanh thu theo khóa học"
      question="Nguồn doanh thu đến từ đâu?"
      state={state}
      emptyText="Không có khoá học nào có doanh thu trong kỳ này."
      wide
      className="lg:col-span-2"
      note="Giảm giá được chia theo tỉ trọng giá của từng khóa trong đơn, nên tổng khóa có thể lệch vài đồng so với tổng."
      table={{
        headers: ["Khóa học", "Đơn", "Gộp", "Giảm giá", "Ròng", "Hoàn tiền"],
        rows: rows.map((r) => [r.title, formatNum(r.paidOrders), formatVnd(r.gross), formatVnd(r.discount), formatVnd(r.net), formatVnd(r.refunds)]),
      }}
    >
      <HorizontalBarChart
        items={rows.map((r) => ({ label: r.title, value: r.net, max, text: formatVnd(r.net) }))}
        format={(v) => formatVndCompact(v)}
        emptyText="Không có khoá học nào có doanh thu trong kỳ này."
      />
    </AnalyticsCard>
  );
}

function PaymentTimeCard({ data, state }: { data: FinanceData; state: "ok" | "loading" }) {
  const total = data.paymentTime.buckets.reduce((sum, b) => sum + b.orders, 0);
  return (
    <AnalyticsCard
      id="b6"
      code="B6"
      title="Thời gian từ tạo đơn đến thanh toán"
      question="Khách mất bao lâu để chuyển khoản?"
      state={state}
      emptyText="Không có đơn nào được thanh toán trong kỳ này."
      note={data.paymentTime.medianLabel ? `Trung vị: ${data.paymentTime.medianLabel}` : undefined}
      sample={total}
      minSample={10}
      table={{ headers: ["Khoảng thời gian", "Số đơn"], rows: data.paymentTime.buckets.map((b) => [b.label, formatNum(b.orders)]) }}
    >
      <BarChart items={data.paymentTime.buckets.map((b) => ({ label: b.label, value: b.orders }))} valueLabel="Số đơn" ariaLabel="Phân bố thời gian thanh toán" />
    </AnalyticsCard>
  );
}

function VouchersCard({ data, state }: { data: FinanceData; state: "ok" | "loading" }) {
  return (
    <AnalyticsCard
      id="b7"
      code="B7"
      title="Hiệu quả voucher"
      question="Voucher nào mang lại doanh thu?"
      state={state}
      emptyText="Không có đơn nào dùng voucher trong kỳ này."
      wide
      className="lg:col-span-2"
    >
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Hiệu quả voucher</caption>
          <thead>
            <tr>
              <th scope="col">Mã</th>
              <th scope="col" className="num">Đơn dùng</th>
              <th scope="col" className="num">Tiền giảm</th>
              <th scope="col" className="num">Doanh thu ròng</th>
            </tr>
          </thead>
          <tbody>
            {data.vouchers.map((v) => (
              <tr key={v.code}>
                <th scope="row"><span className="font-mono">{v.code}</span></th>
                <td className="num">{formatNum(v.orders)}</td>
                <td className="num">{formatVnd(v.discount)}</td>
                <td className="num">{formatVnd(v.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsCard>
  );
}
