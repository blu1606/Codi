"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

export interface AdminNavProps {
  className?: string;
}

export function AdminAnalyticsNav({ className }: AdminNavProps) {
  const pathname = usePathname();

  const links = [
    {
      href: "/dashboard/admin/insights",
      label: "Quan sát hệ thống",
      icon: Activity,
      isActive: pathname.startsWith("/dashboard/admin/insights"),
    },
    {
      href: "/dashboard/admin/finance",
      label: "Tài chính",
      icon: TrendingUp,
      isActive: pathname.startsWith("/dashboard/admin/finance"),
    },
    {
      href: "/dashboard/admin/users",
      label: "Người dùng",
      icon: Users,
      isActive: pathname.startsWith("/dashboard/admin/users"),
    },
  ];

  return (
    <nav
      aria-label="Điều hướng quản trị"
      className={cn(
        "flex flex-wrap items-center justify-between border-b border-border bg-card px-4 py-3 gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/admin"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mr-3"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>Bảng quản trị</span>
        </Link>
        <span className="text-border" aria-hidden="true">|</span>
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href as import("next").Route}
                aria-current={link.isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  link.isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
