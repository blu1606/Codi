import { FINANCE_UNAVAILABLE, ANALYTICS_UNAVAILABLE } from "@/lib/analytics-contract";

export function AdminFinanceView() {
  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Tài chính</h1>
    <p role="status">{FINANCE_UNAVAILABLE}</p>
    <p className="text-muted-foreground">{ANALYTICS_UNAVAILABLE}</p>
  </section>;
}
