import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Evaluates the mockup seed (a browser IIFE that assigns window.CodiData), then applies every
// seed-source/patches/<area>.js in name order. A patch file is a plain script that calls
// `patchSeed((db) => { ...mutate db in place... })`, so each feature owns its own seed additions.
// Patches may read JSON content files from seed-source/content with `readSeedJson(name)`.
export function loadSeed() {
  const code = fs.readFileSync(path.join(here, 'data.js'), 'utf8');
  const patches = [];
  const readSeedJson = (name) => JSON.parse(fs.readFileSync(path.join(here, 'content', name), 'utf8'));
  const sandbox = { window: {}, console, patchSeed: (fn) => patches.push(fn), readSeedJson };
  vm.runInNewContext(code, sandbox, { filename: 'data.js' });
  const db = sandbox.window.CodiData;
  const dir = path.join(here, 'patches');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort() : [];
  for (const f of files) {
    const before = patches.length;
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
    for (const fn of patches.slice(before)) fn(db);
  }
  return JSON.parse(JSON.stringify(db));
}
