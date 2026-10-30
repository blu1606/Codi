// handleSummary shared by every script: writes summary.json (machine-readable, read by
// scripts/make-badges.mjs) and prints a short text report for humans.
import { SUMMARY_DIR } from "./config.js";

const fmt = (value, digits = 0) => (typeof value === "number" ? value.toFixed(digits) : "n/a");

function line(label, value) {
  return `  ${label.padEnd(28)} ${value}`;
}

export function handleSummary(data) {
  const m = data.metrics;
  const read = m["http_req_duration{type:read}"]?.values;
  const write = m["http_req_duration{type:write}"]?.values;
  const failed = m.http_req_failed?.values?.rate;
  const checks = m.checks?.values?.rate;

  const thresholdLines = Object.entries(data.metrics)
    .filter(([, metric]) => metric.thresholds)
    .flatMap(([name, metric]) =>
      Object.entries(metric.thresholds).map(([expr, t]) => `  ${t.ok ? "PASS" : "FAIL"}  ${name} ${expr}`),
    );

  const text = [
    "",
    "k6 summary",
    line("reads p95 (ms)", fmt(read?.["p(95)"])),
    line("writes p95 (ms)", fmt(write?.["p(95)"])),
    line("failed requests", failed === undefined ? "n/a" : `${(failed * 100).toFixed(2)} %`),
    line("checks passed", checks === undefined ? "n/a" : `${(checks * 100).toFixed(2)} %`),
    line("max VUs", fmt(m.vus_max?.values?.max)),
    line("iterations", fmt(m.iterations?.values?.count)),
    "thresholds:",
    ...(thresholdLines.length ? thresholdLines : ["  (none)"]),
    "",
  ].join("\n");

  return {
    stdout: text,
    [`${SUMMARY_DIR}/summary.json`]: JSON.stringify(data, null, 2),
  };
}
