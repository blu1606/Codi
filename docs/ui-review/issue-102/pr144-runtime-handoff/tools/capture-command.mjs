import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const [output, ...args] = process.argv.slice(2);
if (!output || !args.length)
  throw new Error("Pass log path and Node arguments.");
fs.mkdirSync(path.dirname(output), { recursive: true });
const log = fs.createWriteStream(output);
const startedUtc = new Date().toISOString();
const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.once("error", (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
child.once("close", (exitCode, signal) => {
  log.end();
  fs.writeFileSync(
    `${output}.json`,
    JSON.stringify(
      {
        startedUtc,
        finishedUtc: new Date().toISOString(),
        cwd: process.cwd(),
        command: ["node", ...args],
        exitCode,
        signal,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ log: output, exitCode, signal }));
  process.exitCode = exitCode ?? 1;
});
