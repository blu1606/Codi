import { describe, expect, it } from "vitest";
import { checkpointDue, checkpointToPause } from "./checkpoint-trigger";

const cps = [{ id: "a", timestampSeconds: 30 }, { id: "b", timestampSeconds: 90 }, { id: "c", timestampSeconds: 150 }];
const s = (phase) => ({ phase });

describe("checkpointDue", () => {
  it("is due when never opened or opened without an answer", () => {
    expect(checkpointDue(undefined)).toBe(true);
    expect(checkpointDue(s("question"))).toBe(true);
  });

  it("is not due once answered, skipped or closed", () => {
    expect(checkpointDue(s("debate"))).toBe(false);
    expect(checkpointDue(s("skipped"))).toBe(false);
    expect(checkpointDue(s("closed"))).toBe(false);
  });
});

describe("checkpointToPause on resume (first tick)", () => {
  it("stops at the earliest checkpoint passed without an answer", () => {
    expect(checkpointToPause(cps, {}, null, 120)?.id).toBe("a");
  });

  it("does not stop again at a skipped or answered checkpoint", () => {
    expect(checkpointToPause(cps, { a: s("skipped"), b: s("debate") }, null, 120)).toBeNull();
    expect(checkpointToPause(cps, { a: s("closed") }, null, 120)?.id).toBe("b");
  });

  it("still stops at a checkpoint that was opened but not answered", () => {
    expect(checkpointToPause(cps, { a: s("skipped"), b: s("question") }, null, 120)?.id).toBe("b");
  });

  it("ignores checkpoints after the resume point", () => {
    expect(checkpointToPause(cps, {}, null, 10)).toBeNull();
  });
});

describe("checkpointToPause during playback", () => {
  it("stops when playback crosses a due checkpoint", () => {
    expect(checkpointToPause(cps, {}, 89.5, 90.2)?.id).toBe("b");
  });

  it("does not stop at a crossed checkpoint the learner skipped", () => {
    expect(checkpointToPause(cps, { b: s("skipped") }, 89.5, 90.2)).toBeNull();
  });

  it("never triggers on a seek", () => {
    expect(checkpointToPause(cps, {}, 20, 100)).toBeNull();
    expect(checkpointToPause(cps, {}, 100, 89)).toBeNull();
  });
});
