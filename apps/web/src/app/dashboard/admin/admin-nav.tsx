"use client";

import type { ReactNode } from "react";
import { BookOpen, ClipboardCheck, LayoutDashboard, Receipt, Ticket, Users } from "lucide-react";
import { WorkspaceSidebar, type WorkspaceNavSection } from "@/components/workspace-sidebar";

// Counts are omitted on purpose: the shell layout must not query the database.
const sections: WorkspaceNavSection[] = [
  {
    title: "Quản trị",
    items: [
      { href: "/dashboard/admin", label: "Tổng quan", icon: LayoutDashboard, match: /^\/dashboard\/admin$/ },
    ],
  },
  {
    title: "Khoá học",
    items: [
      { href: "/dashboard/admin/publication", label: "Duyệt xuất bản", icon: ClipboardCheck },
      { href: "/dashboard/admin/courses", label: "Khóa học đã xuất bản", icon: BookOpen },
    ],
  },
  {
    title: "Vận hành",
    items: [
      { href: "/dashboard/admin/users", label: "Người dùng", icon: Users },
      { href: "/dashboard/admin/orders", label: "Đơn hàng & giao dịch", icon: Receipt },
      { href: "/dashboard/admin/vouchers", label: "Voucher", icon: Ticket },
    ],
  },
];

export function AdminNav({ children }: { children: ReactNode }) {
  return <WorkspaceSidebar label="Quản trị" sections={sections}>{children}</WorkspaceSidebar>;
}
