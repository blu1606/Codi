import type { ComponentProps } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

const tones = {
  info: "border-info/20 bg-info-soft text-info",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  destructive: "border-destructive/20 bg-destructive-soft text-destructive",
  accent: "border-accent-border bg-accent text-accent-foreground",
};

export function Alert({ variant = "info", className, children, ...props }: ComponentProps<"div"> & { variant?: keyof typeof tones }) {
  const Icon = variant === "success" ? CircleCheck : variant === "warning" || variant === "destructive" ? TriangleAlert : Info;
  return <div role={variant === "destructive" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md border p-4 text-sm", tones[variant], className)} {...props}>
    <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
    <div className="min-w-0 space-y-1 text-foreground">{children}</div>
  </div>;
}

export function AlertTitle(props: ComponentProps<"p">) {
  return <p {...props} className={cn("font-semibold", props.className)} />;
}
export function AlertDescription(props: ComponentProps<"div">) {
  return <div {...props} className={cn("text-sm text-muted-foreground", props.className)} />;
}
