// AI classroom rules that do not need the model: debate state machine, grading, chat routing, draft normalisation.
import { describe, expect, it } from "vitest";
import type { CheckpointDraft } from "@codi-1/db/schema/classroom";
import {
  ClassroomError, INITIAL_DEBATE, afterRebuttal, applyDraftRequest, chatExcerpt, checkpointDraftSchema, clock, councilMaterial,
  gradeOption, normalizeCheckpoints, pickTrapMode, routeChat, sessionActionRequest, shapeOpening, shuffleOptions,
} from "./classroom-contract";

const draft = (timestampSeconds: number, over: Partial<CheckpointDraft> = {}): CheckpointDraft => ({
  timestampSeconds, concept: "So sánh", question: "`0 == ''` trả về gì?", options: ["true", "false", "TypeError", "undefined"],
  correctIndex: 0, answerKey: "true, vì == ép kiểu", keyIdea: "Dùng === để tránh ép kiểu",
  misconception: { description: "Nghĩ == so sánh chặt", explanation: "== ép kiểu", hint1: "Toán tử nào ép kiểu?", hint2: "Xem quy tắc ==", boClaim: "== với === như nhau", analogy: null },
  ...over,
});

describe("debate state machine", () => {
  const debating = { ...INITIAL_DEBATE, phase: "debate" as const };

  it("closes on a sharp rebuttal", () => {
    const r = afterRebuttal(debating, true);
    expect(r.next).toBe("concede");
    expect(r.state.phase).toBe("closed");
  });

  it("gives hint 1, then hint 2 and the closing, so the debate never loops", () => {
    const first = afterRebuttal(debating, false);
    expect(first).toMatchObject({ next: "hint", level: 1 });
    expect(first.state).toMatchObject({ phase: "debate", hintLevel: 1, rebuttals: 1 });
    const second = afterRebuttal(first.state, false);
    expect(second).toMatchObject({ next: "hint_and_close", level: 2 });
    expect(second.state).toMatchObject({ phase: "closed", hintLevel: 2, rebuttals: 2 });
  });

  it("rejects a rebuttal outside the debate", () => {
    expect(() => afterRebuttal(INITIAL_DEBATE, true)).toThrow(ClassroomError);
    expect(() => afterRebuttal({ ...debating, phase: "closed" }, true)).toThrow(/kết thúc/);
  });

  it("picks Bo's trap from the verdict", () => {
    expect(pickTrapMode("wrong")).toBe("misconception_ally");
    expect(pickTrapMode("correct", () => 0.1)).toBe("shortcut_fallacy");
    expect(pickTrapMode("correct", () => 0.9)).toBe("edge_case_skeptic");
  });

  it("grades multiple choice without the model and leaves open answers to it", () => {
    expect(gradeOption(["a", "b"], 1, 1)).toBe("correct");
    expect(gradeOption(["a", "b"], 1, 0)).toBe("wrong");
    expect(gradeOption(null, null, undefined)).toBeNull();
    expect(() => gradeOption(["a", "b"], 1, 4)).toThrow(ClassroomError);
  });

  it("validates learner actions", () => {
    expect(sessionActionRequest.parse({ action: "rebut", text: " vì == ép kiểu ", version: 2 })).toMatchObject({ text: "vì == ép kiểu" });
    expect(() => sessionActionRequest.parse({ action: "rebut", text: "", version: 0 })).toThrow();
    expect(() => sessionActionRequest.parse({ action: "drop", version: 0 })).toThrow();
  });
});

describe("classroom chat routing", () => {
  it("answers through the chosen classmate", () => {
    expect(routeChat("tại sao vậy", "linhchi")).toEqual({ primary: "linhchi", chime: null });
  });

  it("routes the whole class by intent, accents or not", () => {
    expect(routeChat("Cho mình gợi ý với, mình bí quá", "all").primary).toBe("an");
    expect(routeChat("tom tat giup to cu phap arrow function", "all").primary).toBe("linhchi");
    expect(routeChat("Có ví dụ thực tế nào cho Promise không?", "all").primary).toBe("minhkhang");
    expect(routeChat("Chào cả lớp", "all").primary).toBe("minhkhang");
    expect(routeChat("Vì sao let khác var?", "all")).toEqual({ primary: "tri", chime: "bo" });
    expect(routeChat("Bài này nói về closure", "all")).toEqual({ primary: "colam", chime: "bo" });
  });
});

describe("council draft", () => {
  it("accepts a well-formed checkpoint and rejects a correct index outside the options", () => {
    expect(checkpointDraftSchema.safeParse(draft(40)).success).toBe(true);
    expect(checkpointDraftSchema.safeParse(draft(40, { correctIndex: 4, options: ["a", "b"] })).success).toBe(false);
    expect(checkpointDraftSchema.safeParse(draft(40, { options: null })).success).toBe(false);
    expect(checkpointDraftSchema.safeParse(draft(40, { options: null, correctIndex: null })).success).toBe(true);
    expect(applyDraftRequest.parse({})).toEqual({});
  });

  it("orders checkpoints, keeps them 20 s apart and inside the video", () => {
    const out = normalizeCheckpoints([draft(95), draft(30), draft(40), draft(500)], 120);
    expect(out.map((c) => c.timestampSeconds)).toEqual([30, 50, 95, 119]);
    expect(normalizeCheckpoints([draft(110), draft(115)], 120).map((c) => c.timestampSeconds)).toEqual([110]);
    expect(normalizeCheckpoints([draft(10)], null)[0].timestampSeconds).toBe(10);
  });

  it("reads the transcript with clock marks, else the reading text", () => {
    const cues = [{ start: 5, text: "let và const" }, { start: 65, text: "hoisting" }];
    expect(councilMaterial(cues, "body")).toBe("[0:05] let và const\n[1:05] hoisting");
    expect(councilMaterial(null, "  bài đọc  ")).toBe("bài đọc");
    expect(councilMaterial(null, "x".repeat(50), 10)).toContain("lược bớt");
    expect(chatExcerpt(cues, null, 70)).toContain("hoisting");
    expect(chatExcerpt(null, "nội dung", 10)).toBe("nội dung");
    expect(clock(3725)).toBe("1:02:05");
  });
});

describe("Cô Lam's opening", () => {
  it("drops lines that address other classmates or reveal the answer", () => {
    expect(shapeOpening("Em nghĩ sao? Bo, cậu trả lời đi. Đáp án là true nhé.", "là true nhé")).toBe("Em nghĩ sao?");
    expect(shapeOpening("", "x")).toMatch(/tự nghĩ/);
  });
});

describe("option shuffle", () => {
  it("keeps the correct answer under its new index", () => {
    const out = shuffleOptions(["right", "b", "c", "d"], 0, () => 0);
    expect(out.options[out.correctIndex]).toBe("right");
    expect([...out.options].sort()).toEqual(["b", "c", "d", "right"]);
  });
});
