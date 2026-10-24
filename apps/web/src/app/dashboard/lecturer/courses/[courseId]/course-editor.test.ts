// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseEditor } from "./course-editor";

const boundary = vi.hoisted(() => ({
  details: vi.fn(), save: vi.fn(), deleteChapter: vi.fn(), refresh: vi.fn(), error: vi.fn(), success: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: boundary.error, success: boundary.success }) }));
vi.mock("./actions", () => ({
  getLessonDetails: boundary.details, updateLesson: boundary.save,
  addChapter: vi.fn(), addLesson: vi.fn(), deleteChapter: boundary.deleteChapter, deleteLesson: vi.fn(),
  moveChapter: vi.fn(), moveLesson: vi.fn(), renameChapter: vi.fn(), renameLesson: vi.fn(),
  restoreLesson: vi.fn(), updateCourseInfo: vi.fn(),
}));
vi.mock("./kmap/actions", () => ({
  acceptAllKnowledgeMap: vi.fn(), addKnowledgeMapEdge: vi.fn(), confirmKnowledgeMap: vi.fn(),
  renameKnowledgeMapConcept: vi.fn(), reviewKnowledgeMapItem: vi.fn(), runKnowledgeMapAnalysis: vi.fn(),
}));
vi.mock("./publish/actions", () => ({
  markFlagFixed: vi.fn(), reopenFlag: vi.fn(), submitCourseForPublication: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
const lesson = (id: string) => ({ id, title: `Lesson ${id}`, position: 0, durationSeconds: 600 });
const detail = (id: string) => ({
  lesson: lesson(id),
  materials: [{ id: id === "A" ? 1 : 2, type: "pdf", title: `Material ${id}`, url: `https://example.com/${id}.pdf` }],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .find((node) => node.textContent?.trim() === text)!;
const saveButton = () => button("Lưu bài học");
async function click(text: string) { await act(async () => button(text).click()); }
async function open(id: string) {
  const index = id === "A" ? 0 : 1;
  const controls = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .filter((node) => node.textContent?.trim() === "Chi tiết");
  await act(async () => controls[index]!.click());
}

beforeEach(async () => {
  vi.resetAllMocks();
  boundary.save.mockResolvedValue({ success: true });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(CourseEditor, {
    courseId: "course", activeTab: "content",
    data: {
      course: { id: "course", title: "Course", status: "draft", level: "Beginner" },
      details: {}, entryTest: null, isLocked: false,
      chapters: [{ id: "chapter", title: "Chapter", position: 0, lessons: [lesson("A"), lesson("B")] }],
    },
  })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("chapter deletion confirmation", () => {
  it.each([false, true])("explains empty-only deletion and preserves the confirm result %s", async (confirmed) => {
    const confirm = vi.fn().mockReturnValue(confirmed);
    vi.stubGlobal("confirm", confirm);
    boundary.deleteChapter.mockRejectedValue(new Error("Không thể xoá chương còn bài học. Hãy xoá từng bài học đủ điều kiện trước, rồi xoá chương trống."));
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="Xoá chương"]')!.click());
    expect(confirm).toHaveBeenCalledOnce();
    const message = confirm.mock.calls[0]![0];
    expect(message).toContain("Chỉ có thể xoá chương trống");
    expect(message).toContain("Chapter");
    expect(message).not.toMatch(/cùng toàn bộ bài học|xoá.*bài học bên trong/i);
    if (confirmed) {
      expect(boundary.deleteChapter).toHaveBeenCalledWith("course", "chapter");
      expect(boundary.error).toHaveBeenCalledWith(expect.stringContaining("Hãy xoá từng bài học"));
    } else {
      expect(boundary.deleteChapter).not.toHaveBeenCalled();
      expect(boundary.error).not.toHaveBeenCalled();
    }
    expect(boundary.success).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
});

describe("lesson editor detail safety", () => {
  it("blocks save after a failed load and allows retry with preserved materials", async () => {
    boundary.details.mockRejectedValueOnce(new Error("Load failed")).mockResolvedValueOnce(detail("A"));
    await open("A");
    expect(saveButton().disabled).toBe(true);
    await click("Lưu bài học");
    expect(boundary.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Load failed");
    await click("Thử lại");
    expect(saveButton().disabled).toBe(false);
    await click("Lưu bài học");
    expect(boundary.save).toHaveBeenCalledWith("course", "A", expect.objectContaining({
      materials: [expect.objectContaining({ id: 1, title: "Material A" })],
    }));
  });

  it.each(["resolve", "reject"] as const)("ignores a stale A %s after B loads", async (settle) => {
    const a = deferred<ReturnType<typeof detail>>();
    boundary.details.mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail("B"));
    await open("A");
    await click("Huỷ");
    await open("B");
    await act(async () => {
      if (settle === "resolve") a.resolve(detail("A"));
      else a.reject(new Error("Stale failure"));
    });
    expect(document.body.textContent).toContain("Material B");
    expect(document.body.textContent).not.toContain("Material A");
    expect(boundary.error).not.toHaveBeenCalled();
    await click("Lưu bài học");
    expect(boundary.save).toHaveBeenCalledWith("course", "B", expect.objectContaining({
      title: "Lesson B", materials: [expect.objectContaining({ id: 2 })],
    }));
  });

  it("does not unlock a pending B load when stale A finishes", async () => {
    const a = deferred<ReturnType<typeof detail>>();
    const b = deferred<ReturnType<typeof detail>>();
    boundary.details.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await open("A");
    await click("Huỷ");
    await open("B");
    await act(async () => a.resolve(detail("A")));
    expect(saveButton().disabled).toBe(true);
    expect(document.body.textContent).toContain("Đang tải thông tin bài học");
    await act(async () => b.resolve(detail("B")));
    expect(saveButton().disabled).toBe(false);
  });

  it.each([null, lesson("B")])("rejects missing or mismatched lesson details: %j", async (returnedLesson) => {
    boundary.details.mockResolvedValue({ lesson: returnedLesson, materials: detail("A").materials });
    await open("A");
    expect(saveButton().disabled).toBe(true);
    await click("Lưu bài học");
    expect(boundary.save).not.toHaveBeenCalled();
  });

  it("offers URL-only materials with no file picker or delayed upload success", async () => {
    boundary.details.mockResolvedValue(detail("A"));
    await open("A");
    await click("Thêm tài liệu");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.body.textContent).toContain("Chỉ hỗ trợ đường dẫn (URL)");
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(boundary.success).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Tải lên thành công");
  });

  it("saves a supplied material URL alongside existing materials", async () => {
    boundary.details.mockResolvedValue(detail("A"));
    await open("A");
    await click("Thêm tài liệu");
    const title = document.querySelector<HTMLInputElement>('input[placeholder="Ví dụ: Slide bài giảng Chương 1"]')!;
    const url = document.querySelector<HTMLInputElement>('input[placeholder="https://..."]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(title, "External PDF");
      title.dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(url, "https://example.com/external.pdf");
      url.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Thêm vào danh sách");
    await click("Lưu bài học");
    expect(boundary.save).toHaveBeenCalledWith("course", "A", expect.objectContaining({
      materials: [expect.objectContaining({ id: 1 }), expect.objectContaining({ title: "External PDF", url: "https://example.com/external.pdf" })],
    }));
    expect(boundary.success.mock.calls.some(([message]) => /tải lên/i.test(message))).toBe(false);
  });
});
