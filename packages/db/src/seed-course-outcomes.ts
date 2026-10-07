import { readFile } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const outcomes: Record<string, string[]> = JSON.parse(
  await readFile(new URL("../data/course-learning-outcomes.json", import.meta.url), "utf8"),
);
const entries = Object.entries(outcomes);
if (entries.length !== 5 || entries.some(([slug, items]) =>
  !slug.trim() || !Array.isArray(items) || items.length !== 6 ||
  items.some((item) => typeof item !== "string" || !item.trim()),
)) {
  throw new Error("Expected exactly six non-empty learning outcomes for each of the five courses.");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const { rows } = await client.query<{ id: string; slug: string }>(
    "SELECT id, slug FROM public.courses WHERE slug = ANY($1::text[])",
    [entries.map(([slug]) => slug)],
  );
  const ids = new Map(rows.map((row) => [row.slug, row.id]));
  const missing = entries.filter(([slug]) => !ids.has(slug)).map(([slug]) => slug);
  if (missing.length) throw new Error(`Courses missing from database: ${missing.join(", ")}`);

  for (const [slug, items] of entries) {
    await client.query(
      `INSERT INTO public.course_details (course_id, learning_outcomes)
       VALUES ($1, $2::text[])
       ON CONFLICT (course_id) DO UPDATE
       SET learning_outcomes = EXCLUDED.learning_outcomes`,
      [ids.get(slug), items],
    );
  }
  const verified = await client.query<{ slug: string; learning_outcomes: string[] }>(
    `SELECT c.slug, d.learning_outcomes FROM public.courses c
     JOIN public.course_details d ON d.course_id = c.id
     WHERE c.slug = ANY($1::text[])`,
    [entries.map(([slug]) => slug)],
  );
  if (verified.rows.length !== entries.length || verified.rows.some((row) =>
    JSON.stringify(row.learning_outcomes) !== JSON.stringify(outcomes[row.slug]),
  )) {
    throw new Error("Learning outcomes verification failed; changes will be rolled back.");
  }
  await client.query("COMMIT");
  for (const [slug, items] of entries) console.log(`${slug}: saved ${items.length} learning outcomes`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
