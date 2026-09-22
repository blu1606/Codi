import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  // Supabase ships its own `auth`, `storage`, `extensions`, and `vault` schemas alongside
  // `public`. Without this, drizzle-kit introspects all of them and offers to drop/alter
  // Supabase's own platform schemas because they're not declared in our schema files —
  // scoping to `public` is what makes push/pull safe to run against a Supabase database.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
