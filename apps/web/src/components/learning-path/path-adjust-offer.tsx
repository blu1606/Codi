"use client";

import { CheckCircle2, X } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Alert, AlertDescription } from "@codi-1/ui/components/alert";
import type {
  AdjustmentOffer,
  AdjustmentOption,
} from "@/lib/learning-path-contract";

// Non-blocking: it sits beside the completed lesson and never gates the next action.
export function PathAdjustOffer({
  offer,
  completing,
  applying,
  applied,
  error,
  onChoose,
  onDismiss,
  onViewPath,
}: {
  offer: AdjustmentOffer | null;
  /** The completion request is in flight: the header already reads as done. */
  completing: boolean;
  applying: AdjustmentOption | null;
  applied: { summary: string } | null;
  error: string | null;
  onChoose: (option: AdjustmentOption) => void;
  onDismiss: () => void;
  /** Opens the path map, which animates progress from this lesson to the next one. */
  onViewPath: () => void;
}) {
  return (
    <Card
      role="region"
      aria-label="Điều chỉnh lộ trình sau bài học"
      className="border-success animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            Đã hoàn thành bài học
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đóng gợi ý"
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
        {applied ? (
          <div className="space-y-3">
            <p className="text-sm">Đã cập nhật lộ trình: {applied.summary}</p>
            <Button variant="outline" size="sm" onClick={onViewPath}>
              Xem lộ trình
            </Button>
          </div>
        ) : offer ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{offer.insight}</p>
            <div className="grid gap-2">
              {offer.options.map((option) => (
                <Button
                  key={option.type}
                  variant={option.type === "keep" ? "ghost" : "outline"}
                  disabled={!!applying}
                  onClick={() => onChoose(option.type)}
                  className="h-auto min-h-11 w-full flex-col items-start gap-0.5 whitespace-normal py-2 text-left"
                >
                  <span className="font-medium">
                    {applying === option.type ? "Đang áp dụng…" : option.label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.description}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : completing ? (
          <p className="text-sm text-muted-foreground">
            Codi đang xem lại lộ trình của bạn…
          </p>
        ) : null}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
