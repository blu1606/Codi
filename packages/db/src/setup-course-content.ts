import { readFile } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const sql = await readFile(new URL("../sql/course-content.sql", import.meta.url), "utf8");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Course content tables are ready. No course or lesson data was inserted.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
