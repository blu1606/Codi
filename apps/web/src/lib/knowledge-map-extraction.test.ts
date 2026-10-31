import { describe, expect, it } from "vitest";
import { validateKnowledgeMap } from "./knowledge-map-extraction";

const aliases = new Set(["L1", "L2"]);
const base = { concepts: [{ name: "Vòng lặp", description: "Lặp", lessons: ["L1"] }, { name: "Mảng", description: "Dữ liệu", lessons: ["L2"] }], edges: [{ from: "Vòng lặp", to: "Mảng" }] };
describe("knowledge-map extraction validation", () => {
  it("accepts known lesson and concept references", () => expect(validateKnowledgeMap(base, aliases)).toEqual(base));
  it("rejects invented lessons", () => expect(() => validateKnowledgeMap({ ...base, concepts: [{ ...base.concepts[0], lessons: ["L3"] }] }, aliases)).toThrow());
  it("rejects duplicate concepts and unknown or self edges", () => {
    expect(() => validateKnowledgeMap({ ...base, concepts: [base.concepts[0], { ...base.concepts[0], name: "vòng lặp" }] }, aliases)).toThrow();
    expect(() => validateKnowledgeMap({ ...base, edges: [{ from: "Vòng lặp", to: "missing" }] }, aliases)).toThrow();
    expect(() => validateKnowledgeMap({ ...base, edges: [{ from: "Mảng", to: "Mảng" }] }, aliases)).toThrow();
  });
});
