import { CircleCheck, Clock, EyeOff, FilePen, Undo2, XCircle } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

const neutral = "bg-muted text-muted-foreground";
const warning = "bg-warning-soft text-warning";
const success = "bg-success-soft text-success";
const danger = "bg-destructive-soft text-destructive";
const statuses = {
  course: {
    draft: { label: "Bản nháp", tone: neutral, Icon: FilePen },
    pending: { label: "Chờ duyệt", tone: warning, Icon: Clock },
    rejected: { label: "Bị từ chối", tone: danger, Icon: XCircle },
    published: { label: "Đã xuất bản", tone: success, Icon: CircleCheck },
    hidden: { label: "Đã ẩn", tone: neutral, Icon: EyeOff },
  },
  order: {
    pending: { label: "Chờ thanh toán", tone: warning, Icon: Clock },
    paid: { label: "Đã thanh toán", tone: success, Icon: CircleCheck },
    failed: { label: "Thất bại", tone: danger, Icon: XCircle },
    cancelled: { label: "Đã huỷ", tone: neutral, Icon: XCircle },
    refunded: { label: "Hoàn tiền", tone: "bg-info-soft text-info", Icon: Undo2 },
  },
  submission: {
    draft: { label: "Bản nháp", tone: neutral, Icon: FilePen },
    pending: { label: "Chờ chấm", tone: warning, Icon: Clock },
    graded: { label: "Đã chấm", tone: success, Icon: CircleCheck },
  },
  kmapItem: {
    suggested: { label: "Đề xuất", tone: warning, Icon: Clock },
    accepted: { label: "Đã chấp nhận", tone: success, Icon: CircleCheck },
    edited: { label: "Đã sửa", tone: "bg-info-soft text-info", Icon: FilePen },
    declined: { label: "Đã bỏ", tone: neutral, Icon: XCircle },
  },
} as const;

export type OrderStatus = keyof (typeof statuses)["order"];
export type CourseStatus = keyof (typeof statuses)["course"];

type StatusBadgeProps = { [K in keyof typeof statuses]: { kind: K; status: keyof (typeof statuses)[K]; className?: string } }[keyof typeof statuses];
export function StatusBadge(props: StatusBadgeProps) {
  const entries: Record<string, { label: string; tone: string; Icon: typeof Clock }> = statuses[props.kind];
  // Unknown values from loosely typed rows still get a readable label instead of the raw enum.
  const entry = entries[props.status as string] ?? { label: String(props.status), tone: neutral, Icon: Clock };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium", entry.tone, props.className)}>
    <entry.Icon aria-hidden="true" className="size-3.5" />{entry.label}
  </span>;
}
