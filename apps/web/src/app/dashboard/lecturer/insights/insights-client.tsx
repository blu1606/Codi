"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { RevenueLineChart } from "@/components/ui/revenue-line-chart";
import {
  formatVnd,
  INSIGHTS_PERIODS,
  type LecturerInsightsDto,
} from "@/lib/lecturer-insights-service";

interface InsightsClientProps {
  data: LecturerInsightsDto;
}

export function InsightsClient({ data }: InsightsClientProps) {
  // Empty state: Chưa có khoá học nào
  if (data.state === "no_courses") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doanh thu khóa học của tôi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi doanh thu và đơn hàng từ các khoá học bạn dạy.
          </p>
        </div>

        <Card className="border border-border/80">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 bg-muted rounded-full text-muted-foreground">
              <TrendingUp className="size-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Bạn chưa có khoá học nào</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Tạo khoá học và xuất bản để bắt đầu bán.
              </p>
            </div>
            <Link
              href={"/dashboard/lecturer/new" as any}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Tạo khoá học mới
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state: Chưa có khoá học nào được xuất bản
  if (data.state === "no_published_courses") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doanh thu khóa học của tôi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi doanh thu và đơn hàng từ các khoá học bạn dạy.
          </p>
        </div>

        <Card className="border border-border/80">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 bg-muted rounded-full text-muted-foreground">
              <TrendingUp className="size-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Chưa có khoá học nào được xuất bản</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Khi xuất bản khoá học và có học viên đăng ký, doanh thu sẽ hiển thị ở đây.
              </p>
            </div>
            <Link
              href={"/dashboard/lecturer/courses" as any}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Quản lý khoá học
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doanh thu khóa học của tôi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi doanh thu và đơn hàng. Dữ liệu lọc theo các khoá học bạn dạy.
          </p>
        </div>

        {/* Nút lọc kỳ thời gian */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border border-border bg-card self-start sm:self-auto">
          {INSIGHTS_PERIODS.map((p) => {
            const isActive = data.period === p.key;
            return (
              <Link
                key={p.key}
                href={`/dashboard/lecturer/insights?period=${p.key}` as any}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 4 Thẻ KPI (B1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.kpiData.map((kpi) => (
          <Card key={kpi.key} className="border border-border/80">
            <CardContent className="p-5 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{kpi.label}</span>
                <span>kỳ trước {kpi.formattedPrevious}</span>
              </div>

              <div className="text-2xl font-bold tracking-tight py-1">
                {kpi.formattedCurrent}
              </div>

              <div className="flex items-center gap-1 text-xs">
                {kpi.deltaPercent >= 0 ? (
                  <span className="inline-flex items-center text-primary font-medium">
                    <ArrowUpRight className="size-3.5 mr-0.5" />
                    +{kpi.deltaPercent}%
                  </span>
                ) : (
                  <span className="inline-flex items-center text-destructive font-medium">
                    <ArrowDownRight className="size-3.5 mr-0.5" />
                    {kpi.deltaPercent}%
                  </span>
                )}
                <span className="text-muted-foreground">so với kỳ trước</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Biểu đồ đường Doanh thu theo thời gian (B2) */}
      <Card className="border border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Doanh thu theo thời gian
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueLineChart
            series={data.chartData.series}
            currentTotal={data.chartData.currentTotal}
            averagePerDay={data.chartData.averagePerDay}
          />
        </CardContent>
      </Card>

      {/* Bảng Doanh thu theo khoá học (B3) */}
      <Card className="border border-border/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Doanh thu theo khoá học
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {data.courseRevenues.length} khoá học
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {!data.courseRevenues.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Không có khoá học đã xuất bản có doanh thu.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="p-3">Khoá học</th>
                    <th className="p-3 text-center">Đơn hàng</th>
                    <th className="p-3 text-right">Doanh thu</th>
                    <th className="p-3 text-right w-36">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.courseRevenues.map((row) => (
                    <tr key={row.courseId} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">
                        {row.courseTitle}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {row.ordersCount}
                      </td>
                      <td className="p-3 text-right font-medium text-foreground">
                        {formatVnd(row.revenue)}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full"
                              style={{ width: `${row.percentage}%` }}
                            />
                          </div>
                          <span className="w-8 text-muted-foreground font-medium">
                            {row.percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border font-semibold bg-muted/20">
                  <tr>
                    <td className="p-3">Tổng cộng</td>
                    <td className="p-3 text-center">{data.totalOrders}</td>
                    <td className="p-3 text-right text-primary">
                      {formatVnd(data.totalRevenue)}
                    </td>
                    <td className="p-3 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
