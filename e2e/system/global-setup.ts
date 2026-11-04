import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ACCOUNTS_CSV, RESULTS_DIR } from "./support";

// Recreates six clean learners (loadtest+001..006@codi.test, enrolled in "JavaScript nền tảng") with fresh passwords.
// The seeding script refuses any database that is not local.
export default function globalSetup() {
  const base = process.env.E2E_BASE_URL || "http://localhost:3001";
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error(`System tests write data; refusing ${base}`);
  mkdirSync(path.join(RESULTS_DIR, "evidence"), { recursive: true });
  const run = (...args: string[]) =>
    execFileSync("npm", ["run", "seed:loadtest", "-w", "backend", "--", ...args], { stdio: "inherit", shell: true });
  run("--cleanup");
  run("--count", "6", "--course", "javascript-nen-tang", "--out", ACCOUNTS_CSV);
}
