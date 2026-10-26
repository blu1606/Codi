// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CourseProgressClient } from "./course-progress-client";
import { InsightsClient } from "../insights/insights-client";
import { LecturerNav } from "../lecturer-nav";
import {
  HINT_USAGE_UNAVAILABLE,
  PROGRESS_CHARTS_UNAVAILABLE,
  type CourseProgressDetailDto,
} from "@/lib/lecturer-progress-service";

const routing = vi.hoisted(() => ({
  pathname: "/dashboard/lecturer/progress/course",
}));
vi.mock("next/navigation", () => ({ usePathname: () => routing.pathname }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const data: CourseProgressDetailDto = {
  courseId: "course",
  courseTitle: "Course",
  totalLessons: 1,
  learnersCount: 1,
  averageCompletionRate: 100,
  averageQuizScore: 80,
  learners: [
    {
      userId: "learner",
      name: "Learner",
      avatar: null,
      progressPercent: 100,
      completedLessonsCount: 1,
      totalLessonsCount: 1,
      averageQuizScore: 80,
      hintUsageCount: null,
      lastActive: null,
      lessons: [
        {
          id: "lesson",
          title: "Lesson",
          isCompleted: true,
          quizScore: 80,
          assignmentSubmission: null,
        },
      ],
    },
  ],
  quizQuestions: [
    {
      questionId: 50,
      lessonId: "lesson",
      lessonTitle: "Lesson",
      questionText: "Current question",
      correctPercent: null,
      totalAnswers: 0,
      correctAnswers: 0,
      needsReview: false,
    },
  ],
};
async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(element);
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
}
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
});
it("renders real percent and explicit unavailable evidence in list and drill-down", async () => {
  await mount(createElement(CourseProgressClient, { data }));
  expect(document.body.textContent).toContain("80%");
  expect(document.body.textContent).toContain(PROGRESS_CHARTS_UNAVAILABLE);
  expect(document.body.textContent).toContain(HINT_USAGE_UNAVAILABLE);
  expect(document.body.textContent).toContain("Chưa ghi nhận");
  expect(document.body.textContent).not.toContain("0 (L");
  await click("Xem chi tiết");
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Quiz 80%");
  expect(dialog?.textContent).toContain(HINT_USAGE_UNAVAILABLE);
  expect(dialog?.textContent).toContain(PROGRESS_CHARTS_UNAVAILABLE);
});
it("labels unanswered current questions unknown rather than normal", async () => {
  await mount(createElement(CourseProgressClient, { data }));
  await click("Kết quả quiz");
  expect(document.body.textContent).toContain("Current question");
  expect(document.body.textContent).toContain("Chưa có dữ liệu");
  expect(document.body.textContent).not.toContain("Bình thường");
});
it("shows a genuine empty enrollment state and retains unavailable disclaimers", async () => {
  await mount(
    createElement(CourseProgressClient, {
      data: { ...data, learnersCount: 0, learners: [], averageQuizScore: null },
    }),
  );
  expect(document.body.textContent).toContain("Chưa có học viên");
  expect(document.body.textContent).toContain(HINT_USAGE_UNAVAILABLE);
});
it("renders the no-published revenue state without a monetary chart, filter or total", async () => {
  await mount(
    createElement(InsightsClient, {
      data: { state: "no-published" },
      period: "30",
    }),
  );
  expect(document.body.textContent).toContain("Chưa có khoá học nào được xuất bản");
  expect(document.body.textContent).not.toContain("₫");
  expect(document.body.textContent).not.toContain("100%");
  expect(document.querySelector("svg")).toBeNull();
  expect(document.querySelector("table")).toBeNull();
  expect(document.querySelector("a")).toBeNull();
});
it("enables only the two new links while preserving current workspace navigation", async () => {
  await mount(createElement(LecturerNav));
  expect(
    [...document.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    ),
  ).toEqual([
    "/dashboard/lecturer",
    "/dashboard/lecturer/courses",
    "/dashboard/lecturer/grading",
    "/dashboard/lecturer/questions",
    "/dashboard/lecturer/reviews",
    "/dashboard/lecturer/progress",
    "/dashboard/lecturer/insights",
  ]);
  for (const label of ["Chấm bài", "Hỏi đáp", "Đánh giá"])
    expect(
      [
        ...document.querySelectorAll(
          '[title="Tính năng đang được phát triển"]',
        ),
      ].some((element) => element.textContent?.includes(label)),
    ).toBe(false);
  expect(
    document.querySelector('a[href="/dashboard/lecturer/progress"]')?.getAttribute("aria-current"),
  ).toBe("page");
});
