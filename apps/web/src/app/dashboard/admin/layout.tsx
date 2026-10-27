import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";

// UI shell only. Role checks stay in each page; this layout reads no data.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminNav>{children}</AdminNav>;
}
