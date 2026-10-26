import type { HttpHandler } from "msw";
import { http, HttpResponse } from "msw";
import TutorPage from "@/app/learn/[courseId]/tutor/tutor-page";
import { LESSON_COURSE_ID, LESSON_ID } from "@/demo-fixtures/learner/s11-lesson-player";
import {
  tutorAnswered,
  tutorHintLevel2,
  tutorThreadsDefault,
  tutorThreadsEmpty,
} from "@/demo-fixtures/learner/s11-tutor";
import type { Screen, ScreenState } from "../screen-types";

const courseApi = `/api/learn/${LESSON_COURSE_ID}`;
const route = { pathname: `/learn/${LESSON_COURSE_ID}/tutor`, params: { courseId: LESSON_COURSE_ID } };

/** The Tutor page's reads: the learner's threads in the course, and the open lesson's thread. */
function pageHandlers(threads: object[] | null, thread: object, status = 200): HttpHandler[] {
  return [
    http.get(`${courseApi}/tutor/threads`, () =>
      status === 200 ? HttpResponse.json({ threads }) : HttpResponse.json({ error: "Không tải được lịch sử Tutor." }, { status }),
    ),
    http.get(`${courseApi}/lessons/${LESSON_ID}/tutor`, () => HttpResponse.json(thread)),
  ];
}

const page = (label: string, handlers: HttpHandler[], lessonId: string | null): ScreenState => ({
  label,
  route: { ...route, ...(lessonId ? { search: { lesson: lessonId } } : {}) },
  handlers,
  render: () => <TutorPage courseId={LESSON_COURSE_ID} initialLessonId={lessonId} />,
});

export const s11tTutorPageScreen: Screen = {
  id: "S11t",
  title: "Tutor · trang đầy đủ",
  group: "Học tập",
  role: "learner",
  // The mockup has no full Tutor page; the side-by-side view opens the lesson it belongs to.
  mockupHash: `#/learn/${LESSON_COURSE_ID}/${LESSON_ID}`,
  states: {
    "history-answer": page("Lịch sử + câu trả lời", pageHandlers(tutorThreadsDefault, tutorAnswered), LESSON_ID),
    "history-hint": page("Lịch sử + gợi ý 2/3", pageHandlers(tutorThreadsDefault, tutorHintLevel2), LESSON_ID),
    empty: page("Chưa có đoạn chat", pageHandlers(tutorThreadsEmpty, tutorAnswered), null),
    "history-error": page("Lỗi tải lịch sử", pageHandlers(null, tutorAnswered, 500), LESSON_ID),
  },
};
