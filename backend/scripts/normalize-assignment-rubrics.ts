// Converts assignment rubrics stored as seed markdown ("- Name (N điểm): description") into the JSON criteria
// list Codi's grading action requires ([{ id, name, desc, points }]). Rows already in JSON are left alone.
// Safe to re-run: `tsx --env-file-if-exists=.env scripts/normalize-assignment-rubrics.ts`.
import { fileURLToPath } from "node:url";
import { and, eq, isNotNull } from "drizzle-orm";
import { assessments, createDb } from "@codi-1/db";
import { ENV } from "../src/env";
import { parseRubric } from "../src/lib/assignment-rubric";

const isJson = (raw: string) => { try { return Array.isArray(JSON.parse(raw)); } catch { return false; } };

export async function normalizeAssignmentRubrics(databaseUrl = ENV.DATABASE_URL) {
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    const rows = await db.select({ id: assessments.id, rubric: assessments.rubric, maxScore: assessments.maxScore }).from(assessments)
      .where(and(eq(assessments.type, "assignment"), isNotNull(assessments.rubric)));
    let changed = 0;
    for (const row of rows) {
      if (!row.rubric || isJson(row.rubric)) continue;
      const items = parseRubric(row.rubric);
      const total = items.reduce((s, k) => s + k.points, 0);
      // keep the text when it cannot be read as criteria that add up to the max score
      if (!items.length || Math.abs(total - row.maxScore) > 1e-9) continue;
      await db.update(assessments).set({ rubric: JSON.stringify(items) }).where(eq(assessments.id, row.id));
      changed += 1;
    }
    return { checked: rows.length, changed };
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  normalizeAssignmentRubrics().then((r) => { console.log(`[rubrics] ${r.changed}/${r.checked} assignment rubrics converted to JSON`); })
    .catch((e) => { console.error(e); process.exit(1); });
}
