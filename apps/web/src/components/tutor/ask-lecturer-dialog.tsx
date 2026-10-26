"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Button } from "@codi-1/ui/components/button";
import { Textarea } from "@codi-1/ui/components/textarea";
import { Label } from "@codi-1/ui/components/label";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import { LoaderCircle } from "lucide-react";
import { validateQuestionText } from "@/lib/lesson-qa-contract";

export interface AskLecturerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  lessonId: string;
  lecturerName?: string;
  initialQuestion?: string;
  codeContext?: string;
  failingTestContext?: string | null;
  aiSummaryContext?: string;
  onSent?: () => void;
}

export function AskLecturerDialog({
  open,
  onOpenChange,
  courseId,
  lessonId,
  lecturerName = "Giảng viên",
  initialQuestion = "",
  codeContext = "",
  failingTestContext = null,
  aiSummaryContext = "",
  onSent,
}: AskLecturerDialogProps) {
  const [text, setText] = useState(initialQuestion);
  const [withCode, setWithCode] = useState(!!codeContext);
  const [withTest, setWithTest] = useState(!!failingTestContext);
  const [withAi, setWithAi] = useState(!!aiSummaryContext);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateQuestionText(text);
    if (!check.valid) {
      setError(check.error || "Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.");
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const res = await fetch(
        `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            withCode,
            withTest,
            withAi,
            code: withCode ? codeContext : undefined,
            failingTest: withTest ? failingTestContext : null,
            aiSummary: withAi ? aiSummaryContext : undefined,
          }),
        },
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Không thể gửi câu hỏi cho giảng viên.");
      }

      toast.success(
        "Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.",
      );
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gửi câu hỏi.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hỏi riêng giảng viên</DialogTitle>
          <DialogDescription>
            Chỉ bạn và {lecturerName} xem được cuộc trao đổi này.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lecturer-q-text">Câu hỏi của bạn</Label>
            <Textarea
              id="lecturer-q-text"
              rows={4}
              placeholder="Mô tả cụ thể thắc mắc của bạn..."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
              className={error ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : (
              <span className="text-xs text-muted-foreground">
                Ít nhất 10 ký tự.
              </span>
            )}
          </div>

          <fieldset className="space-y-2 rounded-lg border p-3 text-sm">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">
              Gửi kèm ngữ cảnh
            </legend>
            {codeContext && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="with-code"
                  checked={withCode}
                  onCheckedChange={(c) => setWithCode(!!c)}
                  disabled={busy}
                />
                <Label htmlFor="with-code" className="cursor-pointer text-xs font-normal">
                  Code hiện tại của bạn
                </Label>
              </div>
            )}
            {failingTestContext && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="with-test"
                  checked={withTest}
                  onCheckedChange={(c) => setWithTest(!!c)}
                  disabled={busy}
                />
                <Label htmlFor="with-test" className="cursor-pointer text-xs font-normal">
                  Test chưa đạt: <span className="font-semibold">{failingTestContext}</span>
                </Label>
              </div>
            )}
            {aiSummaryContext && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="with-ai"
                  checked={withAi}
                  onCheckedChange={(c) => setWithAi(!!c)}
                  disabled={busy}
                />
                <Label htmlFor="with-ai" className="cursor-pointer text-xs font-normal">
                  Tóm tắt trao đổi với AI trợ lý
                </Label>
              </div>
            )}
          </fieldset>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={busy || text.trim().length < 10}>
              {busy && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Gửi cho giảng viên
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
