import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  Check,
  Clock,
  HelpCircle,
  ListOrdered,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { masteryLevel } from "@codi-1/ui/lib/mastery";
import { cn } from "@codi-1/ui/lib/utils";
import {
  GOAL_LABELS,
  LEVEL_LABELS,
  ONBOARDING_GOALS,
  ONBOARDING_LEVELS,
  WEEKLY_HOURS,
  type OnboardingCommand,
  type OnboardingView,
} from "@/lib/onboarding-contract";

type ScreenProps = {
  data: OnboardingView;
  busy: boolean;
  ui: {
    title: (text: string, subtitle?: string) => ReactNode;
    progress: (value: number, total: number, label: string) => ReactNode;
    action: (
      label: string,
      command: OnboardingCommand,
      disabled?: boolean,
      secondary?: boolean,
    ) => ReactNode;
  };
};
type Send = (command: OnboardingCommand) => Promise<boolean>;

const GOAL_DESCRIPTIONS: Record<string, string> = {
  project: "Ưu tiên bài thực hành và dự án cuối khoá.",
  finish: "Học đủ mọi bài theo thứ tự khoá học.",
  interview: "Ưu tiên khái niệm cốt lõi hay được hỏi.",
};
const LEVEL_DESCRIPTIONS: Record<string, string> = {
  new: "Chưa từng học chủ đề này.",
  basic: "Đã đọc hoặc làm thử vài ví dụ.",
  solid: "Đã dùng trong dự án nhỏ.",
};

export function GoalScreen({
  data,
  busy,
  ui,
  send,
}: ScreenProps & { send: Send }) {
  const e = data.enrollment;
  const { title, progress, action } = ui;
  const step = e.goalStep;
  const prompts = [
    "Bạn muốn đạt được gì với khoá học này?",
    "Bạn đang ở mức nào với chủ đề này?",
    "Mỗi tuần bạn dành được bao nhiêu thời gian?",
  ];
  const choices =
    step === 0
      ? ONBOARDING_GOALS.map((value) => ({
          value,
          label: GOAL_LABELS[value],
          description: GOAL_DESCRIPTIONS[value],
        }))
      : step === 1
        ? ONBOARDING_LEVELS.map((value) => ({
            value,
            label: LEVEL_LABELS[value],
            description: LEVEL_DESCRIPTIONS[value],
          }))
        : WEEKLY_HOURS.map((value) => ({
            value,
            label: `${value} giờ mỗi tuần`,
            description: undefined,
          }));
  const selected = [e.goalDraft.goal, e.goalDraft.level, e.goalDraft.hours][
    step
  ];
  return (
    <>
      {progress(
        step + 1,
        3,
        `${e.goalEditing ? "Chỉnh mục tiêu" : "Thiết lập lộ trình"} · Bước ${step + 1}/3`,
      )}
      {title(prompts[step]!, data.course.title)}
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">{prompts[step]}</legend>
        {choices.map(({ value, label, description }) => (
          <label
            key={value}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
              selected === value
                ? "border-primary bg-accent"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name="goal-choice"
              className="size-4 accent-primary"
              checked={selected === value}
              onChange={() => void send({ type: "goal-pick", step, value })}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              {description && (
                <span className="block text-sm text-muted-foreground">
                  {description}
                </span>
              )}
            </span>
            {selected === value && (
              <Check
                aria-hidden="true"
                className="ml-auto size-5 shrink-0 text-primary"
              />
            )}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {step > 0 ? (
          action("Quay lại", { type: "goal-back", step }, false, true)
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          {e.goalEditing
            ? action("Huỷ chỉnh sửa", { type: "goal-cancel" }, false, true)
            : action("Bỏ qua", { type: "goal-skip" }, false, true)}
          {action(
            step === 2 && e.goalEditing
              ? "Lưu và xếp lại lộ trình"
              : "Tiếp tục",
            { type: "goal-next", step },
            selected === undefined,
          )}
        </div>
      </div>
    </>
  );
}

export function ForkScreen({ ui }: ScreenProps) {
  const { title, action } = ui;
  return (
    <>
      {title(
        "Bạn muốn học như thế nào?",
        "Hai cách bắt đầu — chọn một và bạn có thể thay đổi sau.",
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <ListOrdered aria-hidden="true" className="size-7 text-primary" />
            <CardTitle>Học từ bài 1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm
              tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình.
            </p>
            <p className="text-sm font-medium">
              Tất cả bài đều mở, cần tiên quyết
            </p>
            {action("Học từ bài 1", { type: "fork-default" }, false, true)}
          </CardContent>
        </Card>
        <Card className="border-primary">
          <CardHeader>
            <span className="text-sm font-semibold text-primary">
              Khuyến nghị
            </span>
            <Sparkles aria-hidden="true" className="size-7 text-primary" />
            <CardTitle>Tìm điểm bắt đầu của tôi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ~10 phút, giúp bỏ qua phần bạn đã biết.
            </p>
            <p className="text-sm font-medium">
              Codi xếp lộ trình riêng cho bạn
            </p>
            {action("Tìm điểm bắt đầu của tôi", { type: "fork-diagnostic" })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function IntroScreen({
  data,
  busy,
  ui,
  send,
  resume,
  onResume,
}: ScreenProps & { send: Send; resume: boolean; onResume: () => void }) {
  const e = data.enrollment;
  const { title, action } = ui;
  const questions = data.diagnostic?.questions ?? [];
  return (
    <>
      {questions.length ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Bài kiểm tra đầu vào
          </p>
          {title("Giúp Codi xếp lộ trình phù hợp với bạn")}
          <p className="text-muted-foreground">
            Kết quả cho biết bạn đã nắm những khái niệm nào để bỏ qua phần đã
            biết và tập trung vào phần còn thiếu.
          </p>
        </div>
      ) : (
        title("Sẵn sàng bắt đầu")
      )}
      {questions.length ? (
        <>
          <ul className="space-y-4 text-sm">
            <li className="flex gap-3">
              <ListOrdered
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
              {questions.length} câu hỏi trắc nghiệm
            </li>
            <li className="flex gap-3">
              <Clock
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
              Khoảng {Math.ceil(questions.length * 0.75)} phút, không giới hạn
              thời gian
            </li>
            <li className="flex gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
              Không tính điểm. Chưa biết thì chọn “Tôi chưa biết”.
            </li>
          </ul>
          {resume && (
            <Alert variant="info">
              <AlertTitle>
                Bạn đang làm dở ở câu {e.diagnosticQuestionIndex + 1}
              </AlertTitle>
              <AlertDescription>
                Các câu đã trả lời vẫn được giữ.
              </AlertDescription>
            </Alert>
          )}
          <Button
            disabled={busy}
            className="min-h-11"
            onClick={async () => {
              if (await send({ type: "diagnostic-start" })) onResume();
            }}
          >
            {resume
              ? `Tiếp tục từ câu ${e.diagnosticQuestionIndex + 1}`
              : "Bắt đầu làm bài"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </>
      ) : (
        <Alert variant="info">
          <AlertTitle>Khoá học này chưa có bài kiểm tra đầu vào</AlertTitle>
          <AlertDescription>
            Bạn sẽ học theo thứ tự mặc định của khoá học.
          </AlertDescription>
        </Alert>
      )}
      {e.diagnosticStatus === "intro" && (
        <>
          <div>
            {action(
              questions.length ? "Để sau" : "Xem lộ trình",
              { type: "diagnostic-postpone" },
              false,
              questions.length > 0,
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Để sau giữ lộ trình AI hiện có; nếu chưa có, bạn học theo thứ tự mặc
            định và có thể làm bài kiểm tra sau.
          </p>
        </>
      )}
    </>
  );
}

export function QuestionScreen({
  data,
  busy,
  ui,
  send,
  retry,
  pendingType,
}: ScreenProps & {
  send: Send;
  retry: () => void;
  pendingType: OnboardingCommand["type"] | null;
}) {
  const e = data.enrollment;
  const { title, progress, action } = ui;
  const questions = data.diagnostic?.questions ?? [];
  const question = questions[e.diagnosticQuestionIndex];
  if (!question || !data.attemptId)
    return (
      <Alert variant="warning">
        Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại để tiếp tục.
        <Button onClick={retry}>Tải lại</Button>
      </Alert>
    );
  const answer = data.answers.find((a) => a.questionId === question.id);
  const attemptId = data.attemptId;
  const count = questions.length;
  return (
    <>
      {progress(
        data.answers.length,
        count,
        `Câu ${e.diagnosticQuestionIndex + 1}/${count}`,
      )}
      <p className="text-sm text-muted-foreground">
        Không tính điểm · không giới hạn thời gian · câu trả lời được lưu sau
        mỗi lựa chọn
      </p>
      {title(question.text)}
      {question.codeSnippet && (
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
          <code>{question.codeSnippet}</code>
        </pre>
      )}
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">Các lựa chọn</legend>
        {[
          ...question.options.map((option) => ({
            id: option.id,
            text: option.text,
          })),
          { id: null, text: "Tôi chưa biết" },
        ].map((option) => (
          <label
            key={option.id ?? "unknown"}
            className={cn(
              "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:ring-2 focus-within:ring-ring",
              answer &&
                (option.id === null
                  ? answer.unknown
                  : !answer.unknown && answer.optionId === option.id)
                ? "border-primary bg-accent"
                : "border-border bg-card",
            )}
          >
            <input
              type="radio"
              name="diagnostic-answer"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={
                !!answer &&
                (option.id === null
                  ? answer.unknown
                  : !answer.unknown && answer.optionId === option.id)
              }
              onChange={() =>
                void send({
                  type: "answer",
                  attemptId,
                  questionId: question.id,
                  optionId: option.id,
                  unknown: option.id === null,
                })
              }
            />
            <span className="min-w-0 break-words">
              {option.text}
              {option.id === null && (
                <span className="mt-1 block text-sm text-muted-foreground">
                  Được ghi nhận riêng, không tính là sai
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap justify-between gap-3">
        {action(
          "Câu trước",
          { type: "previous", attemptId, questionId: question.id },
          e.diagnosticQuestionIndex === 0,
          true,
        )}
        {e.diagnosticQuestionIndex === count - 1
          ? action(
              pendingType === "submit" ? "Đang nộp bài…" : "Xem kết quả",
              { type: "submit", attemptId },
              !answer,
            )
          : action(
              "Câu tiếp theo",
              { type: "next", attemptId, questionId: question.id },
              !answer,
            )}
      </div>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center text-sm text-muted-foreground"
      >
        Lưu và tiếp tục sau
      </Link>
    </>
  );
}

export function ResultScreen({
  data,
  ui,
  courseHome,
}: ScreenProps & { courseHome: Route }) {
  const e = data.enrollment;
  const { title, action } = ui;
  const result = data.result!;
  const strengths = result.concepts.filter(
    (c) => masteryLevel(c.probability) >= 3,
  );
  const gaps = result.concepts.filter((c) => masteryLevel(c.probability) <= 1);
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Kết quả bài kiểm tra đầu vào
        </p>
        {title("Codi đã hiểu điểm xuất phát của bạn")}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: result.right, label: "Đúng" },
          { value: result.wrong, label: "Sai" },
          { value: result.unknown, label: "Chưa biết" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="space-y-1 pt-5 text-center">
              <p className="text-3xl font-normal text-primary">{item.value}</p>
              <p className="text-sm text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Mức thành thạo hiện tại theo khái niệm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Điểm kiểm tra vẫn được lưu nếu chưa có bản đồ đã xác nhận. Khi đó,
            bài kiểm tra không cập nhật mức thành thạo và không được áp dụng lại
            sau khi giảng viên xác nhận bản đồ.
          </p>
          {result.concepts.length ? (
            result.concepts.map((concept) => (
              <div
                key={concept.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-medium">{concept.name}</span>
                <MasteryChip level={masteryLevel(concept.probability)} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Bài kiểm tra chưa được liên kết với khái niệm. Bạn vẫn có thể tiếp
              tục học.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Điểm mạnh</CardTitle>
          </CardHeader>
          <CardContent>
            {strengths.length ? (
              <ul className="list-inside list-disc">
                {strengths.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có khái niệm ở mức Thành thạo.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cần tập trung</CardTitle>
          </CardHeader>
          <CardContent>
            {gaps.length ? (
              <ul className="list-inside list-disc">
                {gaps.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Không có lỗ hổng lớn.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {data.canRequestPath && e.pathStatus !== "generating" ? (
        action("Xem lộ trình của tôi", { type: "request-path" })
      ) : (
        <Button render={<Link href={courseHome} />} nativeButton={false}>
          Xem lộ trình của tôi
        </Button>
      )}
    </>
  );
}

export function ReadyScreen({
  data,
  busy,
  ui,
  courseHome,
  onEdit,
}: ScreenProps & { courseHome: Route; onEdit: () => void }) {
  const e = data.enrollment;
  const { title, action } = ui;
  return (
    <>
      {title(
        e.pathStatus === "generating"
          ? "Codi đang xếp lộ trình cho bạn…"
          : "Lộ trình đã sẵn sàng",
        data.course.title,
      )}
      <Alert variant="info">
        <AlertTitle>
          {e.pathStatus === "generating"
            ? "Yêu cầu xếp lộ trình đã được lưu"
            : e.pathSource === "ai"
              ? "Đã giữ lộ trình cá nhân hoá của bạn"
              : "Bạn đang học theo thứ tự mặc định"}
        </AlertTitle>
        <AlertDescription>
          {e.pathStatus === "generating"
            ? "Bạn có thể rời trang; mục tiêu, kết quả và bài đã hoàn thành vẫn được giữ."
            : "Điều kiện tiên quyết vẫn áp dụng. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào."}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button render={<Link href={courseHome} />} nativeButton={false}>
          Mở lộ trình
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="outline" onClick={() => onEdit()} disabled={busy}>
          Chỉnh mục tiêu
        </Button>
        {["skipped", "done"].includes(e.diagnosticStatus) &&
          action(
            "Làm bài kiểm tra đầu vào",
            { type: "diagnostic-retake" },
            false,
            true,
          )}
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <HelpCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Làm bài kiểm tra muộn không đặt lại bài học đã hoàn thành hoặc điểm số.
      </p>
    </>
  );
}
