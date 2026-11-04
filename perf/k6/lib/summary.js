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

  // Per-endpoint latency (trends kept by the always-true thresholds in config.js), slowest first.
  const endpointLines = Object.entries(m)
    .filter(([key]) => key.startsWith("http_req_duration{name:"))
    .map(([key, metric]) => [key.slice("http_req_duration{name:".length, -1), metric.values])
    // Endpoints the script never called keep an all-zero trend.
    .filter(([, v]) => typeof v?.["p(95)"] === "number" && v.max > 0)
    .sort((a, b) => b[1]["p(95)"] - a[1]["p(95)"])
    .map(([name, v]) => `  ${fmt(v["p(95)"]).padStart(6)} ms p95  ${fmt(v.med).padStart(5)} ms med  ${name}`);

  const thresholdLines = Object.entries(data.metrics)
    .filter(([name, metric]) => metric.thresholds && !name.startsWith("http_req_duration{name:"))
    .flatMap(([name, metric]) =>
      Object.entries(metric.thresholds).map(([expr, t]) => `  ${t.ok ? "PASS" : "FAIL"}  ${name} ${expr}`),
    );

  // Checks that failed at least once, with counts, so a red run says which step broke.
  const collectChecks = (group) => [...(group?.checks ?? []), ...(group?.groups ?? []).flatMap(collectChecks)];
  const failedChecks = collectChecks(data.root_group)
    .filter((c) => c.fails > 0)
    .map((c) => `  ${c.name}: ${c.fails} failed, ${c.passes} passed`);

  const text = [
    "",
    "k6 summary",
    line("reads p95 (ms)", fmt(read?.["p(95)"])),
    line("writes p95 (ms)", fmt(write?.["p(95)"])),
    line("failed requests", failed === undefined ? "n/a" : `${(failed * 100).toFixed(2)} %`),
    line("checks passed", checks === undefined ? "n/a" : `${(checks * 100).toFixed(2)} %`),
    line("max VUs", fmt(m.vus_max?.values?.max)),
    line("iterations", fmt(m.iterations?.values?.count)),
    ...(endpointLines.length ? ["endpoints:", ...endpointLines] : []),
    "thresholds:",
    ...(thresholdLines.length ? thresholdLines : ["  (none)"]),
    ...(failedChecks.length ? ["failed checks:", ...failedChecks] : []),
    "",
  ].join("\n");

  return {
    stdout: text,
    [`${SUMMARY_DIR}/summary.json`]: JSON.stringify(data, null, 2),
  };
}
