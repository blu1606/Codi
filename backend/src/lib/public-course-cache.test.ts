import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { cachedPublic, clearPublicCourseCache } from "./public-course-cache";

afterEach(() => {
  clearPublicCourseCache();
  vi.useRealTimers();
});

describe("public course cache", () => {
  it("loads once for repeated and concurrent requests", async () => {
    const load = vi.fn().mockResolvedValue({ title: "JS" });
    const [a, b] = await Promise.all([cachedPublic("k", load), cachedPublic("k", load)]);
    await cachedPublic("k", load);
    expect(a).toEqual({ title: "JS" });
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after 30 seconds", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue(1);
    await cachedPublic("k", load);
    vi.advanceTimersByTime(30_001);
    await cachedPublic("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep values the caller refuses (not found)", async () => {
    const load = vi.fn().mockResolvedValue(null);
    await cachedPublic("missing", load, (v) => v !== null);
    await Promise.resolve();
    await cachedPublic("missing", load, (v) => v !== null);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(2);
    await expect(cachedPublic("k", load)).rejects.toThrow("db down");
    expect(await cachedPublic("k", load)).toBe(2);
  });

  it("is emptied by revalidatePath, which course edits call", async () => {
    const load = vi.fn().mockResolvedValue(1);
    await cachedPublic("k", load);
    revalidatePath("/dashboard/lecturer/courses/x");
    await cachedPublic("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
