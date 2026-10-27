import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { GOAL_LABELS } from "@/lib/onboarding-contract";
import type { CoursePathView } from "@/lib/learning-path-contract";

// Every line comes from fields the path view already carries; absent fields are omitted.
export function PathSummary({ data }: { data: CoursePathView }) {
  const goal =
    data.goal && data.goal in GOAL_LABELS
      ? GOAL_LABELS[data.goal as keyof typeof GOAL_LABELS]
      : null;
  const skippable = data.rows.filter((row) => row.status === "skippable").length;
  const facts: { label: string; value: string }[] = [
    ...(goal ? [{ label: "Mục tiêu", value: goal }] : []),
    ...(data.hours ? [{ label: "Thời gian học", value: `${data.hours} giờ/tuần` }] : []),
    ...(data.diagnosticStatus === "done"
      ? [{ label: "Kiểm tra đầu vào", value: "Đã làm bài kiểm tra" }]
      : data.diagnosticStatus === "skipped"
        ? [{ label: "Kiểm tra đầu vào", value: "Bỏ qua bài kiểm tra" }]
        : []),
    { label: "Tiến độ", value: `${data.done}/${data.total} bài đã học` },
    ...(skippable
      ? [{ label: "Có thể bỏ qua", value: `${skippable} bài vì bạn đã nắm vững các khái niệm liên quan` }]
      : []),
    ...(data.highlights.length
      ? [{ label: "Thay đổi gần đây", value: `${data.highlights.length} bài vừa được xếp lại cho bạn` }]
      : []),
  ];
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="font-semibold">Vì sao lộ trình này</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {data.rationale && (
          <p className="text-sm">
            <span className="font-medium">Nhận xét của Codi: </span>
            {data.rationale}
          </p>
        )}
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {data.source === "ai"
              ? "AI xếp theo kết quả của bạn, luôn tôn trọng bài học tiên quyết. Chọn \"Vì sao?\" ở mỗi bài để xem lý do."
              : "Đây là thứ tự mặc định của khoá học, chưa được cá nhân hoá theo kết quả của bạn."}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
