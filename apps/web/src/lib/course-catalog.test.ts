import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCourses } from "./course-catalog";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCourses", () => {
  it("fetches courses with signal and returns course array", async () => {
    const mockCourses = [
      { id: "c1", title: "Course 1", slug: "course-1", price: 100000 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ courses: mockCourses }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const result = await fetchCourses(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith("/api/courses", {
      signal: controller.signal,
    });
    expect(result).toEqual(mockCourses);
  });

  it("throws friendly error when API returns non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await expect(fetchCourses(controller.signal)).rejects.toThrow(
      "Không thể tải khóa học. Vui lòng thử lại."
    );
  });

  it("throws error when API returns invalid payload shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ courses: "not-an-array" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await expect(fetchCourses(controller.signal)).rejects.toThrow(
      "Dữ liệu khóa học không hợp lệ."
    );
  });
});
