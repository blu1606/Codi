import { describe, expect, it } from "vitest";
import { onboardingReturnPath } from "./onboarding-return";
describe("onboarding return after sign-in", () => {
  it("accepts only the local course onboarding destination", () => expect(onboardingReturnPath("/learn/course-1/onboarding")).toBe("/learn/course-1/onboarding"));
  it.each(["/learn/course-1", "/insights/knowledge-map"])("preserves the course-home and knowledge-map intent: %s", (value) => expect(onboardingReturnPath(value)).toBe(value));
  it.each([null, "https://attacker.test", "//attacker.test", "/learn/../onboarding", "/learn/x/onboarding?to=external", "/learn/x\\y/onboarding", "/admin", "/learn/x\ny/onboarding"])("rejects non-onboarding and unsafe destinations: %s", (value) => {
    expect(onboardingReturnPath(value)).toBe("/dashboard");
  });
});
