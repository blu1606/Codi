import type { ReactNode } from "react";
import { delay, http, HttpResponse } from "msw";
import { Button } from "@codi-1/ui/components/button";
import Onboarding from "@/app/learn/[courseId]/onboarding/onboarding";
import { QuestionScreen } from "@/app/learn/[courseId]/onboarding/onboarding-screens";
import {
  ONBOARDING_COURSE_ID,
  onboardingFork,
  onboardingGoalEdit,
  onboardingGoalStep1,
  onboardingGoalStep2,
  onboardingGoalStep3,
  onboardingGraded,
  onboardingInProgress,
  onboardingIntro,
  onboardingReady,
  onboardingBase,
} from "@/demo-fixtures/learner/s08-onboarding";
import type { OnboardingCommand, OnboardingView } from "@/lib/onboarding-contract";
import type { Screen, ScreenState } from "../screen-types";

const endpoint = `/api/learn/${ONBOARDING_COURSE_ID}/onboarding`;

/** GET returns the state; POST answers any command with the same state so the screen stays put. */
const onboardingHandlers = (body: OnboardingView) => [
  http.get(endpoint, () => HttpResponse.json(body)),
  http.post(endpoint, () => HttpResponse.json(body)),
];

const noop = async () => false;
const ui = {
  title: (text: string, subtitle?: string): ReactNode => (
    <div className="space-y-2">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">{text}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  ),
  progress: (value: number, total: number, label: string): ReactNode => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <progress className="h-2 w-full accent-primary" aria-label={label} value={value} max={total} />
    </div>
  ),
  action: (label: string, _command: OnboardingCommand, disabled = false, secondary = false): ReactNode => (
    <Button variant={secondary ? "outline" : "default"} className="min-h-11 min-w-32 whitespace-normal" disabled={disabled}>
      {label}
    </Button>
  ),
};

/**
 * The question screen only mounts after the learner presses "Tiếp tục" on the resumed intro,
 * which the lab cannot press. Render the real QuestionScreen with the same helpers the page uses.
 */
function QuestionState({ data, busy = false, pendingType = null }: { data: OnboardingView; busy?: boolean; pendingType?: OnboardingCommand["type"] | null }) {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <QuestionScreen data={data} busy={busy} ui={ui} send={noop} retry={() => {}} pendingType={pendingType} />
    </main>
  );
}

const screenState = (label: string, body: OnboardingView, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route: { pathname: `/learn/${ONBOARDING_COURSE_ID}/onboarding` },
  handlers: onboardingHandlers(body),
  render: () => <Onboarding courseId={ONBOARDING_COURSE_ID} />,
  ...extra,
});

export const s08OnboardingScreen: Screen = {
  id: "S08",
  title: "Thiết lập lộ trình (mục tiêu, khảo sát đầu vào)",
  group: "Học tập",
  role: "learner",
  mockupHash: `#/learn/${ONBOARDING_COURSE_ID}/onboarding`,
  states: {
    "goal-step-1": screenState("Mục tiêu · bước 1", onboardingGoalStep1),
    "goal-step-2": screenState("Mục tiêu · bước 2", onboardingGoalStep2),
    "goal-step-3": screenState("Mục tiêu · bước 3", onboardingGoalStep3),
    "goal-edit": screenState("Sửa mục tiêu", onboardingGoalEdit),
    fork: screenState("Chọn cách bắt đầu (S08b)", onboardingFork),
    intro: screenState("Giới thiệu bài kiểm tra (S09a)", onboardingIntro),
    "intro-resumed": screenState("Tiếp tục bài kiểm tra (S09a)", onboardingInProgress),
    question: {
      label: "Câu hỏi (S09b)",
      route: { pathname: `/learn/${ONBOARDING_COURSE_ID}/onboarding` },
      handlers: onboardingHandlers(onboardingInProgress),
      render: () => <QuestionState data={onboardingInProgress} />,
    },
    "question-submitting": {
      label: "Đang gửi câu trả lời",
      route: { pathname: `/learn/${ONBOARDING_COURSE_ID}/onboarding` },
      handlers: onboardingHandlers(onboardingInProgress),
      render: () => <QuestionState data={onboardingInProgress} busy pendingType="answer" />,
    },
    result: screenState("Kết quả (S09c)", onboardingGraded, {
      render: () => <Onboarding courseId={ONBOARDING_COURSE_ID} viewResult />,
    }),
    generating: screenState("Đang xếp lộ trình", onboardingGraded),
    ready: screenState("Lộ trình đã sẵn sàng", onboardingReady),
    loading: screenState("Đang tải", onboardingBase, {
      handlers: [http.get(endpoint, async () => { await delay("infinite"); return HttpResponse.json({}); })],
    }),
    error: screenState("Lỗi tải", onboardingBase, {
      handlers: [http.get(endpoint, () => HttpResponse.json({ error: "Không thể tải thiết lập." }, { status: 500 }))],
    }),
  },
};
