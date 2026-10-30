"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { StatCardsSkeleton } from "@/components/skeletons/stat-cards-skeleton";
import { Button } from "@codi-1/ui/components/button";
import type { AnalyticsPeriod, CountData, LearnerStatsData } from "@/lib/analytics-contract";

export function PeriodControl({ value, onChange, learner = false }: {
  value: AnalyticsPeriod; onChange: (value: AnalyticsPeriod) => void; learner?: boolean;
}) {
  return <label className="flex items-center gap-2">Khoảng thời gian
    <select className="rounded-md border border-border bg-background p-2" value={value}
      onChange={(event) => onChange(event.target.value as AnalyticsPeriod)}>
      <option value="7">7 ngày</option><option value="30">30 ngày</option>
      {learner ? <option value="month">Tháng này</option> : <option value="90">90 ngày</option>}
    </select>
  </label>;
}

function Range({ window }: { window: CountData["window"] }) {
  const date = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: window.timeZone }).format(new Date(iso));
  return <p className="text-sm text-muted-foreground">
    {date(window.start)} – {date(new Date(new Date(window.end).getTime() - 1).toISOString())} (GMT+7, gồm hôm nay; dữ liệu đến thời điểm tải)
  </p>;
}

type RemoteData = CountData | LearnerStatsData;
export function AnalyticsReadPanel({ url, title, children }: {
  url: string; title: string; children: (data: RemoteData) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = url + ":" + attempt;
  const [result, setResult] = useState<{ key: string; data?: RemoteData; error?: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Analytics request failed");
        const data = await response.json() as RemoteData;
        if (!data.window || !Number.isFinite(Date.parse(data.window.start)) || !Number.isFinite(Date.parse(data.window.end))) throw new Error("Invalid analytics response");
        if (current) setResult({ key, data });
      } catch {
        if (current) setResult({ key, error: true });
      }
    })();
    return () => { current = false; controller.abort(); };
  }, [url, key]);
  const ready = result?.key === key ? result : undefined;
  const loading = !ready;
  return <section className="min-h-40 space-y-3 rounded-lg border border-border bg-card p-4" aria-label={title} aria-busy={loading}>
    <h2 className="font-semibold">{title}</h2>
    {loading && (
      <LoadingRegion label="Đang tải thống kê…" className="space-y-4">
        <Skeleton className="h-4 w-72 max-w-full" />
        <StatCardsSkeleton count={4} />
        <Skeleton className="h-48 w-full rounded-lg" />
      </LoadingRegion>
    )}
    {ready?.error && <div role="alert"><p>Không tải được thống kê.</p><Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Thử lại</Button></div>}
    {ready?.data && <><Range window={ready.data.window} />{children(ready.data)}</>}
  </section>;
}
