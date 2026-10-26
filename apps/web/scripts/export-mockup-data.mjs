// Snapshot the HTML prototype data (docs/mockup/js/data.js) into JSON for seed-mockup.ts.
// Runs data.js in an isolated vm context with a stubbed window and a seeded Math.random so the
// output is byte-identical between runs. Platform analytics series are not seedable and dropped.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../docs/mockup/js/data.js");
const target = resolve(here, "data/mockup-seed.json");

// mulberry32: tiny deterministic PRNG, enough to pin any random values in the prototype.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sandboxMath = Object.create(Math);
sandboxMath.random = seededRandom(20261019);
const window = {};
window.window = window;
const context = vm.createContext({ window, console, Math: sandboxMath, Date, JSON });
vm.runInContext(readFileSync(source, "utf8"), context, { filename: "data.js" });

const data = window.CodiData;
if (!data || typeof data !== "object") throw new Error("data.js không gán window.CodiData");
delete data.analytics;
delete data.learnerStudyDays;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
for (const [key, value] of Object.entries(data)) console.log(`${key}: ${Array.isArray(value) ? `${value.length} mục` : typeof value}`);
console.log(`Đã ghi ${target}`);
