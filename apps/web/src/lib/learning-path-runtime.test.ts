import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), runPending: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/services", () => ({ db: {} }));
vi.mock("./learning-path-ai", () => ({ generateLearningPath: vi.fn() }));
vi.mock("./learning-path-service", () => ({ createLearningPathService: () => ({ runPending: mocks.runPending }) }));
import { scheduleLearningPath } from "./learning-path-runtime";

describe("learning path scheduling", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("leaves jobs for the standalone worker when enabled", () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
    scheduleLearningPath("user", "course");
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("preserves the request after-hook when the worker is disabled", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "false");
    scheduleLearningPath("user", "course");
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.runPending).toHaveBeenCalledWith("user", "course");
  });
});
