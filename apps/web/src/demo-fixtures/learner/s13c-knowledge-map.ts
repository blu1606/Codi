import type { KnowledgeMapView } from "@/lib/learning-path-contract";
import knowledgeMapSnapshot from "../snapshot/knowledge-map.json";

/** Confirmed map of the seeded learner's course, read from the live database snapshot. */
export const knowledgeMapDefault = knowledgeMapSnapshot as KnowledgeMapView;

/** Confirmed map where nothing has been learned yet. */
export const knowledgeMapAllUnlearned: KnowledgeMapView = {
  ...knowledgeMapDefault,
  nodes: knowledgeMapDefault.nodes.map((n) => ({ ...n, probability: null, evidenceCount: 0, level: 0, recommended: false })),
};

/** Map not confirmed yet: the page shows the empty explainer. */
export const knowledgeMapHidden: KnowledgeMapView = {
  ...knowledgeMapDefault,
  confirmed: false,
  nodes: [],
  edges: [],
};

export const knowledgeMapEmpty: KnowledgeMapView = {
  courses: [],
  courseId: null,
  title: null,
  confirmed: false,
  nodes: [],
  edges: [],
};
