import { delay, http, HttpResponse } from "msw";
import type { HttpHandler } from "msw";
import LessonPlayer from "@/app/learn/[courseId]/[lessonId]/lesson-player";
import {
  TUTOR_CHAT_HINT,
  TUTOR_CHAT_LECTURER,
  TUTOR_CHAT_LESSON,
  tutorLessonMeta,
} from "@/demo-fixtures/learner/s11-tutor";
import { seedTutor, tutorAsk, tutorAskFails, tutorStream } from "../../shell/tutor-handlers";
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
  lessonReadyToComplete,
  lessonAfterCompletion,
  lessonSoftLocked,
  lessonTasksAtTop,
  lessonVideoDefault,
  offerAll,
  offerHarder,
  offerPractice,
  offerSkipMastered,
  quizAnswering,
  quizFailed,
  quizPassed,
} from "@/demo-fixtures/learner/s11-lesson-player";
import { PathAdjustOffer } from "@/components/learning-path/path-adjust-offer";
import type { AssessmentView } from "@/lib/assessment-contract";
import type { AdjustmentOffer } from "@/lib/learning-path-contract";
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

/** Completion: the first matching handler answers "complete" with the offer; every other command gets the plain view. */
const offerState = (label: string, offer: AdjustmentOffer): ScreenState => {
  const complete = http.post(endpoint, async ({ request }) => {
    const body = (await request.json()) as { type?: string };
    return HttpResponse.json(body.type === "complete" ? { ...lessonReadyToComplete, completed: true, adjustment: offer } : lessonReadyToComplete);
  });
  return state(label, [complete, ...playerHandlers(lessonReadyToComplete)], {
    render: () => <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} initialAdjustment={offer} />,
  });
};

/** The lesson's meta as the Tutor panel reads it (code lesson, hint ladder, lecturer). */
const tutorMeta = (meta: object): HttpHandler => http.get("/api/ai/lesson", () => HttpResponse.json(meta));
const lessonKey = `lesson:${LESSON_ID}`;

/**
 * Lesson player with the shared Tutor panel open at load: a new chat (optionally asking right away)
 * or a stored chat of this lesson, so each panel state renders without a click.
 */
const tutorState = (
  label: string,
  handlers: HttpHandler[],
  { chat, ask }: { chat?: string; ask?: string } = {},
): ScreenState => ({
  ...state(label, handlers),
  render: () => {
    seedTutor({ chats: chat ? { [lessonKey]: chat } : {} });
    return <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} initialTutor={{ mode: "panel", ask }} />;
  },
});

const tutorStates: Record<string, ScreenState> = {
  "tutor-bubble": { ...state("Tutor · nút nổi (đóng)", playerHandlers(lessonVideoDefault)), render: () => {
    seedTutor({ open: false });
    return <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} />;
  } },
  "tutor-empty": tutorState("Tutor · đoạn chat mới, gợi ý", [...playerHandlers(lessonVideoDefault), tutorMeta(tutorLessonMeta())]),
  "tutor-thinking": tutorState(
    "Tutor · đang đọc bài (Dừng)",
    [tutorAsk(() => tutorStream(undefined, { hangAfter: 0 })), ...playerHandlers(lessonVideoDefault), tutorMeta(tutorLessonMeta())],
    { ask: "querySelectorAll trả về gì?" },
  ),
  "tutor-streaming": tutorState(
    "Tutor · suy nghĩ, dùng công cụ, trả lời từng chữ",
    [tutorAsk(() => tutorStream(undefined, { stepMs: 700 })), ...playerHandlers(lessonVideoDefault), tutorMeta(tutorLessonMeta())],
    { ask: "Duyệt danh sách querySelectorAll thế nào?" },
  ),
  "tutor-answer": tutorState("Tutor · câu trả lời có nguồn", [...playerHandlers(lessonVideoDefault)], { chat: TUTOR_CHAT_LESSON }),
  "tutor-context": tutorState("Tutor · có ngữ cảnh đính kèm (code, test)", [
    ...playerHandlers(lessonCodeBase, { coding: codingSomeFailed }),
    tutorMeta(tutorLessonMeta({ isCode: true })),
  ]),
  "tutor-diff": tutorState("Tutor · gợi ý 3/3, đề xuất chưa áp dụng", [
    ...playerHandlers(lessonCodeBase, { coding: codingIdle }),
  ], { chat: TUTOR_CHAT_HINT }),
  "tutor-error": tutorState(
    "Tutor · tạm nghỉ, thử lại",
    [tutorAskFails(500, "Không thể tải hoặc cập nhật lộ trình. Vui lòng thử lại."), ...playerHandlers(lessonVideoDefault), tutorMeta(tutorLessonMeta())],
    { ask: "Vì sao nó trả về null?" },
  ),
  "tutor-rate-limited": tutorState(
    "Tutor · hỏi quá nhiều",
    [tutorAskFails(429, "Bạn đã hỏi quá nhiều trong thời gian ngắn"), ...playerHandlers(lessonVideoDefault), tutorMeta(tutorLessonMeta())],
    { ask: "Giải thích lại giúp mình" },
  ),
  "tutor-escalated": tutorState("Tutor · 👎 và giảng viên đã trả lời", [...playerHandlers(lessonVideoDefault)], { chat: TUTOR_CHAT_LECTURER }),
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
    "soft-locked": state("Chưa đủ tiên quyết · mở được, có cảnh báo", playerHandlers(lessonSoftLocked)),
    "offer-skip-mastered": offerState("Gợi ý sau hoàn thành · bỏ qua bài đã vững", offerSkipMastered),
    "offer-practice": offerState("Gợi ý sau hoàn thành · luyện thêm", offerPractice),
    "offer-harder": offerState("Gợi ý sau hoàn thành · làm bài code sớm", offerHarder),
    "offer-all": offerState("Gợi ý sau hoàn thành · đủ các lựa chọn", offerAll),
    "offer-applied": state("Gợi ý · đã áp dụng (hoàn tác 7 giây)", playerHandlers(lessonReadyToComplete), {
      render: () => (
        <div className="mx-auto max-w-xl p-6">
          <PathAdjustOffer offer={null} completing={false} applying={null} applied={{ summary: "Bài Hàm và phạm vi được đưa lên ngay sau bài vừa học để ôn Mảng." }} error={null} onChoose={() => {}} onDismiss={() => {}} onViewPath={() => {}} />
        </div>
      ),
    }),
    "tasks-at-top": state("Nhiệm vụ ở đầu trang (quiz, bài tập)", playerHandlers(lessonTasksAtTop)),
    "map-popup": state("Lộ trình · bản đồ mở từ bài học", playerHandlers(lessonVideoDefault), {
      render: () => <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} initialPathMap={{}} />,
    }),
    "map-after-completion": state("Lộ trình · sau hoàn thành, tiến trình sang bài kế", playerHandlers(lessonAfterCompletion), {
      render: () => <LessonPlayer courseId={LESSON_COURSE_ID} lessonId={LESSON_ID} initialPathMap={{ animateFrom: LESSON_ID }} />,
    }),
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
