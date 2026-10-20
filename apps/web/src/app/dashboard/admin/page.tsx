import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  Receipt,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminDashboardData } from "./actions";

const NAV_ITEMS = [
  { label: "Quản lý tài khoản người dùng", href: "/dashboard/admin/users", icon: Users },
  { label: "Duyệt yêu cầu xuất bản khoá học", disabled: true, icon: ClipboardCheck },
  { label: "Đơn hàng & giao dịch", disabled: true, icon: Receipt },
  { label: "Voucher", disabled: true, icon: Ticket },
];

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const data = await getAdminDashboardData();
  const formatVnd = (amount: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

  const kpis = [
    {
      label: "Doanh thu",
      value: formatVnd(data.kpis.revenue30d),
      meta: `${data.kpis.paidOrders30d} đơn đã thanh toán`,
      icon: DollarSign,
    },
    {
      label: "Đơn hàng",
      value: data.kpis.allOrders30d.toString(),
      meta: "Mọi trạng thái",
      icon: Receipt,
    },
    {
      label: "Học viên mới",
      value: data.kpis.newLearners30d.toString(),
      meta: "Tài khoản đăng ký mới",
      icon: Users,
    },
    {
      label: "Khóa học đang bán",
      value: data.kpis.publishedCourses.toString(),
      meta: "Trạng thái Đã xuất bản",
      icon: BookOpen,
    },
  ];

  const todo = [
    {
      href: "/dashboard/admin/publication",
      count: data.todo.pendingCoursesCount,
      title: "Khoá học chờ duyệt",
      meta: "Giảng viên đã gửi yêu cầu xuất bản",
      icon: ClipboardCheck,
    },
    {
      href: "/dashboard/admin/orders?status=pending&overdue=1",
      count: data.todo.overdueOrdersCount,
      title: "Đơn chờ thanh toán quá hạn",
      meta: "Đơn chờ thanh toán quá 24 giờ, có thể cần đối soát",
      icon: CreditCard,
    },
    {
      href: "/dashboard/admin/vouchers",
      count: data.todo.expiringVouchersCount,
      title: "Voucher sắp hết lượt",
      meta: "Đã dùng từ 90% số lượt",
      icon: Ticket,
    },
    {
      href: "/dashboard/admin/users?status=inactive",
      count: data.todo.inactiveUsersCount,
      title: "Tài khoản bị vô hiệu hoá",
      meta: "Xem lý do hoặc kích hoạt lại",
      icon: Users,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold">
              Quản trị viên
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            30 ngày gần nhất · đến {new Date().toLocaleDateString("vi-VN")}
          </p>
        </div>
      </div>

      {/* 4 KPI Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{kpi.label}</span>
              <kpi.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {kpi.value}
            </div>
            <p className="text-xs text-muted-foreground">{kpi.meta}</p>
          </div>
        ))}
      </div>

      {/* "Cần xử lý" Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Cần xử lý</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {todo.map((item) => (
            <Link
              key={item.title}
              href={item.href as any}
              className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-foreground">{item.count}</span>
                  <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{item.meta}</p>
              </div>
              <div className="pt-4 flex items-center gap-1 text-xs font-medium text-primary">
                <span>Mở danh sách</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* "Phân tích" Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Phân tích</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={"/dashboard/admin/insights" as any}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-5 hover:bg-muted/30 transition-colors"
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Quan sát hệ thống</h3>
              <p className="text-xs text-muted-foreground">
                DAU, đăng ký mới, ghi danh, phân tích chỉ tiêu hoạt động
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold text-foreground">
                {data.kpis.newLearners30d}
              </div>
              <span className="text-xs text-muted-foreground">học viên mới</span>
            </div>
          </Link>

          <Link
            href={"/dashboard/admin/finance" as any}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-5 hover:bg-muted/30 transition-colors"
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Tài chính</h3>
              <p className="text-xs text-muted-foreground">
                Doanh thu, đơn hàng, thanh toán, hoàn tiền
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold text-foreground">
                {formatVnd(data.kpis.revenue30d)}
              </div>
              <span className="text-xs text-muted-foreground">30 ngày</span>
            </div>
          </Link>
        </div>
      </div>

      {/* "Đơn hàng gần đây" Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Đơn hàng gần đây</h2>
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
                        <span className="text-xs capitalize font-medium">{o.status}</span>
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
      </div>

      {/* Menu & Navigation Shortcuts Section (Ensures UI-ADM-01 & UI-ADM-03 compatibility) */}
      <div className="space-y-4 pt-4 border-t border-border/40">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Chức năng & Lối tắt</h2>
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
                    Sắp ra mắt
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

