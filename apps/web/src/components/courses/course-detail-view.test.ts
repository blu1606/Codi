// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseDetail } from "@/lib/course-details";
import CourseDetailView from "./course-detail-view";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "learner-1", role: "learner" } },
      isPending: false,
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}));

const detail: CourseDetail = {
  course: {
    id: "course-free-id",
    slug: "free-course-slug",
    title: "Khóa học miễn phí",
    category: "Lập trình",
    level: "Beginner",
    duration: "1 giờ",
    description: "Khóa học dành cho người mới bắt đầu.",
    price: 0,
    instructorId: null,
    rating: 0,
    reviewCount: 0,
    status: "published",
    createdAt: "2026-10-25T00:00:00Z",
    publishedAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
    enrollmentCount: 0,
  },
  instructor: null,
  rating: 0,
  reviewCount: 0,
  learningOutcomes: [],
  requirements: [],
  targetAudience: null,
  coverImageUrl: null,
  introVideoUrl: null,
  introVideoCaptionsUrl: null,
  chapters: [],
  summary: { chapterCount: 0, lessonCount: 0, durationSeconds: 0 },
};

let root: Root;
let host: HTMLDivElement;
let enrollmentResponse: Promise<Response>;
let resolveEnrollment: (response: Response) => void;
let rejectEnrollment: (reason: Error) => void;
const fetchMock = vi.fn<typeof fetch>();

function enrollButton() {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === "Đăng ký miễn phí",
  );
  expect(button).toBeDefined();
  return button!;
}

async function startEnrollment() {
  await act(async () => {
    root.render(createElement(CourseDetailView, { slug: detail.course.slug }));
  });
  await act(async () => enrollButton().click());
  expect(fetchMock).toHaveBeenCalledWith("/api/courses/enroll-free", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: detail.course.id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  enrollmentResponse = new Promise<Response>((resolve, reject) => {
    resolveEnrollment = resolve;
    rejectEnrollment = reject;
  });
  fetchMock.mockImplementation(async (input) => {
    if (input === `/api/courses/${detail.course.slug}`)
      return Response.json(detail);
    if (input === "/api/courses/ownership") {
      return Response.json({
        ownership: { [detail.course.id]: { ownership: "free" } },
      });
    }
    if (input === "/api/courses/enroll-free") return enrollmentResponse;
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("course detail free enrollment", () => {
  it("waits for enrollment success before opening the same course's onboarding", async () => {
    await startEnrollment();
    expect(host.textContent).toContain("Đang xử lý…");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Tiếp tục học");

    await act(async () => {
      resolveEnrollment(
        Response.json({ success: true, courseId: detail.course.id }),
      );
    });

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      `/learn/${detail.course.id}/onboarding`,
    );
    expect(mocks.success).toHaveBeenCalledWith(
      `Đã đăng ký “${detail.course.title}”.`,
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(
      host.querySelector(`a[href="/learn/${detail.course.id}"]`)?.textContent,
    ).toBe("Tiếp tục học");
  });

  it.each(["server", "transport"] as const)(
    "keeps the free CTA and reports %s failure without success or navigation",
    async (failure) => {
      await startEnrollment();
      const message =
        failure === "server" ? "Không thể đăng ký khóa học." : "Mất kết nối";
      await act(async () => {
        if (failure === "server") {
          resolveEnrollment(Response.json({ error: message }, { status: 500 }));
        } else {
          rejectEnrollment(new Error(message));
        }
      });
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.error).toHaveBeenCalledWith(message);
      expect(host.textContent).toContain(message);
      expect(enrollButton().disabled).toBe(false);
      expect(host.textContent).not.toContain("Tiếp tục học");
    },
  );

  it("opens the sign-in gate on an expired session instead of navigating or succeeding", async () => {
    await startEnrollment();
    await act(async () => {
      resolveEnrollment(
        Response.json({ error: "Vui lòng đăng nhập" }, { status: 401 }),
      );
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Đăng nhập để đăng ký khoá học miễn phí.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(enrollButton().disabled).toBe(false);
    expect(host.textContent).not.toContain("Tiếp tục học");
  });
});
