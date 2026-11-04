#!/usr/bin/env node
// Runs the backend tests written for node:test (the ones vitest.config.ts leaves out) with `tsx --test`, from the
// backend folder so its tsconfig paths (@/…) resolve. Exits non-zero when any fails.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "backend");
const files = readdirSync(backend, { recursive: true })
  .filter((file) => /\.test\.ts$/.test(file) && !file.includes("node_modules"))
  .filter((file) => /from ["']node:test["']/.test(readFileSync(path.join(backend, file), "utf8")));

if (files.length === 0) {
  console.log("no node:test files");
  process.exit(0);
}
const result = spawnSync("npx", ["tsx", "--test", ...files], { cwd: backend, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
