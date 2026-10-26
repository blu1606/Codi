import { describe, expect, it } from "vitest";
import { onboardingReturnPath } from "./onboarding-return";
describe("onboarding return after sign-in", () => {
  it("accepts only the local course onboarding destination", () => expect(onboardingReturnPath("/learn/course-1/onboarding")).toBe("/learn/course-1/onboarding"));
  it.each(["/learn/course-1", "/insights/knowledge-map", "/ai", "/ai?action=add-cart&courseId=course-1"])("preserves the course-home, knowledge-map and ai intent: %s", (value) => expect(onboardingReturnPath(value)).toBe(value));
  it("preserves the exact lesson after login", () => expect(onboardingReturnPath("/learn/course-1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("/learn/course-1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
  it.each([null, "https://attacker.test", "//attacker.test", "/learn/../onboarding", "/learn/x/onboarding?to=external", "/learn/x\\y/onboarding", "/admin", "/learn/x\ny/onboarding", "/ai/../admin", "/ai\\login"])("rejects non-onboarding and unsafe destinations: %s", (value) => {
    expect(onboardingReturnPath(value)).toBe("/dashboard");
  });
});
