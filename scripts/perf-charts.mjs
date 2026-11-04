#!/usr/bin/env node
// Draws the README performance charts from one or more archived capacity runs (scripts/perf-archive.mjs), each a
// folder with capacity.json and server-stats.csv:
//   node scripts/perf-charts.mjs <run-dir> [<run-dir> ...]
// For every held load level it takes k6's latency and the server's average CPU over the same window, then writes
//   docs/assets/perf-latency.svg   response time (p50, p95) against offered load, with the 500 ms SLO
//   docs/assets/perf-cpu.svg       app and database CPU against offered load
//   <first run's parent>/levels.json   the merged numbers behind both charts
// A level is left out when anything other than the app and database containers ran on the server during it (a
// deploy, a migration), and a level measured by an earlier run is not replaced by a later one.
// Static SVG so GitHub renders them; colours follow the viewer's light/dark setting.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const runs = process.argv.slice(2);
if (runs.length === 0) {
  console.error("usage: node scripts/perf-charts.mjs <run-dir> [<run-dir> ...]");
  process.exit(1);
}
const out = "docs/assets";
mkdirSync(out, { recursive: true });
const SLO_MS = 500;
const APP = "codi-rebuild-app";
const DB = "codi-rebuild-db";

// 1. Merge the runs into one row per load level.
const levels = new Map();
const skipped = [];
for (const dir of runs) {
  const capacity = JSON.parse(readFileSync(path.join(dir, "capacity.json"), "utf8"));
  const stats = readFileSync(path.join(dir, "server-stats.csv"), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","))
    .map(([t, name, cpu, mem]) => ({ t: +t, name, cpu: +cpu, mem: +mem }));
  let start = capacity.loadStartedAt / 1000;
  const windows = new Map();
  for (const p of capacity.phases) {
    windows.set(p.label, [start, start + p.seconds]);
    start += p.seconds;
  }
  for (const row of capacity.rows) {
    const [from, to] = windows.get(row.phase);
    const inside = stats.filter((s) => s.t >= from && s.t < to);
    const avg = (name, key) => {
      const v = inside.filter((s) => s.name === name).map((s) => s[key]);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const run = path.basename(dir);
    if (inside.some((s) => s.name !== APP && s.name !== DB)) {
      skipped.push(`${run} ${row.phase}: another container ran on the server`);
      continue;
    }
    if (row.seconds !== undefined && row.seconds < 50) {
      skipped.push(`${run} ${row.phase}: ran only ${Math.round(row.seconds)} s`);
      continue;
    }
    if (levels.has(row.offeredRps)) continue;
    levels.set(row.offeredRps, {
      run,
      offeredRps: row.offeredRps,
      achievedRps: row.achievedRps,
      p50: row.p50,
      p95: row.p95,
      p99: row.p99,
      failedRate: row.failedRate ?? 0,
      appCpu: avg(APP, "cpu"),
      dbCpu: avg(DB, "cpu"),
      appMemMiB: avg(APP, "mem"),
    });
  }
}
const rows = [...levels.values()].sort((a, b) => a.offeredRps - b.offeredRps);
const capacityRow = rows.filter((r) => r.p95 < SLO_MS && r.failedRate < 0.01).at(-1);
const summaryPath = path.join(path.dirname(runs[0]), "levels.json");
writeFileSync(summaryPath, JSON.stringify({ sloP95Ms: SLO_MS, capacityRps: capacityRow?.offeredRps ?? null, skipped, rows }, null, 2));

// 2. Drawing.
const W = 720;
const H = 380;
const M = { top: 84, right: 92, bottom: 52, left: 64 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const style = `<style>
  svg { --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#8a8984; --grid:#e6e5e1; --s1:#2a78d6; --s2:#eb6834; }
  @media (prefers-color-scheme: dark) {
    svg { --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --muted:#8f8e88; --grid:#33322f; --s1:#3987e5; --s2:#d95926; }
  }
  text { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: var(--ink2); font-size: 12px; }
  .title { fill: var(--ink); font-size: 15px; font-weight: 600; }
  .axis { fill: var(--muted); font-size: 11px; }
  .label { fill: var(--ink); font-size: 12px; font-weight: 600; }
  .grid { stroke: var(--grid); stroke-width: 1; }
</style>`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const minX = rows[0].offeredRps;
const maxX = rows.at(-1).offeredRps;
const x = (v) => M.left + 16 + ((v - minX) / (maxX - minX || 1)) * (PW - 32);
const xTicks = rows.map((r) => ({ v: r.offeredRps, label: r.offeredRps }));

function legend(items, xx, yy) {
  let cursor = xx;
  return items
    .map(([label, color, dash]) => {
      const item =
        `<line x1="${cursor}" x2="${cursor + 18}" y1="${yy}" y2="${yy}" stroke="var(${color})" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` +
        `<text x="${cursor + 24}" y="${yy + 4}">${esc(label)}</text>`;
      cursor += 24 + label.length * 6.4 + 22;
      return item;
    })
    .join("");
}
function frame({ title, subtitle, legendItems, yTicks, y, xLabel, yLabel, body }) {
  const grid = yTicks
    .map(
      (t) =>
        `<line class="grid" x1="${M.left}" x2="${M.left + PW}" y1="${y(t.v)}" y2="${y(t.v)}"/>` +
        `<text class="axis" x="${M.left - 8}" y="${y(t.v) + 4}" text-anchor="end">${esc(t.label)}</text>`,
    )
    .join("");
  const xs = xTicks.map((t) => `<text class="axis" x="${x(t.v)}" y="${M.top + PH + 18}" text-anchor="middle">${t.label}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">
${style}
<rect width="${W}" height="${H}" rx="8" fill="var(--surface)"/>
<text class="title" x="${M.left}" y="26">${esc(title)}</text>
<text x="${M.left}" y="45">${esc(subtitle)}</text>
${legend(legendItems, M.left, 68)}
${grid}${xs}
<text class="axis" x="${M.left + PW / 2}" y="${H - 10}" text-anchor="middle">${esc(xLabel)}</text>
<text class="axis" transform="translate(16 ${M.top + PH / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
${body}
</svg>
`;
}
const pathOf = (pts) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
const series = (pts, color) =>
  `<path d="${pathOf(pts)}" fill="none" stroke="var(${color})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
  pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="4" fill="var(${color})" stroke="var(--surface)" stroke-width="2"/>`).join("");
const dashed = (yy) => `<line x1="${M.left}" x2="${M.left + PW}" y1="${yy}" y2="${yy}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
const capacityMarker = capacityRow
  ? `<line x1="${x(capacityRow.offeredRps)}" x2="${x(capacityRow.offeredRps)}" y1="${M.top}" y2="${M.top + PH}" stroke="var(--muted)" stroke-width="1"/>` +
    `<text class="label" x="${x(capacityRow.offeredRps) - 6}" y="${M.top + 14}" text-anchor="end">đạt SLO tới ${capacityRow.offeredRps} req/s</text>`
  : "";
const subtitle = "Server dev 2 vCPU / 4 GB · 70% khách xem, 30% học viên đăng nhập · đo từ Việt Nam, gồm ~75 ms mạng";

// Chart 1: latency, log scale from 50 ms to 10 s.
{
  const lo = Math.log10(50);
  const hi = Math.log10(Math.max(10000, ...rows.map((r) => r.p95)));
  const y = (v) => M.top + PH - ((Math.log10(Math.max(v, 50)) - lo) / (hi - lo)) * PH;
  const p50 = rows.map((r) => [x(r.offeredRps), y(r.p50)]);
  const p95 = rows.map((r) => [x(r.offeredRps), y(r.p95)]);
  const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
  const last = rows.at(-1);
  const body = [
    dashed(y(SLO_MS)),
    `<text class="axis" x="${M.left + PW + 6}" y="${y(SLO_MS) + 4}">SLO 500 ms</text>`,
    capacityMarker,
    series(p50, "--s1"),
    series(p95, "--s2"),
    `<text class="label" x="${p95.at(-1)[0] + 8}" y="${p95.at(-1)[1] + 4}">${fmt(last.p95)}</text>`,
    `<text class="label" x="${p50.at(-1)[0] + 8}" y="${p50.at(-1)[1] + 4}">${fmt(last.p50)}</text>`,
  ].join("\n");
  writeFileSync(
    path.join(out, "perf-latency.svg"),
    frame({
      title: "Thời gian phản hồi theo tải",
      subtitle,
      legendItems: [["p50 (trung vị)", "--s1"], ["p95", "--s2"], ["SLO p95", "--muted", "5 4"]],
      yTicks: [50, 100, 200, 500, 1000, 2000, 5000, 10000].map((v) => ({ v, label: fmt(v) })),
      y,
      xLabel: "tải gửi tới (request mỗi giây) · trục dọc thang log",
      yLabel: "thời gian phản hồi",
      body,
    }),
  );
}

// Chart 2: CPU per level, 100% = one core.
{
  const y = (v) => M.top + PH - (Math.min(v, 200) / 200) * PH;
  const app = rows.map((r) => [x(r.offeredRps), y(r.appCpu)]);
  const db = rows.map((r) => [x(r.offeredRps), y(r.dbCpu)]);
  const body = [
    dashed(y(100)),
    `<text class="axis" x="${M.left + 6}" y="${y(100) - 6}">1 core (app Node.js chỉ dùng được 1 luồng)</text>`,
    dashed(y(200)),
    `<text class="axis" x="${M.left + 6}" y="${y(200) + 15}">2 core (cả VPS)</text>`,
    capacityMarker,
    series(app, "--s1"),
    series(db, "--s2"),
    `<text class="label" x="${app.at(-1)[0] + 8}" y="${Math.min(app.at(-1)[1], db.at(-1)[1]) - 6}">app ${Math.round(rows.at(-1).appCpu)}%</text>`,
    `<text class="label" x="${db.at(-1)[0] + 8}" y="${Math.max(app.at(-1)[1], db.at(-1)[1]) + 16}">DB ${Math.round(rows.at(-1).dbCpu)}%</text>`,
  ].join("\n");
  writeFileSync(
    path.join(out, "perf-cpu.svg"),
    frame({
      title: "CPU của server theo tải",
      subtitle,
      legendItems: [["app Node.js (1 luồng)", "--s1"], ["PostgreSQL", "--s2"]],
      yTicks: [0, 50, 100, 150, 200].map((v) => ({ v, label: `${v}%` })),
      y,
      xLabel: "tải gửi tới (request mỗi giây)",
      yLabel: "CPU trung bình (% của một core)",
      body,
    }),
  );
}
console.log(`capacity (p95 < ${SLO_MS} ms, < 1% errors): ${capacityRow?.offeredRps ?? "none"} req/s`);
if (skipped.length) console.log(`left out:\n  ${skipped.join("\n  ")}`);
console.log(`wrote ${out}/perf-latency.svg, ${out}/perf-cpu.svg and ${summaryPath}`);
