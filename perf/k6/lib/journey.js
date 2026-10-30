// The learner journey shared by smoke.js, learner-journey.js and stress.js:
// sign in -> catalogue -> owned course -> learning path -> lesson -> save progress -> (quiz, writes only).
import { check, sleep } from "k6";
import { COURSE_SLUG, ENABLE_WRITES } from "./config.js";
import { read, write, call } from "./http.js";
import { ensureSignedIn, invalidateSession } from "./auth.js";

function requireCourseSlug() {
  if (!COURSE_SLUG) {
    throw new Error("COURSE_SLUG is required: the slug of the course the test accounts are enrolled in");
  }
  return COURSE_SLUG;
}

function firstLessonOf(detail) {
  for (const chapter of detail?.chapters ?? []) {
    const lesson = (chapter.lessons ?? [])[0];
    if (lesson) return lesson.id;
  }
  return null;
}

export function learnerJourney({ writes = false, thinkTime = 1 } = {}) {
  ensureSignedIn();

  const catalog = read("/api/courses?limit=20", "GET /api/courses");
  check(catalog, { "catalogue 200": (r) => r.status === 200 });

  const slug = requireCourseSlug();
  const detailRes = read(`/api/courses/${slug}`, "GET /api/courses/:slug");
  check(detailRes, { "course detail 200": (r) => r.status === 200 });
  const detail = detailRes.json();
  const courseId = detail?.course?.id;
  const lessonId = firstLessonOf(detail);
  if (!courseId || !lessonId) throw new Error(`course ${slug} has no id or no lessons`);
  sleep(thinkTime);

  const pathRes = read(`/api/learn/${courseId}/path`, "GET /api/learn/:courseId/path");
  check(pathRes, { "learning path 200": (r) => r.status === 200 });

  const accessPath = `/api/learn/${courseId}/access/${lessonId}`;
  let accessRes = read(accessPath, "GET /api/learn/:courseId/access/:lessonId", [200, 409]);
  if (accessRes.status === 409) {
    // A fresh enrolment has no path yet. Take the onboarding route that needs no AI:
    // skip the goal, then study in the course's default order.
    onboardDefaultOrder(courseId);
    accessRes = read(accessPath, "GET /api/learn/:courseId/access/:lessonId");
  }
  check(accessRes, { "lesson access 200": (r) => r.status === 200 });

  const lessonRes = read(`/api/learn/${courseId}/lessons/${lessonId}`, "GET /api/learn/:courseId/lessons/:lessonId");
  check(lessonRes, { "lesson 200": (r) => r.status === 200 });
  // A 401 means the VU's session expired; the next iteration signs in again.
  if ([pathRes, accessRes, lessonRes].some((r) => r.status === 401)) invalidateSession();
  const lesson = lessonRes.json();
  sleep(thinkTime);

  // Save progress: marks the lesson studied. `study` does not regenerate the learning path.
  const progressRes = write(
    "POST",
    `/api/learn/${courseId}/lessons/${lessonId}`,
    { type: "study" },
    "POST /api/learn/:courseId/lessons/:lessonId (study)",
  );
  check(progressRes, { "progress saved 200": (r) => r.status === 200 });

  if (writes && ENABLE_WRITES) {
    // The checklist lists the lesson's quiz (key "quiz") with its assessment id.
    const quiz = (lesson?.checklist ?? []).find((item) => item.key === "quiz");
    if (quiz?.assessmentId) submitQuiz(courseId, lessonId, quiz.assessmentId);
  }
  sleep(thinkTime);
}

// Runs once per test account. Each step is idempotent from the account's point of view: a
// 409 means the account is already past that step.
function onboardDefaultOrder(courseId) {
  const path = `/api/learn/${courseId}/onboarding`;
  for (const type of ["goal-skip", "fork-default"]) {
    const res = write("POST", path, { type }, `POST /api/learn/:courseId/onboarding (${type})`, [200, 409]);
    check(res, { [`onboarding ${type} ok`]: (r) => r.status === 200 || r.status === 409 });
  }
}

// Opens a quiz attempt, answers every question with its first option, then submits.
// Only runs when ENABLE_WRITES=1. The quiz state shape is read from the API at run time.
function submitQuiz(courseId, lessonId, assessmentId) {
  const base = `/api/learn/${courseId}/lessons/${lessonId}/assessments/${assessmentId}`;
  const name = (suffix) => `POST /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId (${suffix})`;

  const opened = write("POST", base, { type: "quiz-open" }, name("quiz-open"));
  check(opened, { "quiz opened 200": (r) => r.status === 200 });

  const state = read(base, "GET /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId").json();
  const submissionId = state?.submission?.id;
  const questions = state?.questions ?? [];
  if (!submissionId || questions.length === 0) {
    throw new Error("quiz state has no submission or questions; check the assessment response shape");
  }

  for (const question of questions) {
    const option = question.options?.[0];
    if (!option) continue;
    const answered = write(
      "POST",
      base,
      { type: "quiz-answer", submissionId, questionId: question.id, optionId: option.id },
      name("quiz-answer"),
    );
    check(answered, { "quiz answer 200": (r) => r.status === 200 });
  }

  const submitted = write(
    "POST",
    base,
    { type: "quiz-submit", submissionId, confirmUnanswered: true },
    name("quiz-submit"),
  );
  check(submitted, { "quiz submitted 200": (r) => r.status === 200 });
}

// Anonymous reads: the public pages and the catalogue API.
export function browseJourney({ thinkTime = 1 } = {}) {
  const home = call("GET", "/", { type: "read", name: "GET /" });
  check(home, { "home 200": (r) => r.status === 200 });
  const courses = call("GET", "/courses", { type: "read", name: "GET /courses" });
  check(courses, { "courses page 200": (r) => r.status === 200 });
  const catalog = read("/api/courses?limit=20", "GET /api/courses");
  check(catalog, { "catalogue 200": (r) => r.status === 200 });
  if (COURSE_SLUG) {
    const detail = read(`/api/courses/${COURSE_SLUG}`, "GET /api/courses/:slug");
    check(detail, { "course detail 200": (r) => r.status === 200 });
  }
  sleep(thinkTime);
}
