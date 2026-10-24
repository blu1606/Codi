import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = async (relative) =>
  JSON.parse(
    (await readFile(resolve(root, relative), "utf8")).replace(/^\uFEFF/, ""),
  );
const manifest = await json("artifact-manifest.json");
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(resolve(root, artifact.path));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    artifact.sha256,
    artifact.path,
  );
}
const execution = await json("current/execution-manifest.json");
for (const source of execution.sources) {
  const bytes = await readFile(resolve(root, "current/source", source.path));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    source.sha256,
    source.path,
  );
}
const report = await json("current/browser-report.json");
assert.equal(report.passed, true);
assert.deepEqual(report.errors, []);
assert.equal((await json("current/build.log.json")).exitCode, 0);
assert.equal((await json("current/browser-cleanup.log.json")).exitCode, 0);
const events = (
  await readFile(resolve(root, "current/runtime-events.ndjson"), "utf8")
)
  .trim()
  .split("\n")
  .map(JSON.parse);
events.forEach((event, i) => assert.equal(event.sequence, i + 1));
assert.equal(events[0].event, "source-frozen");
assert.ok(
  Date.parse(execution.capturedBeforeFixtureAt) <=
    Date.parse(events.find((e) => e.event === "fixture-created").at),
);
assert.equal(events.at(-1).event, "cleanup-verified");
const requests = new Map(
  events
    .filter((e) => e.event === "activity-request")
    .map((e) => [e.data.requestId, e]),
);
for (const event of events.filter((e) => e.event === "activity-response")) {
  const request = requests.get(event.data.requestId);
  assert.ok(request && request.sequence < event.sequence);
  assert.deepEqual(event.data.request, request.data.body);
  assert.equal(event.data.status, 200);
}
const tickStages = [
  ...new Set(
    events.filter((e) => e.event === "heartbeat-assertion").map((e) => e.stage),
  ),
];
assert.equal(tickStages.length, 2);
for (const stage of tickStages) {
  const scoped = events.filter((e) => e.stage === stage);
  assert.equal(
    scoped.filter(
      (e) =>
        e.event === "focus-assertion" && !e.data.aFocused && e.data.bFocused,
    ).length,
    1,
  );
  const firstClock = scoped.find((e) => e.event === "database-clock").data;
  const baseline = scoped.find((e) => e.event === "database-seconds").data
    .seconds;
  const rejected = scoped.filter(
    (e) =>
      e.event === "activity-response" &&
      ["start", "stop"].includes(e.data.request.action) &&
      e.data.body.recorded === false,
  );
  assert.equal(rejected.length, 2);
  const ticks = scoped.filter((e) => e.event === "heartbeat-assertion");
  assert.equal(ticks.length, 2);
  for (const tick of ticks) {
    const preceding = scoped.filter((e) => e.sequence < tick.sequence);
    const clock = preceding
      .filter((e) => e.event === "database-clock")
      .at(-1).data;
    const seconds = preceding
      .filter((e) => e.event === "database-seconds")
      .at(-1).data.seconds;
    assert.equal(clock.trackerId, firstClock.trackerId);
    assert.equal(clock.lessonId, firstClock.lessonId);
    assert.equal(
      seconds - baseline,
      Math.floor(Date.parse(clock.lastSeenAt) / 1000) -
        Math.floor(Date.parse(firstClock.lastSeenAt) / 1000),
    );
    assert.equal(tick.data.totalSinceStart, seconds - baseline);
  }
}
const reloads = events.filter((e) => e.event === "reload-heartbeat-assertion");
assert.equal(reloads.length, 4);
for (const reload of reloads) {
  const scoped = events.filter(
    (e) => e.stage === reload.stage && e.sequence < reload.sequence,
  );
  const old = scoped.find((e) => e.event === "reload-requested").data.oldOwner;
  assert.notEqual(reload.data.newOwner, old);
  const started = scoped.find(
    (e) =>
      e.event === "activity-response" &&
      e.data.request.action === "start" &&
      e.data.request.trackerId === reload.data.newOwner,
  );
  assert.equal(started.data.body.recorded, true);
  const clocks = scoped
    .filter((e) => e.event === "database-clock")
    .slice(-2)
    .map((e) => e.data);
  const seconds = scoped
    .filter((e) => e.event === "database-seconds")
    .slice(-2)
    .map((e) => e.data.seconds);
  assert.equal(clocks[0].trackerId, reload.data.newOwner);
  assert.equal(clocks[1].trackerId, reload.data.newOwner);
  assert.equal(
    seconds[1] - seconds[0],
    Math.floor(Date.parse(clocks[1].lastSeenAt) / 1000) -
      Math.floor(Date.parse(clocks[0].lastSeenAt) / 1000),
  );
  assert.equal(reload.data.addedSeconds, seconds[1] - seconds[0]);
  assert.ok(
    reload.data.intervalMs >= 20_000 && reload.data.intervalMs <= 45_000,
  );
  assert.ok(
    scoped.some(
      (e) =>
        e.event === "activity-response" &&
        e.data.request.action === "heartbeat" &&
        e.data.body.recorded === true,
    ),
  );
}
assert.equal(
  report.visual.filter(
    (v) => v.route === "lesson" && v.reloaded && v.heartbeatRecorded,
  ).length,
  4,
);
assert.equal(report.accounting.length, 2);
console.log(
  `Verified ${manifest.artifacts.length} artifact hashes, ${execution.sources.length} frozen sources, ${events.length} real events, two two-tab cases and four reloads.`,
);
