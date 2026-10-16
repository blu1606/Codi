import { describe, expect, it } from "vitest";
import { pathGenerationFailure } from "./learning-path-errors";
import { LearningPathError, pathProposal } from "./learning-path-contract";

describe("sanitized path generation failures", () => {
  it.each(["TimeoutError", "AbortError"])(
    "classifies %s without retaining its message",
    (name) => {
      expect(
        pathGenerationFailure(
          Object.assign(new Error("provider secret"), { name }),
        ),
      ).toBe("timeout");
    },
  );
  it.each([
    "AI_NoObjectGeneratedError",
    "AI_NoOutputGeneratedError",
    "AI_TypeValidationError",
    "AI_JSONParseError",
  ])("classifies %s as invalid output", (name) => {
    expect(
      pathGenerationFailure(
        Object.assign(new Error("private response"), { name }),
      ),
    ).toBe("invalid_output");
  });
  it("classifies local schema and scheduling validation", () => {
    const result = pathProposal.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success)
      expect(pathGenerationFailure(result.error)).toBe("invalid_output");
    expect(pathGenerationFailure(new LearningPathError("foreign row"))).toBe(
      "invalid_output",
    );
  });
  it.each([new Error("private credential"), "private body", null])(
    "never includes unrecognized failure details",
    (error) => {
      expect(pathGenerationFailure(error)).toBe("provider_error");
    },
  );
});
