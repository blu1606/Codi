#!/usr/bin/env node
// Copies one capacity run from perf/k6/results (gitignored) into perf/runs/<name>/ so it can be committed:
//   capacity.json, server-stats.csv, summary.json (session cookies from setup removed), the k6 log without its
//   progress-bar lines, and the raw per-request CSV when k6 wrote one.
//   node scripts/perf-archive.mjs <results-dir> perf/runs/<date>-<target>/<run>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("usage: node scripts/perf-archive.mjs <results-dir> <destination>");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

for (const file of ["capacity.json", "server-stats.csv", "capacity-raw.csv.gz"]) {
  if (existsSync(path.join(src, file))) copyFileSync(path.join(src, file), path.join(dest, file));
}

const summary = JSON.parse(readFileSync(path.join(src, "summary.json"), "utf8"));
// setup() returns the learners' session cookies; they must never be committed.
if (summary.setup_data) summary.setup_data = { startedAt: summary.setup_data.startedAt };
writeFileSync(path.join(dest, "summary.json"), JSON.stringify(summary, null, 2));

const log = readFileSync(path.join(src, "capacity-run.log"), "utf8")
  .split(/\r?\n|\r/)
  .filter((line) => line.trim() && !/^(running \(|browse +\[|learn +\[|Run +\[)/.test(line.trim()))
  .join("\n");
writeFileSync(path.join(dest, "k6-output.log"), `${log}\n`);
console.log(`archived ${src} -> ${dest}`);
