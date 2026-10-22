import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  BarChart,
  HorizontalBarChart,
  InlineBar,
  KpiGrid,
  KpiTile,
  LineChart,
  StackedBar,
  StackedCols,
  formatCompact,
  formatNum,
  formatVnd,
  formatVndCompact,
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
import { AdminAnalyticsNav } from "../../admin-analytics-nav";

export default async function AdminFinanceCardDetailPage({
  params,
}: {
  params: Promise<{ card: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const { card } = await params;
  const w = getAnalyticsWindow("30", true);
  const rangeText = formatRangeText(w);

  let content: React.ReactNode = null;
  let code = "";
  let title = "";
  let question = "";
  let table: { headers: string[]; rows: (string | number)[][] } | null = null;

  switch (card.toLowerCase()) {
    case "b1": {
      const b1 = getFinanceB1(w);
      code = b1.code;
      title = b1.title;
      question = b1.question;
      table = b1.table;
      content = (
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
      );
      break;
    }
    case "b2": {
      const b2 = getFinanceB2(w);
      code = b2.code;
      title = b2.title;
      question = b2.question;
      table = b2.table;
      content = (
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
          height={260}
          ariaLabel="Doanh thu theo thời gian"
        />
      );
      break;
    }
    case "b3": {
      const b3 = getFinanceB3(w, "course");
      code = b3.code;
      title = b3.title;
      question = b3.question;
      table = b3.table;
      content = (
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
      );
      break;
    }
    case "b4": {
      const b4 = getFinanceB4(w);
      code = b4.code;
      title = b4.title;
      question = b4.question;
      table = b4.table;
      content = (
        <div className="space-y-4">
          <div className="p-3 rounded bg-muted/60 mb-3">
            <span className="block text-xs text-muted-foreground">Tỉ lệ thanh toán thành công</span>
            <span className="text-lg font-bold">{b4.successRate}%</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              {formatNum(b4.created)} đơn được tạo · {formatNum(b4.paidCount)} đơn đã thanh toán
            </span>
          </div>

          <StackedBar segments={b4.segs} format={formatNum} amountFormat={formatVndCompact} />

          {b4.wk.length > 1 && (
            <div className="pt-3 border-t border-border">
              <StackedCols
                cols={b4.wk}
                keys={[
                  { label: "Đã thanh toán", tone: "good" as const },
                  { label: "Hết hạn / huỷ", tone: "neutral" as const },
                  { label: "Thiếu tiền / chờ", tone: "serious" as const },
                ]}
                format={formatNum}
                height={180}
                ariaLabel="Đơn theo tuần"
              />
            </div>
          )}
        </div>
      );
      break;
    }
    case "b5": {
      const b5 = getFinanceB5(w);
      code = b5.code;
      title = b5.title;
      question = b5.question;
      table = b5.table;
      content = (
        <div className="space-y-4">
          <HorizontalBarChart
            items={b5.steps.map((s, i) => ({
              label: `${i + 1}. ${s.label}`,
              value: s.value,
              max: b5.steps[0]?.value || 1,
            }))}
            sort={false}
          />
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
        </div>
      );
      break;
    }
    case "b6": {
      const b6 = getFinanceB6(w);
      code = b6.code;
      title = b6.title;
      question = b6.question;
      table = b6.table;
      content = (
        <div className="space-y-4">
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
        </div>
      );
      break;
    }
    case "b7": {
      const b7 = getFinanceB7(w);
      code = b7.code;
      title = b7.title;
      question = b7.question;
      table = b7.table;
      content = (
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
      );
      break;
    }
    case "b8": {
      const b8 = getFinanceB8();
      code = b8.code;
      title = b8.title;
      question = b8.question;
      table = b8.table;
      content = (
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
            </div>
          ))}
        </div>
      );
      break;
    }
    default:
      notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminAnalyticsNav />
      <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <Link
          href={"/dashboard/admin/finance" as import("next").Route}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 inline-flex items-center gap-1.5")}
        >
          <ArrowLeft className="size-4 mr-1" aria-hidden="true" />
          Tài chính
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {code} · {title}
            </h1>
            <p className="text-sm text-muted-foreground">{question}</p>
          </div>
          <p className="text-xs text-muted-foreground">{rangeText}</p>
        </div>

        {/* Visual Content Card */}
        <div className="p-6 rounded-lg border border-border bg-card">
          {content}
        </div>

        {/* Detailed Table & CSV Export */}
        {table && (
          <div className="p-6 rounded-lg border border-border bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Bảng số liệu</h2>
                <p className="text-xs text-muted-foreground">{rangeText}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs font-semibold">
                  <tr>
                    {table.headers.map((h, i) => (
                      <th
                        key={h + i}
                        scope="col"
                        className={`px-4 py-2 ${i === 0 ? "text-left" : "text-right"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {table.rows.map((r, ri) => (
                    <tr key={ri} className="hover:bg-muted/40 transition-colors">
                      {r.map((c, ci) => (
                        <td
                          key={ci}
                          className={`px-4 py-2 text-xs tabular-nums ${ci === 0 ? "text-left font-medium" : "text-right"}`}
                        >
                          {String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
