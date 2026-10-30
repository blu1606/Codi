// Writes shields.io endpoint JSON files (https://shields.io/badges/endpoint-badge) from CI outputs.
//
//   node scripts/make-badges.mjs k6 <k6-summary.json> <out-dir>
//   node scripts/make-badges.mjs lighthouse <lhci-output-dir> <out-dir>
//   node scripts/make-badges.mjs tests <junit.xml> <coverage-summary.json> <out-dir>
//
// Files land under <out-dir>/perf/ or <out-dir>/ci/ and are published by scripts/publish-badges.sh.

import fs from "node:fs";
import path from "node:path";

const [command, ...args] = process.argv.slice(2);

function badge(label, message, color) {
  return { schemaVersion: 1, label, message, color };
}

function write(outDir, relative, data) {
  const file = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
  console.log(`wrote ${file}: ${data.label} = ${data.message}`);
}

function k6Badges(summaryFile, outDir) {
  const { metrics = {} } = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  // Tagged sub-metrics are present in the summary because the suite sets thresholds on them.
  const p95 = metrics["http_req_duration{type:read}"]?.values?.["p(95)"];
  const failRate = metrics.http_req_failed?.values?.rate;
  const maxVus = metrics.vus_max?.values?.max;

  if (typeof p95 === "number") {
    const color = p95 < 500 ? "green" : p95 < 1000 ? "yellow" : "red";
    write(outDir, "perf/k6-p95.json", badge("k6 p95 (reads)", `${Math.round(p95)} ms`, color));
  } else {
    write(outDir, "perf/k6-p95.json", badge("k6 p95 (reads)", "no data", "lightgrey"));
  }

  if (typeof failRate === "number") {
    const pct = (failRate * 100).toFixed(2);
    const color = failRate < 0.01 ? "green" : failRate < 0.05 ? "yellow" : "red";
    write(outDir, "perf/k6-errors.json", badge("k6 errors", `${pct} %`, color));
  } else {
    write(outDir, "perf/k6-errors.json", badge("k6 errors", "no data", "lightgrey"));
  }

  write(
    outDir,
    "perf/k6-max-vus.json",
    badge("k6 max VUs", typeof maxVus === "number" ? String(maxVus) : "no data", typeof maxVus === "number" ? "blue" : "lightgrey"),
  );
}

function lighthouseBadge(lhciDir, outDir) {
  // Each audited run leaves an lhr-*.json report in the LHCI output directory.
  const runs = fs
    .readdirSync(lhciDir)
    .filter((name) => /^lhr-.*\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(lhciDir, name), "utf8")))
    .filter((lhr) => {
      try {
        return new URL(lhr.requestedUrl ?? lhr.finalUrl).pathname === "/courses";
      } catch {
        return false;
      }
    })
    .map((lhr) => lhr.categories?.performance?.score)
    .filter((score) => typeof score === "number")
    .sort((a, b) => a - b);

  if (runs.length === 0) {
    write(outDir, "perf/lighthouse-performance.json", badge("Lighthouse performance (/courses)", "no data", "lightgrey"));
    return;
  }
  const mid = Math.floor(runs.length / 2);
  const median = runs.length % 2 ? runs[mid] : (runs[mid - 1] + runs[mid]) / 2;
  const score = Math.round(median * 100);
  const color = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
  write(outDir, "perf/lighthouse-performance.json", badge("Lighthouse performance (/courses)", String(score), color));
}

function testBadges(junitFile, coverageFile, outDir) {
  const junit = fs.readFileSync(junitFile, "utf8");
  const root = junit.match(/<testsuites\b[^>]*>/);
  const tests = root && root[0].match(/\btests="(\d+)"/);
  if (!tests) throw new Error(`no tests count in ${junitFile}`);
  write(outDir, "ci/tests.json", badge("unit tests", `${tests[1]} passed`, "success"));

  const { total } = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
  const pct = total?.lines?.pct;
  if (typeof pct !== "number") throw new Error(`no line coverage in ${coverageFile}`);
  const color = pct >= 80 ? "brightgreen" : pct >= 60 ? "yellow" : "red";
  write(outDir, "ci/coverage.json", badge("coverage", `${pct.toFixed(1)} %`, color));
}

try {
  if (command === "k6" && args.length === 2) k6Badges(args[0], args[1]);
  else if (command === "lighthouse" && args.length === 2) lighthouseBadge(args[0], args[1]);
  else if (command === "tests" && args.length === 3) testBadges(args[0], args[1], args[2]);
  else {
    console.error("usage: see header of scripts/make-badges.mjs");
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
