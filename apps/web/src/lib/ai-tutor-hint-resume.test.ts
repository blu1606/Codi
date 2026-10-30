import { describe, expect, it } from "vitest";
import type { Database } from "@codi-1/db";
import { createTutorService, type TutorScope } from "./ai-tutor-service";

// A query chain that answers with the rows it was given, whatever the filter.
function database(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ["from", "where", "orderBy"]) chain[step] = () => chain;
  chain.limit = async () => rows;
  return { select: () => chain } as unknown as Database;
}

const scope = { userId: "u1", lessonId: "lesson-1" } as TutorScope;

describe("hint retry (S11a ladder)", () => {
  it("a retry of a hint step reuses that step and its existing log row", async () => {
    const service = createTutorService(database([{ id: 42 }]));
    await expect(service.resumeHint(scope, 2)).resolves.toEqual({ level: 2, logId: 42 });
  });

  it("with no log row for that step the caller has nothing to resume", async () => {
    const service = createTutorService(database([]));
    await expect(service.resumeHint(scope, 3)).resolves.toBeNull();
  });
});
