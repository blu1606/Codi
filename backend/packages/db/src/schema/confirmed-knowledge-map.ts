// One publication, not a copy of canonical skill identities or a revision history.
export interface ConfirmedKnowledgeMap {
  version: 1;
  publicationId: string;
  contentGeneration: number;
  publishedAt: string;
  skills: {
    id: number;
    name: string;
    bktPInit: number;
    bktPLearn: number;
    bktPGuess: number;
    bktPSlip: number;
  }[];
  edges: { from: number; to: number }[];
  links: { lessonId: string; skillId: number }[];
}
