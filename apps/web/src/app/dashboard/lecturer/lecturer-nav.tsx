"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart,
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  MessageCircle,
  Star,
  TrendingUp,
} from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

interface LecturerNavProps {
  counts?: {
    grading?: number;
    questions?: number;
    reviews?: number;
  };
}

export function LecturerNav({ counts }: LecturerNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/dashboard/lecturer",
      label: "Tổng quan",
      icon: LayoutDashboard,
      isActive: pathname === "/dashboard/lecturer",
    },
    {
      href: "/dashboard/lecturer/courses",
      label: "Khoá học của tôi",
      icon: BookOpen,
      isActive: pathname.startsWith("/dashboard/lecturer/courses") || pathname === "/dashboard/lecturer/new",
    },
    {
      href: "/dashboard/lecturer/grading",
      label: "Chấm bài",
      icon: ClipboardCheck,
      count: counts?.grading,
      isActive: pathname.startsWith("/dashboard/lecturer/grading"),
    },
    {
      href: "/dashboard/lecturer/questions",
      label: "Hỏi đáp",
      icon: MessageCircle,
      count: counts?.questions,
      isActive: pathname.startsWith("/dashboard/lecturer/questions"),
    },
    {
      href: "/dashboard/lecturer/reviews",
      label: "Đánh giá",
      icon: Star,
      count: counts?.reviews,
      isActive: pathname.startsWith("/dashboard/lecturer/reviews"),
    },
    {
      href: "/dashboard/lecturer/progress",
      label: "Tiến độ học viên",
      icon: BarChart,
      isActive: pathname.startsWith("/dashboard/lecturer/progress"),
    },
    {
      href: "/dashboard/lecturer/insights",
      label: "Doanh thu",
      icon: TrendingUp,
      isActive: pathname.startsWith("/dashboard/lecturer/insights"),
    },
  ];

  return (
    <div className="border-b border-border/60 bg-card/50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
                  item.isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
                {typeof item.count === "number" && item.count > 0 && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 text-xs rounded-full font-semibold",
                      item.isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
