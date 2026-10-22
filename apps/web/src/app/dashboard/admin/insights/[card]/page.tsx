import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, Download } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Heatmap,
  HorizontalBarChart,
  InlineBar,
  KpiGrid,
  KpiTile,
  LineChart,
  StackedBar,
  formatCompact,
  formatNum,
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
import { AdminAnalyticsNav } from "../../admin-analytics-nav";

export default async function AdminInsightCardDetailPage({
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
    case "a1": {
      const a1 = getInsightsA1(w);
      code = a1.code;
      title = a1.title;
      question = a1.question;
      table = a1.table;
      content = (
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
      );
      break;
    }
    case "a2": {
      const a2 = getInsightsA2(w);
      code = a2.code;
      title = a2.title;
      question = a2.question;
      table = a2.table;
      content = (
        <div className="space-y-4">
          <LineChart
            series={[
              { name: "Kỳ này", points: a2.cur },
              ...(a2.prev ? [{ name: "Kỳ trước", points: a2.prev, dashed: true }] : []),
            ]}
            yFormat={formatNum}
            height={260}
            ariaLabel="DAU theo ngày"
          />
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
            <div className="p-3 rounded bg-muted/60">
              <span className="block text-xs text-muted-foreground">DAU trung bình</span>
              <span className="text-lg font-semibold">{formatNum(a2.curAvgDau)}</span>
            </div>
            <div className="p-3 rounded bg-muted/60">
              <span className="block text-xs text-muted-foreground">Độ gắn bó (DAU/WAU)</span>
              <span className="text-lg font-semibold">{a2.curSticky.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      );
      break;
    }
    case "a3": {
      const a3 = getInsightsA3(w);
      code = a3.code;
      title = a3.title;
      question = a3.question;
      table = a3.table;
      content = (
        <HorizontalBarChart
          items={a3.steps.map((s, i) => ({
            label: `${i + 1}. ${s.label}`,
            value: s.value,
            max: a3.steps[0]?.value || 1,
          }))}
          sort={false}
        />
      );
      break;
    }
    case "a4": {
      const a4 = getInsightsA4(w);
      code = a4.code;
      title = a4.title;
      question = a4.question;
      table = a4.table;
      content = (
        <Heatmap
          rowHeader="Nhóm ghi danh"
          cols={a4.cols}
          rows={a4.rows}
          caption="Tỉ lệ còn học theo tuần"
        />
      );
      break;
    }
    case "a5": {
      const a5 = getInsightsA5("rate");
      code = a5.code;
      title = a5.title;
      question = a5.question;
      table = a5.table;
      content = (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
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
                  <th scope="row" className="px-3 py-2 text-left text-xs font-medium">
                    {r.c.title}
                  </th>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {formatNum(r.n)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <InlineBar value={r.rate} max={100} text={`${r.rate}%`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
    case "a6": {
      const a6 = getInsightsA6(w);
      code = a6.code;
      title = a6.title;
      question = a6.question;
      table = a6.table;
      content = (
        <div className="space-y-4">
          <StackedBar segments={a6.segs} format={formatNum} />
          {a6.trend.length > 1 && (
            <LineChart
              series={[{ name: "% làm bài đầu vào", points: a6.trend }]}
              yFormat={(v) => `${Math.round(v)}%`}
              height={180}
              ariaLabel="Tỉ lệ làm bài đầu vào theo tuần"
            />
          )}
        </div>
      );
      break;
    }
    case "a7": {
      const a7 = getInsightsA7();
      code = a7.code;
      title = a7.title;
      question = a7.question;
      table = a7.table;
      content = <StackedBar segments={a7.segs} format={formatNum} />;
      break;
    }
    case "a8": {
      const a8 = getInsightsA8();
      code = a8.code;
      title = a8.title;
      question = a8.question;
      table = a8.table;
      content = (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs font-semibold">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Chỉ số (thấp là tốt)</th>
                {a8.windows.map((win) => (
                  <th key={win} scope="col" className="px-3 py-2 text-right">
                    {win}
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
      );
      break;
    }
    case "a9": {
      const a9 = getInsightsA9(w);
      code = a9.code;
      title = a9.title;
      question = a9.question;
      table = a9.table;
      content = (
        <div className="space-y-4">
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
          href={"/dashboard/admin/insights" as import("next").Route}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 inline-flex items-center gap-1.5")}
        >
          <ArrowLeft className="size-4 mr-1" aria-hidden="true" />
          Quan sát hệ thống
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
