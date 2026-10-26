import { access } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const slugs = [
  "frontend-react-nextjs",
  "backend-nodejs-typescript",
  "dsa-interview-prep",
  "ai-engineering",
  "react-native-expo",
];
for (const slug of slugs) {
  await access(new URL(`../../../apps/web/public/images/courses/${slug}.svg`, import.meta.url));
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const { rows } = await client.query<{ id: string; slug: string }>(
    "SELECT id, slug FROM public.courses WHERE slug = ANY($1::text[])", [slugs],
  );
  const ids = new Map(rows.map((row) => [row.slug, row.id]));
  const missing = slugs.filter((slug) => !ids.has(slug));
  if (missing.length) throw new Error(`Courses missing from database: ${missing.join(", ")}`);
  for (const slug of slugs) {
    await client.query(
      `INSERT INTO public.course_details (course_id, cover_image_url)
       VALUES ($1, $2)
       ON CONFLICT (course_id) DO UPDATE SET cover_image_url = EXCLUDED.cover_image_url`,
      [ids.get(slug), `/images/courses/${slug}.svg`],
    );
  }
  await client.query("COMMIT");
  console.log(`Saved cover image URLs for ${slugs.length} courses. Other course data was preserved.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
