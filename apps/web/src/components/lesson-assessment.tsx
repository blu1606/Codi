"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Alert } from "@codi-1/ui/components/alert";
import { Input } from "@codi-1/ui/components/input";
import { Textarea } from "@codi-1/ui/components/textarea";
import { ProgressRing } from "@codi-1/ui/components/progress-ring";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codi-1/ui/components/dialog";
import { toast } from "sonner";
import type {
  AssessmentCommand,
  AssessmentView,
  PreparedUpload,
} from "@/lib/assessment-contract";
import { readLessonResponse } from "@/lib/lesson-player-http";

type Props = { endpoint: string; onChanged: () => Promise<unknown> };
type Command = (command: AssessmentCommand) => Promise<AssessmentView>;
export default function LessonAssessment({ endpoint, onChanged }: Props) {
  const [data, setData] = useState<AssessmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef(false);
  const queue = useRef(Promise.resolve());
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await readLessonResponse<AssessmentView>(
        response,
        "Không thể tải quiz hoặc bài tập. Vui lòng thử lại.",
      );
      if (active.current) {
        setData(body);
        setError(null);
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error ? cause.message : "Không thể tải bài tập.",
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);
  const send: Command = (command) => {
    const job = queue.current.then(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        keepalive: command.type === "assignment-draft",
      });
      if (response.status === 409) void load();
      const body = await readLessonResponse<AssessmentView>(
        response,
        "Không thể lưu bài làm. Vui lòng thử lại.",
      );
      if (active.current) {
        setData(body);
        setError(null);
      }
      if (
        !["quiz-answer", "assignment-draft", "assignment-cancel"].includes(
          command.type,
        )
      )
        void onChanged().catch(() => {});
      return body;
    });
    queue.current = job.then(
      () => {},
      () => {},
    );
    return job;
  };
  return (
    <Card id={data ? `assessment-${data.id}` : undefined}>
      <CardContent className="space-y-5 py-6">
        {error && (
          <Alert variant="destructive">
            {error}{" "}
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Thử lại
            </Button>
          </Alert>
        )}
        {loading && !data && (
          <p
            role="status"
            className="flex items-center gap-2 text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Đang tải quiz và bài tập…
          </p>
        )}
        {data?.type === "quiz" && <QuizAssessment data={data} send={send} />}
        {data?.type === "assignment" && (
          <AssignmentAssessment
            key={data.id}
            data={data}
            send={send}
            endpoint={endpoint}
            onUpload={(body) => setData(body)}
            waitForSaves={() => queue.current}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function QuizAssessment({
  data,
  send,
}: {
  data: AssessmentView;
  send: Command;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = data.submission;
  const [selections, setSelections] = useState<Record<string, number>>({});
  const selected = (questionId: number) =>
    selections[`${s?.id}:${questionId}`] ??
    s?.answers.find((a) => a.questionId === questionId)?.optionId;
  const question = data.questions[Math.min(index, data.questions.length - 1)];
  const missing = data.questions.filter((q) => selected(q.id) == null).length;
  const act = async (command: AssessmentCommand) => {
    if (command.type === "quiz-answer") {
      const key = `${command.submissionId}:${command.questionId}`;
      setSelections((current) => ({ ...current, [key]: command.optionId }));
      setError(null);
      try {
        await send(command);
      } catch (cause) {
        setSelections((current) => {
          if (current[key] !== command.optionId) return current;
          const next = { ...current };
          delete next[key];
          return next;
        });
        setError(
          cause instanceof Error
            ? cause.message
            : "Không thể lưu đáp án. Hãy chọn lại.",
        );
      }
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await send(command);
      if (command.type === "quiz-submit") {
        setWarning(false);
        toast(
          result.submission?.isPassed
            ? `Bạn đạt ${result.submission.quizPercent ?? Math.round(((result.submission.score ?? 0) / data.maxScore) * 100)}%. Tốt lắm!`
            : "Quiz chưa đạt. Bạn có thể làm lại.",
        );
      }
      if (command.type === "quiz-open" || command.type === "quiz-retake")
        setIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu quiz.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5" aria-busy={busy}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{data.title}</h2>
        <p className="text-sm text-muted-foreground">
          {data.questions.length} câu · điểm đạt {data.passingScore}% · làm lại
          không giới hạn
        </p>
      </div>
      {data.instructions && (
        <p className="whitespace-pre-wrap text-sm">{data.instructions}</p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      {data.unavailableReason ? (
        <Alert>{data.unavailableReason}</Alert>
      ) : !s ? (
        <Button disabled={busy} onClick={() => void act({ type: "quiz-open" })}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}Làm quiz
        </Button>
      ) : s.status === "graded" ? (
        <>
          <div className="flex flex-wrap items-center gap-5 rounded-lg border p-4">
            <ProgressRing
              value={s.quizPercent ?? ((s.score ?? 0) / data.maxScore) * 100}
              label="Kết quả quiz"
            />
            <div>
              <h3
                className={
                  s.isPassed
                    ? "font-semibold text-success"
                    : "font-semibold text-warning"
                }
              >
                {s.isPassed ? "Đạt" : "Chưa đạt"}
              </h3>
              <p className="font-medium">
                {Math.round(
                  s.quizPercent ?? ((s.score ?? 0) / data.maxScore) * 100,
                )}
                % đúng
              </p>
              <p className="text-sm text-muted-foreground">
                Điểm đạt: {data.passingScore}% · Lần làm {s.attempt}
              </p>
              <p className="text-sm text-muted-foreground">
                Làm lại không giới hạn; lần gần nhất được tính.
              </p>
            </div>
          </div>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              Xem đáp án và giải thích
            </summary>
            <ol className="mt-4 space-y-6">
              {data.questions.map((q, i) => {
                const review = s.review.find((r) => r.questionId === q.id);
                const answer = s.answers.find(
                  (a) => a.questionId === q.id,
                )?.optionId;
                return (
                  <li key={q.id} className="space-y-2">
                    <h4 className="font-medium">
                      {i + 1}. {q.text}
                    </h4>
                    <p className="text-sm">
                      Bạn chọn:{" "}
                      {q.options.find((o) => o.id === answer)?.text ??
                        "Chưa trả lời"}
                    </p>
                    {review ? (
                      <>
                        <p
                          className={
                            review.isCorrect
                              ? "text-sm text-success"
                              : "text-sm text-warning"
                          }
                        >
                          {review.isCorrect ? "Đúng" : "Sai"} · Đáp án đúng:{" "}
                          {
                            q.options.find(
                              (o) => o.id === review.correctOptionId,
                            )?.text
                          }
                        </p>
                        {review.explanation && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {review.explanation}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Kết quả từ lần làm trước (không lưu chi tiết từng câu).
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act({ type: "quiz-retake", submissionId: s.id })
              }
            >
              <RotateCcw className="size-4" />
              Làm lại
            </Button>
            <a
              href="#checklist"
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-primary"
            >
              Tiếp tục
            </a>
          </div>
        </>
      ) : question ? (
        <>
          {data.previousScore !== null && (
            <p className="text-sm text-muted-foreground">
              Kết quả lần trước:{" "}
              {data.previousQuizPercent ??
                Math.round((data.previousScore / data.maxScore) * 100)}
              %. Cần nộp lần làm hiện tại để tính kết quả.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <strong>
              Câu {index + 1}/{data.questions.length}
            </strong>
            <span className="text-muted-foreground">
              {data.questions.length - missing}/{data.questions.length} đã trả
              lời
            </span>
          </div>
          <div className="flex gap-1" aria-label="Đi đến câu hỏi">
            {data.questions.map((q, i) => {
              const answered = s.answers.some((a) => a.questionId === q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={busy}
                  aria-label={`Câu ${i + 1}${answered ? ", đã trả lời" : ", chưa trả lời"}`}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => setIndex(i)}
                  className={`h-2 min-h-11 flex-1 bg-clip-content rounded-full py-[18px] ${answered ? "bg-primary" : i === index ? "bg-accent-foreground/40" : "bg-muted"}`}
                />
              );
            })}
          </div>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-3 font-semibold">{question.text}</legend>
            {question.codeSnippet && (
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
                <code>{question.codeSnippet}</code>
              </pre>
            )}
            {question.options.map((o) => (
              <label
                key={o.id}
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-accent"
              >
                <input
                  className="mt-1"
                  type="radio"
                  name={`quiz-${data.id}-${question.id}`}
                  checked={selected(question.id) === o.id}
                  onChange={() =>
                    void act({
                      type: "quiz-answer",
                      submissionId: s.id,
                      questionId: question.id,
                      optionId: o.id,
                    })
                  }
                />
                <span className="min-w-0 break-words">{o.text}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              variant="ghost"
              disabled={busy || index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft className="size-4" />
              Câu trước
            </Button>
            {index < data.questions.length - 1 ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setIndex((i) => i + 1)}
              >
                Câu tiếp
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                className="min-w-32"
                disabled={busy}
                onClick={() =>
                  missing
                    ? setWarning(true)
                    : void act({
                        type: "quiz-submit",
                        submissionId: s.id,
                        confirmUnanswered: false,
                      })
                }
              >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {busy ? "Đang gửi…" : "Nộp bài"}
              </Button>
            )}
          </div>
        </>
      ) : (
        <Alert>Quiz chưa có câu hỏi. Vui lòng liên hệ giảng viên.</Alert>
      )}
      <Dialog
        open={warning}
        onOpenChange={(open) => {
          if (!busy) setWarning(open);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Còn {missing} câu chưa trả lời</DialogTitle>
            <DialogDescription>
              Câu chưa trả lời sẽ được tính là sai. Bạn muốn nộp bài ngay?
            </DialogDescription>
          </DialogHeader>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setWarning(false)}
            >
              Quay lại làm tiếp
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                s &&
                void act({
                  type: "quiz-submit",
                  submissionId: s.id,
                  confirmUnanswered: true,
                })
              }
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}Vẫn nộp
              bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignmentAssessment({
  data,
  send,
  endpoint,
  onUpload,
  waitForSaves,
}: {
  data: AssessmentView;
  send: Command;
  endpoint: string;
  onUpload: (data: AssessmentView) => void;
  waitForSaves: () => Promise<void>;
}) {
  const s = data.submission;
  const initial = s?.draft ?? s;
  const [fields, setFields] = useState({
    linkUrl: initial?.linkUrl ?? "",
    answerText: initial?.answerText ?? "",
  });
  const [editing, setEditing] = useState(
    !s || s.status === "draft" || !!s.draft,
  );
  const [saved, setSaved] = useState(
    s?.draft ? "Đã khôi phục bản nháp." : "Bản nháp được lưu tự động.",
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guard = useRef(false);
  const file = useRef<File | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const pendingFields = useRef<typeof fields | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const flush = () => {
      if (!pendingFields.current) return;
      clearTimeout(timer.current);
      const latest = pendingFields.current;
      pendingFields.current = null;
      void sendRef
        .current({ type: "assignment-draft", ...latest })
        .catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      xhr.current?.abort();
      // Preserve the last keystrokes when navigation unmounts the player before the debounce fires.
      if (pendingFields.current)
        void sendRef
          .current({ type: "assignment-draft", ...pendingFields.current })
          .catch(() => {});
    },
    [],
  );
  const update = (next: typeof fields) => {
    setFields(next);
    setSaved("Chưa lưu…");
    clearTimeout(timer.current);
    pendingFields.current = next;
    timer.current = setTimeout(() => {
      pendingFields.current = null;
      void send({ type: "assignment-draft", ...next }).then(
        () => setSaved("Đã lưu bản nháp."),
        () => setSaved("Chưa lưu được bản nháp. Vui lòng thử lại."),
      );
    }, 600);
  };
  const draft = s?.draft;
  const fileName = draft ? draft.fileName : s?.fileName;
  const ready =
    data.submissionFormat === "file"
      ? !!fileName
      : data.submissionFormat === "link"
        ? !!fields.linkUrl.trim()
        : data.submissionFormat === "text"
          ? !!fields.answerText.trim()
          : !!fileName || !!fields.linkUrl.trim();
  let linkError: string | null = null;
  if (touched && fields.linkUrl) {
    try {
      const u = new URL(fields.linkUrl);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw new Error();
    } catch {
      linkError = "Đường dẫn chưa hợp lệ. Hãy bắt đầu bằng https://";
    }
  }
  const upload = async (selected: File) => {
    if (guard.current) return;
    file.current = selected;
    setUploadError(null);
    setError(null);
    if (selected.size > data.maxFileSizeMb * 1024 * 1024) {
      setUploadError(
        `Tệp vượt quá ${data.maxFileSizeMb}MB. Hãy nén lại hoặc nộp đường dẫn.`,
      );
      return;
    }
    guard.current = true;
    setBusy(true);
    setProgress(0);
    clearTimeout(timer.current);
    pendingFields.current = null;
    try {
      await send({ type: "assignment-draft", ...fields });
      await waitForSaves();
      const metadata = async <T,>(input: unknown) =>
        readLessonResponse<T>(
          await fetch(`${endpoint}/file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
          "Không thể tải tệp lên. Vui lòng thử lại.",
        );
      const prepared = await metadata<PreparedUpload>({
        type: "prepare",
        name: selected.name,
        size: selected.size,
      });
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open("PUT", prepared.url);
        request.setRequestHeader("Content-Type", "application/octet-stream");
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(new Error("Tải lên thất bại. Vui lòng thử lại."));
        request.onerror = () =>
          reject(new Error("Tải lên thất bại do mất kết nối."));
        request.onabort = () => reject(new Error("Đã huỷ tải tệp."));
        request.send(selected);
      });
      const body = await metadata<AssessmentView>({
        type: "confirm",
        token: prepared.token,
      });
      onUpload(body);
      setSaved("Đã lưu tệp và bản nháp.");
    } catch (cause) {
      setUploadError(
        cause instanceof Error
          ? cause.message
          : "Tải lên thất bại. Vui lòng thử lại.",
      );
    } finally {
      xhr.current = null;
      guard.current = false;
      setBusy(false);
      setProgress(null);
    }
  };
  const submit = async () => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    setTouched(true);
    clearTimeout(timer.current);
    pendingFields.current = null;
    try {
      await send({ type: "assignment-submit", ...fields });
      setEditing(false);
      setUploadError(null);
      toast.success("Đã nộp bài tập. Bạn có thể hoàn thành bài học ngay.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nộp bài.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5" aria-busy={busy}>
      <h2 className="text-lg font-semibold">{data.title}</h2>
      {data.instructions && (
        <div className="space-y-2 rounded-lg bg-muted p-4">
          <h3 className="text-sm font-medium">Yêu cầu</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {data.instructions}
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Thang điểm {data.maxScore} · điểm đạt {data.passingScore}%
        {data.dueDays ? ` · hạn nộp ${data.dueDays} ngày sau khi mở bài` : ""}
      </p>
      {data.rubric && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Thang chấm
          </summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {data.rubric}
          </p>
        </details>
      )}
      {error && !editing && <Alert variant="destructive">{error}</Alert>}
      {s?.status === "graded" ? (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-success" />
            Đã chấm: {s.score?.toLocaleString("vi-VN")}/{data.maxScore}
          </h3>
          <p className="text-sm">
            {((s.score ?? 0) / data.maxScore) * 100 >= data.passingScore
              ? "Đạt"
              : "Chưa đạt"}
          </p>
          <p className="text-sm text-muted-foreground">
            Nhận xét của giảng viên
            {s.gradedAt
              ? ` · ${new Date(s.gradedAt).toLocaleDateString("vi-VN")}`
              : ""}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {s.feedback || "Không có nhận xét."}
          </p>
          <p className="text-sm text-muted-foreground">
            Bài đã chấm không thể nộp lại.
          </p>
          <SubmissionContent submission={s} />
        </div>
      ) : s?.status === "pending" && !editing ? (
        <div className="space-y-4">
          <Alert>
            <strong>Đã nộp — chờ chấm</strong>
            <p className="mt-2">
              {s.submittedAt &&
                `Nộp lúc ${new Date(s.submittedAt).toLocaleString("vi-VN")}. `}
              Bạn đã có thể hoàn thành bài học; điểm sẽ có sau khi giảng viên
              chấm.
            </p>
          </Alert>
          <SubmissionContent submission={s} />
          <Button
            variant="outline"
            onClick={async () => {
              if (guard.current) return;
              guard.current = true;
              setBusy(true);
              try {
                await send({
                  type: "assignment-draft",
                  linkUrl: s.linkUrl ?? "",
                  answerText: s.answerText ?? "",
                });
                setFields({
                  linkUrl: s.linkUrl ?? "",
                  answerText: s.answerText ?? "",
                });
                setEditing(true);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Không thể mở bản nháp.",
                );
              } finally {
                guard.current = false;
                setBusy(false);
              }
            }}
          >
            Nộp lại (trước khi được chấm)
          </Button>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {s?.status === "pending" && (
            <Alert>Bài đã nộp vẫn được giữ cho đến khi bạn nộp lại.</Alert>
          )}
          {["file", "file_or_link"].includes(data.submissionFormat ?? "") && (
            <div className="space-y-2">
              <label
                htmlFor={`file-${data.id}`}
                className="text-sm font-medium"
              >
                Tệp bài làm
                {data.submissionFormat === "file" ? " (bắt buộc)" : ""}
              </label>
              <Input
                id={`file-${data.id}`}
                type="file"
                disabled={busy}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void upload(selected);
                }}
              />
              <p className="text-sm text-muted-foreground">
                Tối đa {data.maxFileSizeMb}MB
              </p>
              {fileName && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm">Tệp đã lưu: {fileName}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (guard.current) return;
                      guard.current = true;
                      setBusy(true);
                      clearTimeout(timer.current);
                      pendingFields.current = null;
                      try {
                        await send({ type: "assignment-draft", ...fields });
                        await send({ type: "assignment-remove-file" });
                        file.current = null;
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Không thể gỡ tệp.",
                        );
                      } finally {
                        guard.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    Gỡ tệp
                  </Button>
                </div>
              )}
              {progress !== null && (
                <div role="status" className="space-y-2">
                  <progress className="h-2 w-full" max={100} value={progress} />
                  <p className="text-sm">Đang tải lên… {progress}%</p>
                </div>
              )}
              {uploadError && (
                <p role="alert" className="text-sm text-destructive">
                  {uploadError}{" "}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => file.current && void upload(file.current)}
                  >
                    Thử lại
                  </Button>
                </p>
              )}
            </div>
          )}
          {["link", "file_or_link"].includes(data.submissionFormat ?? "") && (
            <div className="space-y-2">
              <label
                htmlFor={`link-${data.id}`}
                className="text-sm font-medium"
              >
                Đường dẫn bài làm
                {data.submissionFormat === "link" ? " (bắt buộc)" : ""}
              </label>
              <Input
                id={`link-${data.id}`}
                type="url"
                value={fields.linkUrl}
                maxLength={2000}
                placeholder="https://github.com/…"
                disabled={busy}
                onBlur={() => setTouched(true)}
                aria-invalid={!!linkError}
                aria-describedby={
                  linkError ? `link-error-${data.id}` : undefined
                }
                onChange={(event) =>
                  update({ ...fields, linkUrl: event.target.value })
                }
              />
              {linkError && (
                <p
                  id={`link-error-${data.id}`}
                  className="text-sm text-destructive"
                >
                  {linkError}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor={`note-${data.id}`} className="text-sm font-medium">
              {data.submissionFormat === "text"
                ? "Bài làm (bắt buộc)"
                : "Ghi chú cho giảng viên (không bắt buộc)"}
            </label>
            <Textarea
              id={`note-${data.id}`}
              rows={4}
              maxLength={10000}
              value={fields.answerText}
              disabled={busy}
              onChange={(event) =>
                update({ ...fields, answerText: event.target.value })
              }
            />
            <p role="status" className="text-sm text-muted-foreground">
              {saved}
            </p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              className="min-w-40"
              disabled={busy || !ready || !!linkError}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {busy ? "Đang gửi…" : "Nộp bài tập"}
            </Button>
            {s?.status === "pending" && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (guard.current) return;
                  guard.current = true;
                  clearTimeout(timer.current);
                  pendingFields.current = null;
                  setBusy(true);
                  try {
                    await send({ type: "assignment-cancel" });
                    setEditing(false);
                  } catch {
                    setError("Chưa thể huỷ nộp lại. Vui lòng thử lại.");
                  } finally {
                    guard.current = false;
                    setBusy(false);
                  }
                }}
              >
                Huỷ nộp lại
              </Button>
            )}
          </div>
          {!ready && (
            <p className="text-sm text-muted-foreground">
              Cần{" "}
              {data.submissionFormat === "file"
                ? "tệp bài làm"
                : data.submissionFormat === "link"
                  ? "đường dẫn"
                  : data.submissionFormat === "text"
                    ? "bài làm"
                    : "tệp hoặc đường dẫn"}{" "}
              trước khi nộp.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
function SubmissionContent({
  submission: s,
}: {
  submission: NonNullable<AssessmentView["submission"]>;
}) {
  return (
    <div className="space-y-2 break-words text-sm">
      {s.fileUrl && (
        <a className="block text-primary underline" href={s.fileUrl} download>
          {s.fileName}
        </a>
      )}
      {s.linkUrl && (
        <a
          className="block text-primary underline"
          href={/^https?:\/\//.test(s.linkUrl) ? s.linkUrl : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {s.linkUrl}
        </a>
      )}
      {s.answerText && <p className="whitespace-pre-wrap">{s.answerText}</p>}
    </div>
  );
}
