"use client";

import Link from "next/link";
import { useState } from "react";
import { AnalyticsReadPanel, PeriodControl } from "@/components/analytics/analytics-read-panel";
import { ANALYTICS_UNAVAILABLE, type AnalyticsPeriod, type LearnerStatsData } from "@/lib/analytics-contract";

export function LearnerStatsView({ initialPeriod = "30", initialCourse = "all" }: {
  initialPeriod?: AnalyticsPeriod; initialCourse?: string;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [course, setCourse] = useState(initialCourse);
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Thống kê học tập</h1>
    <PeriodControl value={period} onChange={setPeriod} learner />
    {course !== "all" && <p>Đang lọc một khoá học. <button className="text-primary underline" onClick={() => setCourse("all")}>Xem tất cả khoá học</button></p>}
    <AnalyticsReadPanel title="Thông tin học tập của bạn" url={`/api/insights/stats?period=${period}&course=${encodeURIComponent(course)}`}>
      {(response) => { const data = response as LearnerStatsData; return <>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt>Khoá học đã đăng ký (hiện tại, mọi trạng thái)</dt><dd className="text-2xl font-semibold">{data.enrollments}</dd></div>
          <div><dt>Bài hoàn thành trong kỳ</dt><dd className="text-2xl font-semibold">{data.completedLessons}</dd></div>
          <div><dt>Bài đánh dấu đã học trong kỳ</dt><dd className="text-2xl font-semibold">{data.studiedLessons}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">Bài đã học là xác nhận học nội dung (studiedAt), không phải thời lượng hay mức thành thạo. Bài hoàn thành theo completedAt.</p>
        {data.completedLessons === 0 && data.studiedLessons === 0 && <p role="status">Chưa có bài đã học hoặc hoàn thành trong kỳ. <Link className="text-primary underline" href="/dashboard">Học bài đầu tiên để xem thống kê</Link></p>}
      </>; }}
    </AnalyticsReadPanel>
    <p role="status" className="text-muted-foreground">Chưa khả dụng: giờ học, chuỗi ngày, lịch học, lịch sử điểm và mức thành thạo. Không suy ra thời lượng từ vị trí video. {ANALYTICS_UNAVAILABLE}</p>
  </div>;
}
