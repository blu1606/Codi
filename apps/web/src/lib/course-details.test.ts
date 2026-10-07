import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseDetailError, fetchCourseDetail, formatLessonDuration } from "./course-details";

afterEach(() => vi.unstubAllGlobals());

describe("course detail API client", () => {
  it("fetches the selected slug and forwards cancellation to the API", async () => {
    const payload = { course: { slug: "selected-course" }, chapters: [], summary: { chapterCount: 0, lessonCount: 0, durationSeconds: 0 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    expect(await fetchCourseDetail("selected-course", controller.signal)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/selected-course", { signal: controller.signal });
  });

  it("preserves a 404 so the page can show a missing course instead of a retry error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    await expect(fetchCourseDetail("removed", new AbortController().signal)).rejects.toMatchObject({ status: 404, name: "CourseDetailError" });
  });

  it("does not fall back to mock data when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await expect(fetchCourseDetail("course", new AbortController().signal)).rejects.toBeInstanceOf(CourseDetailError);
  });

  it.each([[0, ""], [59, "0:59"], [60, "1:00"], [3661, "1:01:01"]])("formats lesson duration %i as %s", (seconds, expected) => {
    expect(formatLessonDuration(seconds)).toBe(expected);
  });
});
