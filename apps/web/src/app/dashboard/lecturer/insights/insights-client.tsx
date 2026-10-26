import Link from "next/link";
import { cn } from "@codi-1/ui/lib/utils";
import {
  AnalyticsCard,
  KpiTile,
  LineChart,
  formatNum,
  formatPct,
  formatVnd,
  formatVndCompact,
} from "@codi-1/ui/components/charts";
import { dayLabel, dayLabelFull, rangeLabel } from "@/components/analytics/analytics-format";
import type { LecturerInsightsDto } from "@/lib/lecturer-insights-service";

const PERIOD_OPTIONS = [
  { value: "7", label: "7 ngày" },
  { value: "30", label: "30 ngày" },
  { value: "90", label: "90 ngày" },
];

export function InsightsClient({ data, period }: { data: LecturerInsightsDto; period: string }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Doanh thu khóa học của tôi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi doanh thu và đơn hàng. Dữ liệu lọc theo khoá học bạn dạy.
        </p>
      </div>

      {data.state === "no-courses" && (
        <EmptyNote title="Bạn chưa có khoá học nào" body="Tạo khoá học và xuất bản để bắt đầu bán." />
      )}
      {data.state === "no-published" && (
        <EmptyNote title="Chưa có khoá học nào được xuất bản" body="Khi xuất bản khoá học, doanh thu sẽ hiển thị ở đây." />
      )}
      {data.state === "ready" && <Ready data={data} period={period} />}
    </section>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Ready({ data, period }: { data: Extract<LecturerInsightsDto, { state: "ready" }>; period: string }) {
  const t = data.totals;
  const p = data.previousTotals;
  const courseTotal = data.courses.reduce((sum, c) => sum + c.net, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Khoảng thời gian" className="flex gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`?period=${option.value}`}
              aria-current={period === option.value ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                period === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        <span className="text-sm text-muted-foreground">{rangeLabel(data.window, data.previousWindow)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Doanh thu gộp" value={t.gross} prev={p.gross} format={formatVnd} />
        <KpiTile label="Doanh thu ròng" value={t.net} prev={p.net} format={formatVnd} />
        <KpiTile label="Đơn thanh toán" value={t.paidOrders} prev={p.paidOrders} />
        <KpiTile label="Tiền giảm giá" value={t.discount} prev={p.discount} format={formatVnd} deltaGood="down" />
        <KpiTile label="Hoàn tiền" value={t.refunds} prev={p.refunds} format={formatVnd} deltaGood="down" />
      </div>

      <AnalyticsCard
        id="s29b-revenue"
        title="Doanh thu theo thời gian"
        question="Doanh thu ròng theo ngày, so với kỳ trước"
        state="ok"
        note={`Trung bình kỳ này: ${formatVnd(Math.round(t.net / Math.max(data.daily.length, 1)))}/ngày · Tổng: ${formatVnd(t.net)}`}
        table={{
          headers: ["Ngày", "Ròng kỳ này", "Ròng kỳ trước (cùng vị trí)"],
          rows: data.daily.map((d, i) => [dayLabelFull(d.date), formatVnd(d.net), data.previousDaily[i] ? formatVnd(data.previousDaily[i]!.net) : "—"]),
        }}
      >
        <LineChart
          ariaLabel="Doanh thu ròng theo ngày"
          height={200}
          yFormat={(v) => formatVndCompact(v)}
          series={[
            { name: "Kỳ này", points: data.daily.map((d) => ({ x: d.date, y: d.net, label: dayLabel(d.date) })) },
            { name: "Kỳ trước", dashed: true, points: data.previousDaily.map((d) => ({ x: d.date, y: d.net, label: dayLabel(d.date) })) },
          ]}
        />
      </AnalyticsCard>

      <AnalyticsCard
        id="s29b-courses"
        title="Doanh thu theo khoá học"
        question="Khoá nào mang lại doanh thu trong kỳ?"
        state={data.courses.length ? "ok" : "empty"}
        emptyText="Không có khoá học nào có doanh thu trong kỳ này."
      >
        {data.courses.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Doanh thu theo khoá học</caption>
              <thead>
                <tr>
                  <th scope="col">Khoá học</th>
                  <th scope="col" className="num">Đơn</th>
                  <th scope="col" className="num">Gộp</th>
                  <th scope="col" className="num">Ròng</th>
                  <th scope="col" className="num">Tỉ lệ</th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map((course) => (
                  <tr key={course.courseId}>
                    <th scope="row">{course.title}</th>
                    <td className="num">{formatNum(course.paidOrders)}</td>
                    <td className="num">{formatVnd(course.gross)}</td>
                    <td className="num">{formatVnd(course.net)}</td>
                    <td className="num">{formatPct(courseTotal ? (course.net / courseTotal) * 100 : 0)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <th scope="row">Tổng cộng</th>
                  <td className="num">{formatNum(t.paidOrders)}</td>
                  <td className="num">{formatVnd(t.gross)}</td>
                  <td className="num">{formatVnd(courseTotal)}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </AnalyticsCard>
    </>
  );
}
