import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// Some backend tests are written for node:test and run with `tsx --test` (scripts/run-node-tests.mjs); Vitest would
// report them as files without a suite, so they are left out here.
function nodeTestFiles() {
  return (readdirSync(path.join(root, "backend"), { recursive: true }) as string[])
    .filter((file) => /\.test\.ts$/.test(file) && !file.includes("node_modules"))
    .map((file) => path.posix.join("backend", file.split(path.sep).join("/")))
    .filter((file) => /from ["']node:test["']/.test(readFileSync(path.join(root, file), "utf8")));
}

// Unit tests for the backend and its vendored packages (auth, ownership, upload tickets).
export default defineConfig({
  test: {
    environment: "node",
    include: ["backend/src/**/*.test.ts", "backend/packages/*/src/**/*.test.ts", "frontend/src/features/shell/notification-link.test.js", "frontend/src/features/classroom/checkpoint-trigger.test.js"],
    exclude: ["**/node_modules/**", ...nodeTestFiles()],
    alias: { "@/": path.join(root, "backend/src") + "/" },
  },
});
