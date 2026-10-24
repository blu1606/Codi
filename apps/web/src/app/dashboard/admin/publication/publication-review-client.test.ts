// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PublicationReviewClient } from "./publication-review-client";
import type { AdminCourseReviewDetailDto } from "./actions";
import { PublicationPreviewClient } from "./publication-preview-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("./actions", () => ({}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
const detail: AdminCourseReviewDetailDto = {
  course: { id: "c-1", title: "Course", category: "Web", level: "Beginner", price: 1000,
    description: "A real course", chapters: [{ id: "ch-1", title: "Chapter", lessons: [
      { id: "video", title: "Video lesson", type: "video", body: "# Markdown heading",
        materials: [{ id: 1, type: "video", title: "Video", url: "https://example.invalid/video.mp4" }] },
      { id: "quiz", title: "Quiz lesson", type: "quiz", quiz: { questions: [
        { id: 1, text: "Choose", options: ["Right", "Wrong"], correctIndex: 0, explanation: "Because" },
      ] } },
      { id: "code", title: "Code lesson", type: "code", code: { kind: "challenge", tests: [] } },
    ] }] },
  instructor: null, details: { learningOutcomes: [], requirements: [], targetAudience: null },
  round: { id: 10, courseId: "c-1", round: 1, status: "in_review", requestedBy: "lec", validationStatus: "passed",
    requestedAt: "2026-10-24T00:00:00Z", criteria: {}, flags: [] },
  roundsHistory: [], autoCriteria: Object.fromEntries(["info", "materials", "quiz", "entry", "code", "assignment", "rights"]
    .map(id => [id, { status: null, why: "Review" }])) as AdminCourseReviewDetailDto["autoCriteria"], blockingReasons: [],
};
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function open() {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(PublicationReviewClient, {
    queue: { tab: "pending", counts: { pending: 1, changes: 0, approved: 0 }, items: [] }, detail,
  })));
  await click("Xem trước nội dung");
}
it("renders real video controls and markdown, navigates, and exits without learner writes", async () => {
  await open();
  expect(document.querySelector("video[controls]")?.getAttribute("src")).toBe("https://example.invalid/video.mp4");
  expect(document.querySelector('[role="dialog"] h1')?.textContent).toBe("Markdown heading");
  await click("Bài tiếp theo");
  expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  await act(async () => (document.querySelector('input[type="radio"]') as HTMLInputElement).click());
  await click("Kiểm tra đáp án");
  expect(document.body.textContent).toContain("Chính xác");
  await click("Bài tiếp theo");
  expect(document.body.textContent).toContain("Không chạy mã trong preview");
  await click("Thoát xem trước");
  expect(document.querySelector("video")).toBeNull();
  expect(document.body.textContent).not.toContain("Không chạy mã trong preview");
});

it("renders PDF/slide frames and blocks executable material URLs without loading external resources", () => {
  const html = renderToStaticMarkup(createElement(PublicationPreviewClient, {
    course: { id: "docs", title: "Documents", chapters: [{ id: "ch", title: "Chapter", lessons: [{
      id: "doc", title: "Document", type: "pdf", materials: [
        { id: 1, type: "pdf", title: "PDF", url: "https://example.invalid/doc.pdf" },
        { id: 2, type: "slide", title: "Slides", url: "https://example.invalid/slides.pdf" },
        { id: 3, type: "video", title: "Unsafe", url: "javascript:alert(1)" },
      ],
    }] }] }, onClose: vi.fn(),
  }));
  expect(html.match(/<iframe/g)).toHaveLength(2);
  expect(html).toContain('sandbox="allow-same-origin"');
  expect(html).toContain("Đường dẫn tài liệu không hợp lệ.");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<video");
  expect(html).toContain("không lưu tiến độ");
});

it("drops authored raw HTML and shows unknown provenance without a fake reviewed badge", async () => {
  const input = structuredClone(detail);
  input.course.chapters[0].lessons[0].body = '# Safe heading\n<script>alert("unsafe")</script>\n[Safe link](https://example.invalid/read)';
  input.course.chapters[0].lessons[1].quiz!.questions[0].aiGenerated = null;
  input.course.chapters[0].lessons[1].quiz!.questions[0].aiReviewed = null;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(PublicationReviewClient, {
    queue: { tab: "pending", counts: { pending: 1, changes: 0, approved: 0 }, items: [] }, detail: input,
  })));
  await click("Xem trước nội dung");
  expect(document.querySelector('[role="dialog"] script')).toBeNull();
  const link = document.querySelector('[role="dialog"] a[href="https://example.invalid/read"]');
  expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  await click("Thoát xem trước");
  await click("Nội dung bài học");
  await click("Quiz lesson");
  expect(document.body.textContent).toContain("Nguồn AI / trạng thái duyệt: chưa có dữ liệu.");
  expect(document.body.textContent).not.toContain("GV đã duyệt");
});
