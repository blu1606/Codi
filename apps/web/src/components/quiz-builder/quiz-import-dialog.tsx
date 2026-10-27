"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2 } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  DEFAULT_MAX_QUIZ_OPTIONS,
  parseQuizImport,
  type ImportQuestionSeparator,
  type ImportTermSeparator,
  type QuizImportDraft,
} from "@/lib/quiz-import";

const EXAMPLE_BLOCK = `Thủ đô của Việt Nam?
A. Huế
* B. Hà Nội
- Đà Nẵng
Giải thích: Hà Nội là thủ đô từ năm 1010.

Hook nào dùng để lưu state?
* useState
- useEffect`;

const EXAMPLE_TABS = `Thủ đô của Việt Nam?\tHuế\tHà Nội\tB\tHà Nội là thủ đô.
Hook nào lưu state?\tuseState\tuseEffect\t1`;

interface QuizImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxOptions?: number;
  onImport: (drafts: QuizImportDraft[]) => void;
}

export function QuizImportDialog({
  open,
  onOpenChange,
  maxOptions = DEFAULT_MAX_QUIZ_OPTIONS,
  onImport,
}: QuizImportDialogProps) {
  const [text, setText] = useState("");
  const [termSeparator, setTermSeparator] = useState<ImportTermSeparator>("auto");
  const [questionSeparator, setQuestionSeparator] = useState<ImportQuestionSeparator>("blank");

  const items = useMemo(
    () => parseQuizImport(text, { termSeparator, questionSeparator, maxOptions }),
    [text, termSeparator, questionSeparator, maxOptions],
  );
  const validItems = items.filter((item) => item.errors.length === 0);
  const invalidCount = items.length - validItems.length;

  const handleAdd = () => {
    if (validItems.length === 0) return;
    onImport(validItems.map((item) => item.draft));
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhập hàng loạt câu hỏi</DialogTitle>
          <DialogDescription>
            Dán câu hỏi từ Word, Excel, Google Sheets hoặc gõ theo khối. Xem trước bên dưới; chỉ
            câu hợp lệ mới được thêm vào bài. Bạn vẫn cần lưu bài trắc nghiệm sau khi thêm.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="font-semibold text-foreground">Dạng khối</p>
            <p className="text-muted-foreground">
              Mỗi câu một khối, các khối cách nhau bằng dòng trống. Đáp án đúng có dấu * ở đầu.
            </p>
            <pre className="whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
              {EXAMPLE_BLOCK}
            </pre>
          </div>
          <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="font-semibold text-foreground">Dạng hàng (Excel, Sheets)</p>
            <p className="text-muted-foreground">
              Mỗi dòng một câu: câu hỏi, các phương án, đáp án đúng (A–F hoặc số thứ tự 1–
              {maxOptions}), rồi giải thích nếu có. Các cột cách nhau bằng tab.
            </p>
            <pre className="whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
              {EXAMPLE_TABS}
            </pre>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
            Giữa câu và đáp án
            <select
              value={termSeparator}
              onChange={(e) => setTermSeparator(e.target.value as ImportTermSeparator)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs font-normal text-foreground"
            >
              <option value="auto">Tự động nhận dạng</option>
              <option value="tab">Tab (dạng hàng)</option>
              <option value="line">Dòng mới (dạng khối)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
            Giữa các câu
            <select
              value={questionSeparator}
              onChange={(e) => setQuestionSeparator(e.target.value as ImportQuestionSeparator)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs font-normal text-foreground"
            >
              <option value="blank">Dòng trống</option>
              <option value="semicolon">Dấu ;</option>
            </select>
          </label>
        </div>

        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dán hoặc gõ câu hỏi tại đây..."
          aria-label="Nội dung câu hỏi cần nhập"
          spellCheck={false}
          className="font-mono text-xs"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs" aria-live="polite">
          <span className="font-semibold text-foreground">
            {items.length === 0
              ? "Chưa có câu hỏi nào để xem trước"
              : `${validItems.length} câu hợp lệ${invalidCount > 0 ? ` · ${invalidCount} câu có lỗi` : ""}`}
          </span>
          {invalidCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3.5" />
              Sửa các câu có lỗi để thêm đủ
            </span>
          )}
        </div>

        {items.length > 0 && (
          <ol className="max-h-[40vh] space-y-2 overflow-y-auto pr-1" aria-label="Xem trước câu hỏi">
            {items.map((item) => {
              const valid = item.errors.length === 0;
              return (
                <li
                  key={item.index}
                  className={cn(
                    "rounded-lg border p-3 text-xs",
                    valid ? "border-border/80 bg-background" : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">Câu {item.index}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                        valid ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive",
                      )}
                    >
                      {valid ? "Hợp lệ" : "Có lỗi"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-foreground">{item.draft.text || <em className="text-muted-foreground">(không có nội dung)</em>}</p>
                  {item.draft.options.length > 0 && (
                    <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                      {item.draft.options.map((option, optionIndex) => {
                        const isCorrect = optionIndex === item.draft.correctIndex;
                        return (
                          <li
                            key={optionIndex}
                            className={cn(
                              "flex items-center gap-1.5 rounded px-2 py-1",
                              isCorrect ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground",
                            )}
                          >
                            <span className="w-4 shrink-0 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                            <span className="min-w-0 flex-1 truncate">{option || "(trống)"}</span>
                            {isCorrect && <Check className="size-3.5 shrink-0 text-primary" aria-label="Đáp án đúng" />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {item.draft.explanation && (
                    <p className="mt-1.5 text-muted-foreground">Giải thích: {item.draft.explanation}</p>
                  )}
                  {!valid && (
                    <ul className="mt-1.5 space-y-0.5 text-destructive" role="alert">
                      {item.errors.map((message) => (
                        <li key={`${item.index}-${message}`} className="flex items-start gap-1.5">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span>{message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleAdd} disabled={validItems.length === 0} className="gap-1.5">
            <CheckCircle2 className="size-4" />
            Thêm {validItems.length} câu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
