import { defineConfig } from "drizzle-kit";

// Codi's config without varlock: DATABASE_URL comes from backend/.env (or the local default).
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://codi:codi@localhost:5544/codi",
  },
});
