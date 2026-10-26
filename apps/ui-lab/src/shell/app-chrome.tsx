import type { ReactNode } from "react";
import Header from "@/components/header";
import { LecturerNav } from "@/app/dashboard/lecturer/lecturer-nav";
import { AdminNav } from "@/app/dashboard/admin/admin-nav";
import type { LabLayout } from "../screens/screen-types";

/**
 * Mirrors the real layouts: app/layout.tsx (header grid), app/dashboard/lecturer/layout.tsx
 * and app/dashboard/admin/layout.tsx (workspace sidebars). Server-only gates are skipped.
 */
export function AppChrome({ layout, children }: { layout: LabLayout; children: ReactNode }) {
  if (layout === "bare") return <>{children}</>;
  const body = layout === "lecturer"
    ? <LecturerNav counts={{ grading: 3, questions: 2, reviews: 1 }}>{children}</LecturerNav>
    : layout === "admin"
      ? <AdminNav>{children}</AdminNav>
      : children;
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <Header />
      {body}
    </div>
  );
}
