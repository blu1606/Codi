// Provisions the Codi folder, Discord contact point, notification policy, alert rules and dashboards in the
// Grafana Cloud stack. Idempotent: every object has a fixed uid and is replaced on each run.
//   node --env-file=deploy/monitoring/.env deploy/monitoring/provision-grafana.mjs
// Needs GRAFANA_STACK_URL, GRAFANA_SA_TOKEN (service account, role Admin) and DISCORD_WEBHOOK_URL.
const { GRAFANA_STACK_URL: base, GRAFANA_SA_TOKEN: token, DISCORD_WEBHOOK_URL: discord } = process.env;
if (!base || !token || !discord) throw new Error("GRAFANA_STACK_URL, GRAFANA_SA_TOKEN and DISCORD_WEBHOOK_URL are required");

const PROM = "grafanacloud-prom";
const LOKI = "grafanacloud-logs";
const FOLDER = "codi";

async function api(method, path, body, okStatuses = []) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Disable-Provenance": "true" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !okStatuses.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

// ---------- folder ----------
if (!(await api("GET", `/api/folders/${FOLDER}`, undefined, [404]))?.uid) {
  await api("POST", "/api/folders", { uid: FOLDER, title: "Codi" });
}

// ---------- Discord contact point + default policy ----------
const contactPoint = {
  uid: "codi-discord",
  name: "Codi Discord",
  type: "discord",
  settings: { url: discord, use_discord_username: false },
  disableResolveMessage: false,
};
const existing = (await api("GET", "/api/v1/provisioning/contact-points")).find((c) => c.uid === contactPoint.uid);
if (existing) await api("PUT", `/api/v1/provisioning/contact-points/${contactPoint.uid}`, contactPoint);
else await api("POST", "/api/v1/provisioning/contact-points", contactPoint);

await api("PUT", "/api/v1/provisioning/policies", {
  receiver: contactPoint.name,
  group_by: ["grafana_folder", "alertname"],
  group_wait: "30s",
  group_interval: "5m",
  repeat_interval: "4h",
});

// ---------- alert rules ----------
// Each rule is an instant PromQL query compared against a threshold. "noData" says what an empty result means:
// for absent_over_time rules empty is the healthy case; for the rest, a dead agent is caught by "Metrics stopped".
function rule(uid, title, expr, op, value, forDuration, summary, { noData = "OK", severity = "critical" } = {}) {
  return {
    uid,
    title,
    folderUID: FOLDER,
    ruleGroup: "codi",
    condition: "C",
    for: forDuration,
    noDataState: noData,
    execErrState: "Error",
    labels: { severity },
    annotations: { summary },
    data: [
      { refId: "A", relativeTimeRange: { from: 600, to: 0 }, datasourceUid: PROM, model: { refId: "A", expr, instant: true } },
      {
        refId: "C",
        datasourceUid: "__expr__",
        model: { refId: "C", type: "threshold", expression: "A", conditions: [{ evaluator: { type: op, params: [value] } }] },
      },
    ],
  };
}

const rules = [
  rule("codi-site-down", "Site down", 'min(probe_success{job="integrations/blackbox/codi"})', "lt", 1, "3m",
    "https://codi.hoangblue.dev/api/health has failed for 3 minutes (TLS, Caddy, app or database)."),
  rule("codi-app-container-missing", "App container not running",
    'absent_over_time(container_last_seen{name="codi-rebuild-app"}[3m])', "gt", 0, "0s",
    "Container codi-rebuild-app has not been seen for 3 minutes."),
  rule("codi-postgres-down", "Postgres down", 'min(pg_up{job="integrations/postgres"})', "lt", 1, "2m",
    "The Postgres exporter cannot reach codi-rebuild-db."),
  rule("codi-disk-full", "Disk above 85%",
    '100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})', "gt", 85, "10m",
    "Root filesystem is above 85%. Prune old images or backups before Postgres runs out of space.", { severity: "warning" }),
  rule("codi-memory-low", "Memory available below 10%",
    "100 * node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes", "lt", 10, "5m",
    "Less than 10% of RAM is available on the VPS.", { severity: "warning" }),
  rule("codi-cert-expiry", "TLS certificate expires within 14 days",
    'min(probe_ssl_earliest_cert_expiry{job="integrations/blackbox/codi"} - time()) / 86400', "lt", 14, "1h",
    "Caddy has not renewed the certificate for codi.hoangblue.dev; it expires in under 14 days.", { severity: "warning" }),
  rule("codi-metrics-stopped", "Metrics stopped arriving",
    'absent_over_time(node_memory_MemTotal_bytes{host="codi-vps"}[5m])', "gt", 0, "0s",
    "No metrics from the VPS for 5 minutes: the VPS or the Alloy agent is down."),
];

await api("PUT", `/api/v1/provisioning/folder/${FOLDER}/rule-groups/codi`, { title: "codi", folderUid: FOLDER, interval: 60, rules });

// ---------- dashboards ----------
async function saveDashboard(dashboard) {
  await api("POST", "/api/dashboards/db", { dashboard, folderUid: FOLDER, overwrite: true });
}

// Community dashboards from grafana.com, with their datasource input bound to the stack's Prometheus.
async function importCommunity(id, uid) {
  const res = await fetch(`https://grafana.com/api/dashboards/${id}/revisions/latest/download`);
  if (!res.ok) throw new Error(`download dashboard ${id} -> ${res.status}`);
  const text = (await res.text()).replaceAll("${DS_PROMETHEUS}", PROM).replaceAll("${DS_PROM}", PROM);
  const dashboard = JSON.parse(text);
  delete dashboard.__inputs;
  delete dashboard.__requires;
  delete dashboard.id;
  dashboard.uid = uid;
  await saveDashboard(dashboard);
}
await importCommunity(1860, "codi-node"); // Node Exporter Full
await importCommunity(9628, "codi-postgres"); // PostgreSQL Database

const prom = { type: "prometheus", uid: PROM };
const loki = { type: "loki", uid: LOKI };
let panelId = 0;
const stat = (title, expr, unit, x, y, thresholds, extra = {}) => ({
  id: ++panelId, type: "stat", title, datasource: prom, gridPos: { h: 4, w: 4, x, y },
  targets: [{ refId: "A", datasource: prom, expr, instant: true }],
  fieldConfig: { defaults: { unit, thresholds: { mode: "absolute", steps: thresholds }, ...extra }, overrides: [] },
  options: { colorMode: "background", reduceOptions: { calcs: ["lastNotNull"] }, graphMode: "none" },
});
const series = (title, targets, unit, x, y, w = 12) => ({
  id: ++panelId, type: "timeseries", title, datasource: prom, gridPos: { h: 8, w, x, y },
  targets: targets.map(([expr, legend], i) => ({ refId: String.fromCharCode(65 + i), datasource: prom, expr, legendFormat: legend })),
  fieldConfig: { defaults: { unit }, overrides: [] },
});
const green = (v = null) => ({ color: "green", value: v });
const red = (v = null) => ({ color: "red", value: v });
const orange = (v) => ({ color: "orange", value: v });

await saveDashboard({
  uid: "codi-overview",
  title: "Codi overview",
  tags: ["codi"],
  timezone: "browser",
  refresh: "1m",
  time: { from: "now-6h", to: "now" },
  schemaVersion: 39,
  panels: [
    stat("Site", 'min(probe_success{job="integrations/blackbox/codi"})', "none", 0, 0, [red(), green(1)],
      { mappings: [{ type: "value", options: { 0: { text: "DOWN" }, 1: { text: "UP" } } }] }),
    stat("Health latency", 'max(probe_duration_seconds{job="integrations/blackbox/codi"})', "s", 4, 0, [green(), orange(1), red(3)]),
    stat("TLS cert expires in", 'min(probe_ssl_earliest_cert_expiry{job="integrations/blackbox/codi"} - time())', "s", 8, 0,
      [red(), orange(14 * 86400), green(30 * 86400)]),
    stat("Disk used", '100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
      "percent", 12, 0, [green(), orange(70), red(85)]),
    stat("RAM available", "100 * node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes", "percent", 16, 0,
      [red(), orange(10), green(25)]),
    stat("Database size", 'pg_database_size_bytes{datname="codi"}', "bytes", 20, 0, [green()]),
    series("Host CPU", [['100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', "CPU %"]], "percent", 0, 4),
    series("Container memory", [['container_memory_working_set_bytes{name=~"codi-.+"}', "{{name}}"]], "bytes", 12, 4),
    series("Container CPU (cores)", [['rate(container_cpu_usage_seconds_total{name=~"codi-.+"}[5m])', "{{name}}"]], "short", 0, 12),
    series("Postgres connections", [['sum by (state) (pg_stat_activity_count{datname="codi"})', "{{state}}"]], "short", 12, 12),
    {
      id: ++panelId, type: "logs", title: "App errors and warnings", datasource: loki, gridPos: { h: 10, w: 24, x: 0, y: 20 },
      targets: [{ refId: "A", datasource: loki, expr: '{container="codi-rebuild-app"} |~ "(?i)(error|warn|fail|exception)"' }],
      options: { showTime: true, wrapLogMessage: true, sortOrder: "Descending" },
    },
    {
      id: ++panelId, type: "logs", title: "Caddy", datasource: loki, gridPos: { h: 8, w: 24, x: 0, y: 30 },
      targets: [{ refId: "A", datasource: loki, expr: '{job="caddy"}' }],
      options: { showTime: true, wrapLogMessage: true, sortOrder: "Descending" },
    },
  ],
});

console.log(`provisioned: folder, contact point, policy, ${rules.length} alert rules, 3 dashboards -> ${base}/dashboards/f/${FOLDER}`);
