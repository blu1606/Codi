import { describe, expect, it } from "vitest";
import {
  applyIntakePatch,
  intakeLabels,
  intakeNote,
  missingIntake,
  sanitizeIntake,
} from "./learner-intake-contract";

describe("S17 intake answers (Flow L13)", () => {
  it("asks only the fields that are unknown and not skipped, in the Tutor's order", () => {
    expect(missingIntake({}, [])).toEqual(["goal", "level", "hours"]);
    expect(missingIntake({ level: "basic" }, ["hours"])).toEqual(["goal"]);
    expect(missingIntake({ goal: "finish", level: "new", hours: 5 }, [])).toEqual([]);
  });

  it("a given answer sets its field, a null clears it, and the other fields stay", () => {
    const known = { goal: "project", level: "new", hours: 5 } as const;
    expect(applyIntakePatch(known, { level: "solid" })).toEqual({
      goal: "project",
      level: "solid",
      hours: 5,
    });
    expect(applyIntakePatch(known, { hours: null })).toEqual({ goal: "project", level: "new" });
  });

  it("values the onboarding draft does not accept never reach the stored answers", () => {
    expect(sanitizeIntake({ goal: "fly", level: "new", hours: 7, extra: true })).toEqual({
      level: "new",
    });
    expect(applyIntakePatch({}, { hours: 3 })).toEqual({});
  });

  it("the summary and the Tutor note show the same labels as the questions", () => {
    const draft = { goal: "interview", level: "basic", hours: 5 } as const;
    expect(intakeLabels(draft).map((item) => item.label)).toEqual([
      "Chuẩn bị phỏng vấn",
      "Có kinh nghiệm cơ bản",
      "5-10 giờ/tuần",
    ]);
    expect(intakeNote(draft)).toBe(
      "Hồ sơ học viên: Chuẩn bị phỏng vấn, Có kinh nghiệm cơ bản, 5-10 giờ/tuần",
    );
    expect(intakeNote({})).toBe("");
  });
});
