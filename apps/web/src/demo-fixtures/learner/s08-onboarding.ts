import type { OnboardingView } from "@/lib/onboarding-contract";

export const ONBOARDING_COURSE_ID = "course-js-001";

type DiagnosticQuestion = NonNullable<OnboardingView["diagnostic"]>["questions"][number];

const questions: DiagnosticQuestion[] = [
  { id: 1, text: "Kết quả của typeof null là gì?", codeSnippet: "console.log(typeof null);", options: [{ id: 1, text: "\"object\"" }, { id: 2, text: "\"null\"" }, { id: 3, text: "\"undefined\"" }] },
  { id: 2, text: "Biến khai báo bằng const có thể được gán lại không?", codeSnippet: null, options: [{ id: 4, text: "Có" }, { id: 5, text: "Không" }] },
  { id: 3, text: "Hàm nào trả về mảng mới sau khi biến đổi từng phần tử?", codeSnippet: null, options: [{ id: 6, text: "forEach" }, { id: 7, text: "map" }, { id: 8, text: "find" }] },
  { id: 4, text: "Đoạn mã sau in ra gì?", codeSnippet: "let a = 1;\nlet b = a;\nb = 2;\nconsole.log(a);", options: [{ id: 9, text: "1" }, { id: 10, text: "2" }] },
  { id: 5, text: "Promise.all rejects khi nào?", codeSnippet: null, options: [{ id: 11, text: "Khi một promise reject" }, { id: 12, text: "Khi tất cả reject" }] },
];

const base: OnboardingView = {
  canRequestPath: false,
  enrollment: {
    learningGoal: null, selfAssessedLevel: null, weeklyGoalMinutes: null, goalDraft: {},
    goalStep: 0, goalEditing: false, diagnosticStatus: "none", diagnosticQuestionIndex: 0,
    pathStatus: "none", pathSource: null, goalSet: false,
  },
  course: { id: ONBOARDING_COURSE_ID, title: "JavaScript nền tảng" },
  diagnostic: null,
  attemptId: null,
  answers: [],
  result: null,
};

export const onboardingBase = base;

export function onboardingView(overrides: Partial<Omit<OnboardingView, "enrollment">> & { enrollment?: Partial<OnboardingView["enrollment"]> } = {}): OnboardingView {
  const { enrollment, ...rest } = overrides;
  return { ...base, ...rest, enrollment: { ...base.enrollment, ...enrollment } };
}

const goalSet = { goalSet: true, learningGoal: "project", selfAssessedLevel: "basic", weeklyGoalMinutes: 300 } as const;
const diagnostic = { id: 21, title: "Bài kiểm tra đầu vào · JavaScript nền tảng", questions };

export const onboardingGoalStep1 = onboardingView();
export const onboardingGoalStep2 = onboardingView({ enrollment: { goalStep: 1, goalDraft: { goal: "project" } } });
export const onboardingGoalStep3 = onboardingView({ enrollment: { goalStep: 2, goalDraft: { goal: "project", level: "basic" } } });
export const onboardingGoalEdit = onboardingView({ enrollment: { ...goalSet, goalEditing: true, goalStep: 0, pathStatus: "ready", pathSource: "ai" } });
export const onboardingFork = onboardingView({ enrollment: { ...goalSet, diagnosticStatus: "fork" } });
export const onboardingIntro = onboardingView({ enrollment: { ...goalSet, diagnosticStatus: "intro" }, diagnostic });

export const onboardingInProgress = onboardingView({
  enrollment: { ...goalSet, diagnosticStatus: "in-progress", diagnosticQuestionIndex: 2, pathStatus: "none" },
  diagnostic,
  attemptId: 21,
  answers: [{ questionId: 1, optionId: 1, unknown: false }, { questionId: 2, optionId: null, unknown: true }],
});

export const onboardingGraded = onboardingView({
  enrollment: { ...goalSet, diagnosticStatus: "done", pathStatus: "generating", pathSource: null },
  diagnostic,
  attemptId: 21,
  answers: [],
  result: {
    right: 3, wrong: 1, unknown: 1,
    concepts: [
      { id: 1, name: "Biến & kiểu dữ liệu", probability: 0.9, evidenceCount: 3 },
      { id: 2, name: "Hàm", probability: 0.65, evidenceCount: 2 },
      { id: 3, name: "Mảng", probability: 0.42, evidenceCount: 2 },
      { id: 4, name: "Bất đồng bộ", probability: 0.1, evidenceCount: 1 },
    ],
  },
});

export const onboardingReady = onboardingView({
  enrollment: { ...goalSet, diagnosticStatus: "done", pathStatus: "ready", pathSource: "ai" },
  diagnostic,
  attemptId: 21,
  result: onboardingGraded.result,
});
