"use client";

import type { ReactNode } from "react";
import {
  BarChart,
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  MessageCircle,
  Star,
  TrendingUp,
} from "lucide-react";
import { WorkspaceSidebar, type WorkspaceNavSection } from "@/components/workspace-sidebar";

interface LecturerNavProps {
  counts?: {
    grading?: number;
    questions?: number;
    reviews?: number;
  };
  children: ReactNode;
}

export function LecturerNav({ counts, children }: LecturerNavProps) {
  const sections: WorkspaceNavSection[] = [
    {
      title: "Giảng dạy",
      items: [
        { href: "/dashboard/lecturer", label: "Tổng quan", icon: LayoutDashboard, match: /^\/dashboard\/lecturer$/ },
        { href: "/dashboard/lecturer/courses", label: "Khoá học của tôi", icon: BookOpen, match: /^\/dashboard\/lecturer\/(courses|new)/ },
      ],
    },
    {
      title: "Hỗ trợ học viên",
      items: [
        { href: "/dashboard/lecturer/grading", label: "Chấm bài", icon: ClipboardCheck, count: counts?.grading },
        { href: "/dashboard/lecturer/questions", label: "Hỏi đáp", icon: MessageCircle, count: counts?.questions },
        { href: "/dashboard/lecturer/reviews", label: "Đánh giá", icon: Star, count: counts?.reviews },
        { href: "/dashboard/lecturer/progress", label: "Tiến độ học viên", icon: BarChart },
      ],
    },
    {
      title: "Kinh doanh",
      items: [
        { href: "/dashboard/lecturer/insights", label: "Doanh thu", icon: TrendingUp },
      ],
    },
  ];

  return <WorkspaceSidebar label="Khu vực giảng dạy" sections={sections}>{children}</WorkspaceSidebar>;
}
