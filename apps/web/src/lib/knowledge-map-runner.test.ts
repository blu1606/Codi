import { describe, expect, it } from "vitest";
import {
  computeAcceptAllPlan,
  computeLecturerGraphLayers,
  findCycle,
  reaches,
  topoSortLessons,
} from "./knowledge-map-runner";

describe("knowledge-map-runner algorithms", () => {
  describe("findCycle", () => {
    it("returns null for an acyclic graph", () => {
      const concepts = [1, 2, 3];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      expect(findCycle(concepts, edges)).toBeNull();
    });

    it("detects a 2-node cycle (A -> B -> A)", () => {
      const concepts = [1, 2];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ];
      const cycle = findCycle(concepts, edges);
      expect(cycle).not.toBeNull();
      expect(cycle).toEqual([1, 2, 1]);
    });

    it("detects a 3-node cycle (1 -> 2 -> 3 -> 1)", () => {
      const concepts = [1, 2, 3];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 1 },
      ];
      const cycle = findCycle(concepts, edges);
      expect(cycle).not.toBeNull();
      expect(cycle).toEqual([1, 2, 3, 1]);
    });

    it("ignores edges pointing to non-existent or declined concepts", () => {
      const concepts = [1, 2];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 99 }, // 99 not in concepts
        { from: 99, to: 1 },
      ];
      expect(findCycle(concepts, edges)).toBeNull();
    });
  });

  describe("computeLecturerGraphLayers", () => {
    it("partitions acyclic nodes into sequential columns", () => {
      const nodes = [1, 2, 3];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      const layers = computeLecturerGraphLayers(nodes, edges);
      expect(layers).toEqual([[1], [2], [3]]);
    });

    it("groups parallel roots in layer 0", () => {
      const nodes = [1, 2, 3];
      const edges = [
        { from: 1, to: 3 },
        { from: 2, to: 3 },
      ];
      const layers = computeLecturerGraphLayers(nodes, edges);
      expect(layers[0]).toContain(1);
      expect(layers[0]).toContain(2);
      expect(layers[1]).toEqual([3]);
    });

    it("does not throw on cyclic graphs and preserves all nodes", () => {
      const nodes = [1, 2, 3];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ];
      const layers = computeLecturerGraphLayers(nodes, edges);
      const allAssigned = layers.flat();
      expect(allAssigned.sort()).toEqual([1, 2, 3]);
    });
  });

  describe("reaches", () => {
    it("returns true when path exists", () => {
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      expect(reaches(1, 3, edges)).toBe(true);
      expect(reaches(1, 2, edges)).toBe(true);
      expect(reaches(2, 3, edges)).toBe(true);
    });

    it("returns false when path does not exist", () => {
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      expect(reaches(3, 1, edges)).toBe(false);
      expect(reaches(2, 1, edges)).toBe(false);
    });
  });

  describe("computeAcceptAllPlan (D10)", () => {
    it("accepts all concepts and safe edges", () => {
      const suggestedConcepts = [1, 2, 3];
      const suggestedEdges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      const keptEdges: { from: number; to: number }[] = [];

      const plan = computeAcceptAllPlan(suggestedConcepts, suggestedEdges, keptEdges);
      expect(plan.acceptedConcepts).toEqual([1, 2, 3]);
      expect(plan.acceptedEdges).toEqual([
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ]);
      expect(plan.skippedEdges).toHaveLength(0);
    });

    it("skips edges that would close a loop", () => {
      const suggestedConcepts = [1, 2, 3];
      const keptEdges = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ];
      // Suggested edge 3 -> 1 would close loop 1 -> 2 -> 3 -> 1
      const suggestedEdges = [{ from: 3, to: 1 }];

      const plan = computeAcceptAllPlan(suggestedConcepts, suggestedEdges, keptEdges);
      expect(plan.acceptedConcepts).toEqual([1, 2, 3]);
      expect(plan.acceptedEdges).toHaveLength(0);
      expect(plan.skippedEdges).toEqual([{ from: 3, to: 1 }]);
    });
  });

  describe("topoSortLessons", () => {
    it("orders lessons according to concept prerequisite chain", () => {
      const concepts = [
        { id: 1, lessonIds: ["l1"] },
        { id: 2, lessonIds: ["l2"] },
      ];
      const edges = [{ from: 1, to: 2 }];
      const lessons = [
        { id: "l2", title: "Lesson 2" },
        { id: "l1", title: "Lesson 1" },
        { id: "l3", title: "Unlinked Lesson 3" },
      ];

      const sorted = topoSortLessons(concepts, edges, lessons);
      expect(sorted).not.toBeNull();
      expect(sorted!.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    });

    it("returns null when concept graph has a cycle", () => {
      const concepts = [
        { id: 1, lessonIds: ["l1"] },
        { id: 2, lessonIds: ["l2"] },
      ];
      const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ];
      const lessons = [
        { id: "l1", title: "L1" },
        { id: "l2", title: "L2" },
      ];

      expect(topoSortLessons(concepts, edges, lessons)).toBeNull();
    });
  });
});
