import type { ReactNode } from "react";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { cn } from "@codi-1/ui/lib/utils";

/**
 * KPI / "Cần xử lý" tile as in the mockup: number on top in primary, label, muted hint,
 * optional action link (pass a Link, e.g. "Mở danh sách →"). No icon.
 */
export function StatCard({ value, label, hint, action, className }: {
  value: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="grid gap-1 p-4">
        <p className="font-display text-2xl font-semibold tabular-nums text-primary">{value}</p>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
        {action && <div className="mt-2 text-sm font-medium text-primary">{action}</div>}
      </CardContent>
    </Card>
  );
}
