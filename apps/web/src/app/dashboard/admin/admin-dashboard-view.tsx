import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  DollarSign,
  Receipt,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import { StatCard } from "@codi-1/ui/components/stat-card";
import { StatusBadge, type OrderStatus } from "@codi-1/ui/components/status-badge";

import type { AdminDashboardData } from "./actions";

const NAV_ITEMS = [
  { label: "Quản lý tài khoản người dùng", href: "/dashboard/admin/users", icon: Users },
  { label: "Khóa học đã xuất bản", href: "/dashboard/admin/courses", icon: BookOpen },
  { label: "Duyệt yêu cầu xuất bản khoá học", href: "/dashboard/admin/publication", icon: ClipboardCheck },
  { label: "Đơn hàng & giao dịch", href: "/dashboard/admin/orders", icon: Receipt },
  { label: "Voucher", href: "/dashboard/admin/vouchers", icon: Ticket },
  { label: "Quan sát hệ thống (Insights)", href: "/dashboard/admin/insights", icon: TrendingUp },
  { label: "Tài chính (Finance)", disabled: true, icon: DollarSign },
];

export function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const formatVnd = (amount: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

  const kpis = [
    {
      label: "Doanh thu",
      value: formatVnd(data.kpis.revenue30d),
      meta: `${data.kpis.paidOrders30d} đơn đã thanh toán`,
    },
    {
      label: "Đơn hàng",
      value: data.kpis.allOrders30d.toString(),
      meta: "Mọi trạng thái",
    },
    {
      label: "Học viên mới",
      value: data.kpis.newLearners30d.toString(),
      meta: "Tài khoản đăng ký mới",
    },
    {
      label: "Khóa học đang bán",
      value: data.kpis.publishedCourses.toString(),
      meta: "Trạng thái Đã xuất bản",
    },
  ];

  const todo = [
    {
      href: "/dashboard/admin/publication?tab=pending",
      count: data.todo.pendingCoursesCount,
      title: "Khoá học chờ duyệt",
      meta: "Xem và duyệt yêu cầu xuất bản",
    },
    {
      href: "/dashboard/admin/orders?status=pending&overdue=1&range=all",
      count: data.todo.overdueOrdersCount,
      title: "Đơn chờ thanh toán quá hạn",
      meta: "Đơn chờ thanh toán từ 24 giờ trở lên, có thể cần đối soát",
    },
    {
      href: "/dashboard/admin/vouchers?filter=expiring",
      count: data.todo.expiringVouchersCount,
      title: "Voucher sắp hết lượt",
      meta: "Đã dùng từ 90% số lượt",
    },
    {
      href: "/dashboard/admin/users?status=inactive",
      count: data.todo.inactiveUsersCount,
      title: "Tài khoản bị vô hiệu hoá",
      meta: "Xem lý do hoặc kích hoạt lại",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-2xl tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            30 ngày gần nhất · đến {new Date().toLocaleDateString("vi-VN")}
          </p>
        </div>
      </div>

      {/* 4 KPI stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <StatCard key={kpi.label} value={kpi.value} label={kpi.label} hint={kpi.meta} />
        ))}
      </div>

      {/* "Cần xử lý" Section */}
      <div className="space-y-4">
        <h2 className="text-lg tracking-tight text-foreground">Cần xử lý</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {todo.map((item) => (
            <StatCard
              key={item.title}
              value={<span>{item.count}</span>}
              label={item.title}
              hint={item.meta}
              action={<Link href={item.href as any} className="hover:underline">Mở danh sách →</Link>}
            />
          ))}
        </div>
      </div>

      {/* "Phân tích" Section */}
      <div className="space-y-4">
        <h2 className="text-lg tracking-tight text-foreground">Phân tích</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={"/dashboard/admin/insights" as any}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-5 hover:bg-muted/30 transition-colors"
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Quan sát hệ thống</h3>
              <p className="text-xs text-muted-foreground">
                Số tài khoản, khóa học và đơn hàng được tạo trong kỳ. Telemetry chưa khả dụng.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl text-primary">
                {data.kpis.newLearners30d}
              </div>
              <span className="text-xs text-muted-foreground">học viên mới</span>
            </div>
          </Link>

          <div
            aria-disabled="true"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-5"
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Tài chính</h3>
              <p className="text-xs text-muted-foreground">
                Phân tích tài chính, đối soát và hoàn tiền chưa khả dụng.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl text-primary">
                Chưa khả dụng
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* "Đơn hàng gần đây" Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-tight text-foreground">Đơn hàng gần đây</h2>
          <Link
            href={"/dashboard/admin/orders" as any}
            className="text-xs font-medium text-primary hover:underline"
          >
            Xem tất cả
          </Link>
        </div>

        {data.recentOrders.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã</th>
                  <th className="px-4 py-3 font-medium">Người mua</th>
                  <th className="px-4 py-3 font-medium text-right">Số tiền</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{o.code}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{o.buyerName}</div>
                        <div className="text-xs text-muted-foreground">{o.buyerEmail}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatVnd(o.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1.5">
                        <StatusBadge kind="order" status={o.status as OrderStatus} />
                        {o.isOverdue && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                            Quá hạn
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-card">
            Chưa có đơn hàng nào trong hệ thống.
          </div>
        )}

      {/* Menu & Navigation Shortcuts Section (Ensures UI-ADM-01 & UI-ADM-03 compatibility) */}
      <div className="space-y-4 pt-4 border-t border-border/40">
        <h2 className="text-lg tracking-tight text-foreground">Chức năng & Lối tắt</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              {item.href && !item.disabled ? (
                <Link
                  href={item.href as any}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 text-sm hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{item.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3.5 text-sm">
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground font-medium">{item.label}</span>
                  </div>
                  <span className="text-xs rounded bg-muted px-2 py-0.5 text-muted-foreground">
                    Chưa khả dụng
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      </div>
    </div>
  );
}
