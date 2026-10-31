import { describe, expect, it, vi } from "vitest";
import { hasExpiredPathClaim, learningPathClaimDisposition } from "./learning-path-worker-claim";
import { attemptLearningPathGeneration } from "./learning-path-worker-attempt";

describe("background claim fencing", () => {
  const unclaimed = { id: "one", leaseToken: null, leaseExpiresAt: null };
  it("runs only the observed pending job and skips a superseded job", () => {
    expect(learningPathClaimDisposition(unclaimed, 1000, "one")).toBe("run");
    expect(learningPathClaimDisposition(unclaimed, 1000, "superseded")).toBe("skip");
    expect(learningPathClaimDisposition(undefined, 1000, "one")).toBe("skip");
  });
  it("reconciles expired claims in both worker and request paths", () => {
    const previous = { id: "one", leaseToken: "lease", leaseExpiresAt: new Date(500) };
    expect(learningPathClaimDisposition(previous, 1000, "one")).toBe("recover");
    expect(learningPathClaimDisposition(previous, 1000)).toBe("recover");
    expect(learningPathClaimDisposition({ ...previous, leaseExpiresAt: new Date(1500) }, 1000)).toBe("skip");
    expect(hasExpiredPathClaim([previous], 1000)).toBe(true);
    expect(hasExpiredPathClaim([{ ...previous, leaseExpiresAt: new Date(1500) }], 1000)).toBe(false);
  });
  it("never calls the model when the previous result is ambiguous", async () => {
    const generate = vi.fn(async () => "ok");
    expect(await attemptLearningPathGeneration(true, generate)).toEqual({ failure: "timeout" });
    expect(generate).not.toHaveBeenCalled();
    expect(await attemptLearningPathGeneration(false, generate)).toEqual({ result: "ok", failure: null });
    expect(generate).toHaveBeenCalledOnce();
  });
  it("preserves unavailable and sanitized provider failure semantics", async () => {
    expect(await attemptLearningPathGeneration(false)).toEqual({ failure: "provider_unavailable" });
    expect(await attemptLearningPathGeneration(false, async () => { throw new Error("secret"); }))
      .toEqual({ failure: "provider_error" });
  });
});
