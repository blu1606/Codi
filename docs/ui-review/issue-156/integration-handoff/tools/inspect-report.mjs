import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Pass report.json.gz and destination.json.");
const bytes = gunzipSync(fs.readFileSync(input));
fs.writeFileSync(output, bytes);
const report = JSON.parse(bytes);
console.log(
  JSON.stringify(
    {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      stats: report.stats,
    },
    null,
    2,
  ),
);
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      console.log(`${test.status}: ${spec.title}`);
      for (const result of test.results) {
        for (const attachment of result.attachments ?? []) {
          if (attachment.name === "browser-health" && attachment.body) {
            console.log(
              "  browser-health:",
              Buffer.from(attachment.body, "base64").toString("utf8"),
            );
          }
        }
      }
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
