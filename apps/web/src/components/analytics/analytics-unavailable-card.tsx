import { cn } from "@codi-1/ui/lib/utils";

/** Mockup card whose data source does not exist yet. Shows the card's code, title, question and the reason it has no data. */
export function AnalyticsUnavailableCard({ code, title, question, reason, className }: {
  code?: string;
  title: string;
  question: string;
  reason: string;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5", className)}
    >
      {code && <p className="text-xs font-semibold text-muted-foreground">{code}</p>}
      <h3 className="text-base text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{question}</p>
      <p role="status" className="mt-auto text-xs text-muted-foreground">
        {reason}
      </p>
    </section>
  );
}
