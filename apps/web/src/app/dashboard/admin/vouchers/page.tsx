import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminVouchers } from "@/lib/admin-vouchers-service";
import { VouchersTableClient } from "./vouchers-table-client";

export default async function AdminVouchersPage({ searchParams }: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const params = await searchParams;
  const filter = typeof params.filter === "string" ? params.filter : undefined;
  const vouchers = await getAdminVouchers(db, filter);

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
          <h1 className="text-2xl tracking-tight">Voucher</h1>
          <p className="text-sm text-muted-foreground">
            Mã giảm giá áp dụng ở giỏ hàng. Tắt mã để ngừng áp dụng cho đơn mới.
          </p>
        </div>
      </div>

      {filter === "expiring" && (
        <p role="status" className="text-sm text-muted-foreground">
          Voucher sắp hết lượt · Đang bật, giới hạn lượt lớn hơn 0, đã dùng từ 90% số lượt.
          {" "}<Link href="/dashboard/admin/vouchers" className="text-primary hover:underline">Xem tất cả voucher</Link>
        </p>
      )}
      <VouchersTableClient vouchers={vouchers} />
    </div>
  );
}
