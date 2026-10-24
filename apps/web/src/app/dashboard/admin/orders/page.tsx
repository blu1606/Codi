import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminOrders, type AdminOrdersFilter } from "@/lib/admin-orders-service";
import { OrdersTableClient } from "./orders-table-client";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const resolvedParams = await searchParams;
  const range = typeof resolvedParams.range === "string" ? resolvedParams.range : "30";
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : "all";
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q : "";
  const overdueOnly = resolvedParams.overdue === "1";
  const reconciliationOnly = resolvedParams.reconciliation === "1";

  const filter: AdminOrdersFilter = {
    range: range as any,
    status: status as any,
    q,
    overdueOnly,
    reconciliationOnly,
  };

  const { orders, stats } = await getAdminOrders(db, filter);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Quay lại Bàn làm việc
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Đơn hàng & giao dịch</h1>
          <p className="text-sm text-muted-foreground">
            Thanh toán chuyển khoản VietQR, xác nhận tự động theo nội dung chuyển khoản.
          </p>
        </div>
      </div>

      <OrdersTableClient
        orders={orders}
        stats={stats}
        initialFilter={{
          range,
          status,
          q,
          overdue: overdueOnly,
          reconciliation: reconciliationOnly,
        }}
      />
    </div>
  );
}
