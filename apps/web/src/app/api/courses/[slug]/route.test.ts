import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), courseFrom: vi.fn(), courseJoin: vi.fn(), courseWhere: vi.fn(),
  groupBy: vi.fn(), courseLimit: vi.fn(), detailsFrom: vi.fn(), detailsWhere: vi.fn(),
  detailsLimit: vi.fn(), chapterFrom: vi.fn(), lessonJoin: vi.fn(), chapterWhere: vi.fn(), orderBy: vi.fn(),
}));

vi.mock("@/services", () => ({ db: { select: mocks.select } }));
import { GET } from "./route";

const course = {
  id: "db-course-id", slug: "real-course-slug", title: "Khóa học từ database",
  category: "Backend", level: "Intermediate", duration: "8 tuần", description: "Mô tả đã lưu",
  price: 125000, createdAt: new Date("2026-01-01T00:00:00Z"), enrollmentCount: 7,
};

function request(slug = course.slug) {
  return GET(new Request(`http://localhost/api/courses/${slug}`), { params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select
    .mockReturnValueOnce({ from: mocks.courseFrom })
    .mockReturnValueOnce({ from: mocks.detailsFrom })
    .mockReturnValueOnce({ from: mocks.chapterFrom });
  mocks.courseFrom.mockReturnValue({ leftJoin: mocks.courseJoin });
  mocks.courseJoin.mockReturnValue({ leftJoin: mocks.courseJoin, where: mocks.courseWhere });
  mocks.courseWhere.mockReturnValue({ groupBy: mocks.groupBy });
  mocks.groupBy.mockReturnValue({ limit: mocks.courseLimit });
  mocks.courseLimit.mockResolvedValue([course]);
  mocks.detailsFrom.mockReturnValue({ where: mocks.detailsWhere });
  mocks.detailsWhere.mockReturnValue({ limit: mocks.detailsLimit });
  mocks.detailsLimit.mockResolvedValue([]);
  mocks.chapterFrom.mockReturnValue({ leftJoin: mocks.lessonJoin });
  mocks.lessonJoin.mockReturnValue({ where: mocks.chapterWhere });
  mocks.chapterWhere.mockReturnValue({ orderBy: mocks.orderBy });
  mocks.orderBy.mockResolvedValue([]);
});

describe("GET /api/courses/[slug]", () => {
  it("returns the database course with honest empty content and no fabricated metadata", async () => {
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.course).toEqual({ ...course, createdAt: course.createdAt.toISOString() });
    expect(body).toMatchObject({
      learningOutcomes: [], requirements: [], targetAudience: null,
      coverImageUrl: null, introVideoUrl: null, introVideoCaptionsUrl: null, chapters: [],
      summary: { chapterCount: 0, lessonCount: 0, durationSeconds: 0 },
    });
  });

  it("looks up the exact slug and scopes content to its course, excluding draft chapters and lessons", async () => {
    await request();
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.courseWhere.mock.calls[0][0]).params).toEqual([course.slug]);
    expect(dialect.sqlToQuery(mocks.detailsWhere.mock.calls[0][0]).params).toEqual([course.id]);
    const chapterFilter = dialect.sqlToQuery(mocks.chapterWhere.mock.calls[0][0]);
    expect(chapterFilter.params).toEqual([course.id, true]);
    expect(chapterFilter.sql).toContain('"course_chapters"."is_published"');
    const lessonFilter = dialect.sqlToQuery(mocks.lessonJoin.mock.calls[0][1]);
    expect(lessonFilter.params).toEqual([true]);
    expect(lessonFilter.sql).toContain('"course_lessons"."is_published"');
    expect(mocks.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it("groups returned lessons into chapters and calculates counts and duration without counting empty rows", async () => {
    mocks.detailsLimit.mockResolvedValue([{
      learningOutcomes: ["Kết quả học tập đã nhập"], requirements: ["Kiến thức đã nhập"],
      targetAudience: "Đối tượng đã nhập", coverImageUrl: null, introVideoUrl: null,
    }]);
    mocks.orderBy.mockResolvedValue([
      { chapterId: "chapter-a", chapterTitle: "Chương A", lessonId: "lesson-1", lessonTitle: "Bài 1", description: "Mô tả bài", durationSeconds: 120 },
      { chapterId: "chapter-a", chapterTitle: "Chương A", lessonId: "lesson-2", lessonTitle: "Bài 2", description: null, durationSeconds: 180 },
      { chapterId: "chapter-b", chapterTitle: "Chương B", lessonId: null, lessonTitle: null, description: null, durationSeconds: null },
    ]);
    const body = await (await request()).json();
    expect(body.learningOutcomes).toEqual(["Kết quả học tập đã nhập"]);
    expect(body.requirements).toEqual(["Kiến thức đã nhập"]);
    expect(body.targetAudience).toBe("Đối tượng đã nhập");
    expect(body.summary).toEqual({ chapterCount: 2, lessonCount: 2, durationSeconds: 300 });
    expect(body.chapters.map((chapter: { lessons: unknown[] }) => chapter.lessons.length)).toEqual([2, 0]);
    expect(body.chapters[0].lessons[0]).toEqual({ id: "lesson-1", title: "Bài 1", description: "Mô tả bài", durationSeconds: 120 });
  });

  it("returns 404 without querying curriculum for an unknown slug", async () => {
    mocks.courseLimit.mockResolvedValue([]);
    expect((await request("unknown-course")).status).toBe(404);
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("returns the authored intro video and caption URLs without inventing captions", async () => {
    mocks.detailsLimit.mockResolvedValue([{
      introVideoUrl: "/videos/frontend-intro.mp4",
      introVideoCaptionsUrl: "/videos/frontend-intro.vi.vtt",
    }]);
    const body = await (await request()).json();
    expect(body.introVideoUrl).toBe("/videos/frontend-intro.mp4");
    expect(body.introVideoCaptionsUrl).toBe("/videos/frontend-intro.vi.vtt");
  });

  it("reports a database failure instead of disguising it as an empty curriculum", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.detailsLimit.mockRejectedValueOnce(new Error("Database unavailable"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Không thể tải thông tin khóa học." });
    spy.mockRestore();
  });

  it("rejects oversized route parameters before querying the database", async () => {
    expect((await request("x".repeat(201))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
