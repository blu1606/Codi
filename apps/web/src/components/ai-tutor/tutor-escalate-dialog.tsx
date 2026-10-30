"use client";

import { useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@codi-1/ui/components/alert";
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
import { TUTOR_ESCALATE_MIN } from "@/lib/ai-tutor-contract";

export type EscalateValues = {
  text: string;
  withCode: boolean;
  withTest: boolean;
  withSummary: boolean;
};

/** S11h: private question to the course lecturer, pre-filled from the tutor thread (Flow L6d). */
export default function TutorEscalateDialog({
  open,
  onOpenChange,
  lecturerName,
  defaultText,
  hasCode,
  failingTest,
  send,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lecturerName: string | null;
  defaultText: string;
  hasCode: boolean;
  failingTest: string | null;
  send: (values: EscalateValues) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <EscalateForm
          lecturerName={lecturerName}
          defaultText={defaultText}
          hasCode={hasCode}
          failingTest={failingTest}
          send={send}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function EscalateForm({
  lecturerName,
  defaultText,
  hasCode,
  failingTest,
  send,
  close,
}: {
  lecturerName: string | null;
  defaultText: string;
  hasCode: boolean;
  failingTest: string | null;
  send: (values: EscalateValues) => Promise<void>;
  close: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(defaultText);
  const [withCode, setWithCode] = useState(hasCode);
  const [withTest, setWithTest] = useState(!!failingTest);
  const [withSummary, setWithSummary] = useState(true);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = text.trim().length < TUTOR_ESCALATE_MIN;
  const options = [
    hasCode && {
      key: "code",
      label: "Code hiện tại của bạn",
      checked: withCode,
      set: setWithCode,
    },
    failingTest && {
      key: "test",
      label: `Test chưa đạt: ${failingTest}`,
      checked: withTest,
      set: setWithTest,
    },
    {
      key: "summary",
      label: "Tóm tắt trao đổi với AI trợ lý",
      checked: withSummary,
      set: setWithSummary,
    },
  ].filter((option) => !!option);
  return (
    <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
      <form
        className="space-y-5"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          setTouched(true);
          if (tooShort || pending) return;
          setPending(true);
          setError(null);
          try {
            await send({ text: text.trim(), withCode, withTest, withSummary });
            close();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Chưa gửi được câu hỏi. Vui lòng thử lại.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Hỏi riêng giảng viên</DialogTitle>
          <DialogDescription>
            Chỉ bạn và {lecturerName ?? "giảng viên của khoá"} xem được cuộc
            trao đổi này.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={`${id}-text`} className="text-sm font-medium">
            Câu hỏi của bạn
          </label>
          <Textarea
            id={`${id}-text`}
            rows={4}
            value={text}
            maxLength={4000}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && tooShort}
            aria-describedby={`${id}-help`}
          />
          <p
            id={`${id}-help`}
            className={
              touched && tooShort
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {touched && tooShort
              ? `Câu hỏi cần ít nhất ${TUTOR_ESCALATE_MIN} ký tự để giảng viên hiểu rõ.`
              : `Ít nhất ${TUTOR_ESCALATE_MIN} ký tự.`}
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Gửi kèm</legend>
          {options.map((option) => (
            <label
              key={option.key}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={option.checked}
                disabled={pending}
                onChange={(event) => option.set(event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Huỷ
          </Button>
          <Button type="submit" className="min-w-40" disabled={pending}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Gửi cho giảng viên
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
