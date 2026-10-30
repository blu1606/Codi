// Appends a per-run Lighthouse table (performance score, LCP, TBT) to the GitHub step summary.
// Reads the lhr-*.json reports that `lhci autorun` leaves in .lighthouseci/.
import fs from "node:fs";
import path from "node:path";

const dir = ".lighthouseci";
const reports = fs.existsSync(dir)
  ? fs
      .readdirSync(dir)
      .filter((name) => /^lhr-.*\.json$/.test(name))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")))
  : [];

const lines = ["## Lighthouse (mobile, warn-only)", "", "| URL | Perf | LCP (ms) | TBT (ms) |", "| --- | --- | --- | --- |"];
for (const lhr of reports) {
  const perf = Math.round((lhr.categories.performance.score ?? 0) * 100);
  const lcp = Math.round(lhr.audits["largest-contentful-paint"].numericValue);
  const tbt = Math.round(lhr.audits["total-blocking-time"].numericValue);
  lines.push(`| ${lhr.requestedUrl} | ${perf} | ${lcp} | ${tbt} |`);
}
if (reports.length === 0) {
  lines.push("No Lighthouse reports were produced.");
  const listing = fs.existsSync(dir) ? fs.readdirSync(dir).join(", ") : "directory missing";
  console.error(`no lhr-*.json in ${path.resolve(dir)}: ${listing}`);
}

const body = `${lines.join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
else process.stdout.write(body);
