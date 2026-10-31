import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  enabled: vi.fn(),
  assertNoActive: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (...values: unknown[]) => values,
}));
vi.mock("@codi-1/db", () => ({
  courses: { __tableName: "courses", id: "course.id", instructorId: "course.instructor_id" },
  courseChapters: { id: "chapter.id", courseId: "chapter.course_id" },
  courseLessons: { id: "lesson.id", chapterId: "lesson.chapter_id" },
}));
vi.mock("./confirmed-knowledge-map", () => ({ lockKnowledgeMap: mocks.lock }));
vi.mock("./knowledge-map-extraction", () => ({ knowledgeMapProducerEnabled: mocks.enabled }));
vi.mock("@codi-1/db/ai-jobs", () => ({
  AiJobEnqueueError: class AiJobEnqueueError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  assertNoActiveAiJob: mocks.assertNoActive,
  enqueueAiJob: mocks.enqueue,
}));
vi.mock("@/services", () => ({ db: { transaction: vi.fn() } }));

import { db } from "@/services";
import { AiJobEnqueueError } from "@codi-1/db/ai-jobs";
import { enqueueLatestKnowledgeMapAnalysis } from "./knowledge-map-jobs";

const course = { id: "course-1", instructorId: "lecturer-1", status: "draft", knowledgeMapContentGeneration: 4 };
const lessonRows = [{ id: "lesson-1" }];
const tx = {
  select: vi.fn(() => ({
    from: vi.fn((table: { __tableName?: string }) => table?.__tableName === "courses"
      ? { where: vi.fn().mockResolvedValue([course]) }
      : { innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue(lessonRows) })) }),
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.assertNoActive.mockResolvedValue(undefined);
  mocks.enqueue.mockResolvedValue("job-1");
  vi.mocked(db.transaction).mockImplementation(async (run) => run(tx as never) as never);
});

describe("automatic knowledge map enqueue", () => {
  it("queues the latest saved generation under the course lock", async () => {
    await expect(enqueueLatestKnowledgeMapAnalysis(db, { courseId: "course-1", userId: "lecturer-1" }))
      .resolves.toEqual({ queued: true, jobId: "job-1" });

    expect(mocks.lock).toHaveBeenCalledWith(tx, "course-1", "write");
    expect(mocks.assertNoActive).toHaveBeenCalledWith(tx, {
      type: "knowledge_map", userId: "lecturer-1", resourceId: "course-1",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(tx, {
      type: "knowledge_map", userId: "lecturer-1", resourceId: "course-1", payload: { generation: 4 },
    });
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("does not enqueue if background AI is disabled", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(enqueueLatestKnowledgeMapAnalysis(db, { courseId: "course-1", userId: "lecturer-1" }))
      .resolves.toEqual({ queued: false, reason: "disabled" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("does not enqueue a course without lessons", async () => {
    mocks.enabled.mockReturnValue(true);
    tx.select.mockImplementationOnce(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([course]) })),
    }) as never).mockImplementationOnce(() => ({
      from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    }) as never);

    await expect(enqueueLatestKnowledgeMapAnalysis(db, { courseId: "course-1", userId: "lecturer-1" }))
      .resolves.toEqual({ queued: false, reason: "no_lessons" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("leaves an existing active job alone", async () => {
    mocks.assertNoActive.mockRejectedValue(new AiJobEnqueueError("active_job"));
    await expect(enqueueLatestKnowledgeMapAnalysis(db, { courseId: "course-1", userId: "lecturer-1" }))
      .resolves.toEqual({ queued: false, reason: "active_job" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("keeps the content save independent when the daily AI limit is reached", async () => {
    mocks.enqueue.mockRejectedValue(new AiJobEnqueueError("daily_limit"));
    await expect(enqueueLatestKnowledgeMapAnalysis(db, { courseId: "course-1", userId: "lecturer-1" }))
      .resolves.toEqual({ queued: false, reason: "daily_limit" });
    expect(tx.update).not.toHaveBeenCalled();
  });
});
