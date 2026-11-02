// Applies Codi's Drizzle migrations (packages/db/src/migrations) to DATABASE_URL. Safe to re-run.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@codi-1/db";
import { ENV } from "../src/env";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/db/src/migrations");

export async function runMigrations(databaseUrl = ENV.DATABASE_URL) {
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => console.log(`Migrations applied to ${new URL(ENV.DATABASE_URL).pathname.slice(1)}.`))
    .catch((error) => {
      console.error("Migration failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
