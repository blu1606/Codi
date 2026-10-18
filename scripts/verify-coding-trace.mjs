import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

const tracePath = path.resolve(
  "apps/web/.next/server/app/api/learn/[courseId]/lessons/[lessonId]/assessments/[assessmentId]/coding/route.js.nft.json",
);
const trace = JSON.parse(await readFile(tracePath, "utf8"));
const files = trace.files.map((file) =>
  path.resolve(path.dirname(tracePath), file),
);
const normalized = files.map((file) => file.replaceAll("\\", "/"));
for (const required of [
  /\/coding-runner\/index\.mjs$/,
  /\/coding-runner\/worker\.mjs$/,
  /\/quickjs-emscripten\/dist\/index\.js$/,
  /\/quickjs-emscripten-core\/dist\/index\.js$/,
  /\/quickjs-wasmfile-release-sync\/dist\/.*\.wasm$/,
]) {
  const index = normalized.findIndex((file) => required.test(file));
  assert.ok(index >= 0, `Missing production runtime file: ${required}`);
  await access(files[index]);
}
console.log(
  "Coding production trace contains worker, QuickJS modules and release-sync WASM.",
);
