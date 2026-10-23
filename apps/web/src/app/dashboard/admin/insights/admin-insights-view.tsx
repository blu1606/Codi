"use client";

import { useState } from "react";
import { AnalyticsReadPanel, PeriodControl } from "@/components/analytics/analytics-read-panel";
import { ANALYTICS_UNAVAILABLE, type AnalyticsPeriod, type AdminMetric, type CountData } from "@/lib/analytics-contract";

const metrics: { metric: AdminMetric; title: string }[] = [
  { metric: "users", title: "Tài khoản được tạo trong kỳ" },
  { metric: "courses", title: "Khoá học được tạo trong kỳ" },
  { metric: "orders", title: "Đơn hàng được tạo trong kỳ" },
];

export function AdminInsightsView() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30");
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Quan sát hệ thống</h1>
    <p>Đếm bản ghi được tạo theo createdAt, gồm mọi trạng thái. Không phải người dùng hoạt động, khoá đã xuất bản hay đơn đã thanh toán.</p>
    <PeriodControl value={period} onChange={setPeriod} />
    <div className="grid gap-4 sm:grid-cols-3">
      {metrics.map(({ metric, title }) => <AnalyticsReadPanel key={metric} title={title} url={`/api/admin/insights/${metric}?period=${period}`}>
        {(response) => { const data = response as CountData; return <>
          <p className="text-3xl font-semibold">{data.value.toLocaleString("vi-VN")}</p>
          {data.value === 0 && <p>Không có bản ghi được tạo trong kỳ.</p>}
        </>; }}
      </AnalyticsReadPanel>)}
    </div>
    <p role="status" className="text-muted-foreground">{ANALYTICS_UNAVAILABLE} Telemetry vận hành, AI và cohort chưa khả dụng.</p>
  </div>;
}
