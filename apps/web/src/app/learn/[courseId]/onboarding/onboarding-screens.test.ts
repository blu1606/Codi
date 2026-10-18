import { createElement } from "react";
import type { Route } from "next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  OnboardingCommand,
  OnboardingView,
} from "@/lib/onboarding-contract";
import {
  GoalScreen,
  IntroScreen,
  ReadyScreen,
  ResultScreen,
} from "./onboarding-screens";

function view(): OnboardingView {
  return {
    canRequestPath: false,
    enrollment: {
      learningGoal: "project",
      selfAssessedLevel: "basic",
      weeklyGoalMinutes: 300,
      goalDraft: {},
      goalStep: 0,
      goalEditing: false,
      diagnosticStatus: "done",
      diagnosticQuestionIndex: 0,
      pathStatus: "ready",
      pathSource: "ai",
      goalSet: true,
    },
    course: { id: "course", title: "Khoá học" },
    diagnostic: {
      id: 1,
      title: "Diagnostic",
      questions: [{ id: 1, text: "Question", codeSnippet: null, options: [] }],
    },
    attemptId: 9,
    answers: [],
    result: { right: 1, wrong: 0, unknown: 0, concepts: [] },
  };
}
const ui = {
  title: (text: string) => text,
  progress: (_value: number, _total: number, label: string) => label,
  action: (label: string, command: OnboardingCommand) =>
    createElement("button", { "data-command": command.type }, label),
};

describe("onboarding screens after diagnostic", () => {
  it("opens an existing ready path without sending request-path again", () => {
    const html = renderToStaticMarkup(
      createElement(ResultScreen, {
        data: view(),
        busy: false,
        ui,
        courseHome: "/learn/course" as Route,
      }),
    );
    expect(html).toContain('href="/learn/course"');
    expect(html).not.toContain('data-command="request-path"');
  });
  it("offers a new path request after a newly graded diagnostic", () => {
    const data = view();
    data.canRequestPath = true;
    expect(
      renderToStaticMarkup(
        createElement(ResultScreen, {
          data,
          busy: false,
          ui,
          courseHome: "/learn/course" as Route,
        }),
      ),
    ).toContain('data-command="request-path"');
    data.enrollment.pathStatus = "generating";
    expect(
      renderToStaticMarkup(
        createElement(ResultScreen, {
          data,
          busy: false,
          ui,
          courseHome: "/learn/course" as Route,
        }),
      ),
    ).not.toContain('data-command="request-path"');
  });
  it("keeps open-path, edit-goal and retake actions reachable in the ready screen", () => {
    const html = renderToStaticMarkup(
      createElement(ReadyScreen, {
        data: view(),
        busy: false,
        ui,
        courseHome: "/learn/course" as Route,
        onEdit: vi.fn(),
      }),
    );
    expect(html).toContain('href="/learn/course"');
    expect(html).toContain("Chỉnh mục tiêu");
    expect(html).toContain('data-command="diagnostic-retake"');
  });
  it("replaces skip with cancel when editing an existing goal", () => {
    const data = view();
    data.enrollment.goalEditing = true;
    const html = renderToStaticMarkup(
      createElement(GoalScreen, { data, busy: false, ui, send: vi.fn() }),
    );
    expect(html).toContain('data-command="goal-cancel"');
    expect(html).not.toContain('data-command="goal-skip"');
  });
  it("only offers postpone at intro, preserving an in-progress diagnostic", () => {
    const data = view();
    data.enrollment.diagnosticStatus = "intro";
    const props = {
      data,
      busy: false,
      ui,
      send: vi.fn(),
      resume: false,
      onResume: vi.fn(),
    };
    expect(renderToStaticMarkup(createElement(IntroScreen, props))).toContain(
      'data-command="diagnostic-postpone"',
    );
    data.enrollment.diagnosticStatus = "in-progress";
    expect(
      renderToStaticMarkup(
        createElement(IntroScreen, { ...props, resume: true }),
      ),
    ).not.toContain('data-command="diagnostic-postpone"');
  });
});
