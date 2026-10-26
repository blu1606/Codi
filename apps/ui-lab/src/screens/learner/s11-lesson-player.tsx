import { delay, http, HttpResponse } from "msw";
import type { HttpHandler } from "msw";
import LessonPlayer from "@/app/learn/[courseId]/[lessonId]/lesson-player";
import {
  tutorAnswered,
  tutorCodeEmpty,
  tutorDiffApplied,
  tutorDiffPending,
  tutorEmpty,
  tutorEscalated,
  tutorError,
  tutorHintLevel2,
  tutorRateLimited,
} from "@/demo-fixtures/learner/s11-tutor";
import {
  ASSIGNMENT_ASSESSMENT_ID,
  CODING_ASSESSMENT_ID,
  LESSON_COURSE_ID,
  LESSON_ID,
  QUIZ_ASSESSMENT_ID,
  assignmentGraded,
  assignmentNotSubmitted,
  assignmentSubmitted,
  codingAllPassed,
  codingIdle,
  codingRuntimeError,
  codingSandboxDown,
  codingSomeFailed,
  codingTimeout,
  lessonAssignmentPending,
  lessonChecklistPartial,
  lessonCodeBase,
  lessonCompleted,
  lessonMaterialError,
  lessonPlayerView,
  lessonReading,
  lessonVideoDefault,
  quizAnswering,
  quizFailed,
  quizPassed,
} from "@/demo-fixtures/learner/s11-lesson-player";
import type { AssessmentView } from "@/lib/assessment-contract";
import type { CodingView } from "@/lib/coding-contract";
import type { LessonPlayerView } from "@/lib/lesson-player-contract";
import type { Screen, ScreenState } from "../screen-types";

const endpoint = `/api/learn/${LESSON_COURSE_ID}/lessons/${LESSON_ID}`;
const route = { pathname: `/learn/${LESSON_COURSE_ID}/${LESSON_ID}`, params: { courseId: LESSON_COURSE_ID, lessonId: LESSON_ID } };

/** Lesson view for open/refresh, plus the quiz, assignment and coding bodies the checklist loads. */
function playerHandlers(view: LessonPlayerView, assessments: { quiz?: AssessmentView; assignment?: AssessmentView; coding?: CodingView } = {}) {
  // Every checklist item the lesson may show gets an answer, so no request falls through to the dev server.
  const quiz = assessments.quiz ?? quizAnswering;
  const assignment = assessments.assignment ?? assignmentNotSubmitted;
  const coding = assessments.coding ?? codingIdle;
  return [
    http.post(endpoint, () => HttpResponse.json(view)),
    http.get(endpoint, () => HttpResponse.json(view)),
    http.get(`${endpoint}/assessments/${QUIZ_ASSESSMENT_ID}`, () => HttpResponse.json(quiz)),
    http.get(`${endpoint}/assessments/${ASSIGNMENT_ASSESSMENT_ID}`, () => HttpResponse.json(assignment)),
    http.get(`${endpoint}/assessments/${CODING_ASSESSMENT_ID}/coding`, () => HttpResponse.json(coding)),
    // The seeded lesson snapshot carries its own coding assessment id; any coding item gets the same answer.
    http.get(new RegExp(`${endpoint}/assessments/\\d+/coding$`), () => HttpResponse.json(coding)),
  ];
}

const state = (label: string, handlers: ReturnType<typeof playerHandlers>, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route,
  handlers,
  render: () => <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} />,
  ...extra,
});

/** Quiz lesson with the study step done; `done` marks the quiz checklist item. */
const quizView = (done: boolean) => lessonPlayerView({
  materials: [],
  studied: true,
  checklist: [
    { key: "study", label: "Học xong nội dung", done: true, note: "Đã học xong nội dung" },
    { key: "quiz", label: "Làm quiz", done, note: "Đạt từ 70% để hoàn thành.", assessmentId: QUIZ_ASSESSMENT_ID },
  ],
});

/** Tutor GET for this lesson: the thread the panel or popup reads when it opens. */
const tutorRead = (view: object): HttpHandler => http.get(`${endpoint}/tutor`, () => HttpResponse.json(view));

/** Lesson player with the tutor opened at mount, so each thread state renders without a click. */
const tutorState = (
  label: string,
  initialTutor: { mode: "popup" } | { mode: "panel"; ask?: string },
  handlers: HttpHandler[],
  extra: Partial<ScreenState> = {},
): ScreenState => ({
  ...state(label, handlers),
  render: () => <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} viewerName="Nguyễn Minh Anh" initialTutor={initialTutor} />,
  ...extra,
});

const tutorStates: Record<string, ScreenState> = {
  "tutor-launcher": state("Trợ lý · nút tròn (đóng)", playerHandlers(lessonVideoDefault)),
  "tutor-popup": tutorState("Trợ lý · popup", { mode: "popup" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorEmpty)]),
  "tutor-empty": tutorState("Trợ lý · gợi ý ban đầu", { mode: "panel" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorEmpty)]),
  "tutor-answer": tutorState("Trợ lý · câu trả lời", { mode: "panel" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorAnswered)]),
  "tutor-context": tutorState("Trợ lý · có ngữ cảnh đính kèm", { mode: "panel" }, [
    ...playerHandlers(lessonCodeBase, { coding: codingSomeFailed }),
    tutorRead(tutorCodeEmpty),
  ]),
  "tutor-thinking": tutorState("Trợ lý · đang trả lời (Dừng)", { mode: "panel", ask: "Vì sao nó trả về null?" }, [
    http.post(`${endpoint}/tutor`, async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }),
    ...playerHandlers(lessonVideoDefault),
    tutorRead(tutorEmpty),
  ]),
  "tutor-hint": tutorState("Trợ lý · gợi ý 2/3", { mode: "panel" }, [
    ...playerHandlers(lessonCodeBase, { coding: codingIdle }),
    tutorRead(tutorHintLevel2),
  ]),
  "tutor-diff": tutorState("Trợ lý · đề xuất chưa áp dụng", { mode: "panel" }, [
    ...playerHandlers(lessonCodeBase, { coding: codingIdle }),
    tutorRead(tutorDiffPending),
  ]),
  "tutor-diff-applied": tutorState("Trợ lý · đã áp dụng đề xuất", { mode: "panel" }, [
    ...playerHandlers(lessonCodeBase, { coding: codingIdle }),
    tutorRead(tutorDiffApplied),
  ]),
  "tutor-error": tutorState("Trợ lý · lỗi, thử lại", { mode: "panel" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorError)]),
  "tutor-rate-limited": tutorState("Trợ lý · hỏi quá nhiều", { mode: "panel" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorRateLimited)]),
  "tutor-escalated": tutorState("Trợ lý · đã hỏi giảng viên", { mode: "panel" }, [...playerHandlers(lessonVideoDefault), tutorRead(tutorEscalated)]),
};

export const s11LessonPlayerScreen: Screen = {
  id: "S11",
  title: "Trình phát bài học",
  group: "Học tập",
  role: "learner",
  mockupHash: `#/learn/${LESSON_COURSE_ID}/${LESSON_ID}`,
  states: {
    video: state("Video (mặc định)", playerHandlers(lessonVideoDefault), { mockupScenario: { materials: "ok" } }),
    reading: state("Bài đọc", playerHandlers(lessonReading)),
    "materials-error": state("Lỗi tải tài liệu", playerHandlers(lessonMaterialError), { mockupScenario: { materials: "error" } }),
    "checklist-partial": state("Checklist một phần", playerHandlers(lessonChecklistPartial)),
    completed: state("Đã hoàn thành (S11e)", playerHandlers(lessonCompleted)),
    "quiz-answering": state("Quiz · đang làm (S11c)", playerHandlers(quizView(false), { quiz: quizAnswering })),
    "quiz-passed": state("Quiz · đạt (S11c)", playerHandlers(quizView(true), { quiz: quizPassed })),
    "quiz-failed": state("Quiz · chưa đạt (S11c)", playerHandlers(quizView(false), { quiz: quizFailed })),
    "assignment-not-submitted": state("Bài tập · chưa nộp (S11d)", playerHandlers(lessonAssignmentPending, { assignment: assignmentNotSubmitted })),
    "assignment-submitted": state("Bài tập · chờ chấm (S11d)", playerHandlers(lessonAssignmentPending, { assignment: assignmentSubmitted })),
    "assignment-graded": state("Bài tập · đã chấm (S11d)", playerHandlers(lessonAssignmentPending, { assignment: assignmentGraded })),
    "coding-idle": state("Bài code · chưa chạy (S11g)", playerHandlers(lessonCodeBase, { coding: codingIdle })),
    "coding-some-failed": state("Bài code · một số test fail (S11g)", playerHandlers(lessonCodeBase, { coding: codingSomeFailed })),
    "coding-all-passed": state("Bài code · đạt tất cả (S11g)", playerHandlers(lessonCodeBase, { coding: codingAllPassed })),
    "coding-runtime-error": state("Bài code · lỗi khi chạy (S11g)", playerHandlers(lessonCodeBase, { coding: codingRuntimeError })),
    "coding-timeout": state("Bài code · quá thời gian (S11g)", playerHandlers(lessonCodeBase, { coding: codingTimeout })),
    "coding-sandbox-down": state("Bài code · sandbox không sẵn sàng (S11g)", playerHandlers(lessonCodeBase, { coding: codingSandboxDown })),
    ...tutorStates,
    loading: state("Đang tải", [http.post(endpoint, async () => { await delay("infinite"); return HttpResponse.json({}); })]),
    error: state("Lỗi tải", [http.post(endpoint, () => HttpResponse.json({ error: "Không thể tải bài học." }, { status: 500 }))]),
  },
};
