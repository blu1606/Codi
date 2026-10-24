import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { assignmentStorageConfig } from "./assignment-storage-config";

async function main() {
  const { client, bucket, files } = assignmentStorageConfig();
  const origin = process.env.BETTER_AUTH_URL;
  assert.ok(origin, "BETTER_AUTH_URL is required for the CORS preflight check");
  // Read only configuration checks: this script never changes bucket access, CORS or lifecycle rules.
  const cors = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  assert.ok(
    cors.CORSRules?.some(
      (rule) =>
        rule.AllowedOrigins?.includes(origin) &&
        rule.AllowedMethods?.includes("PUT") &&
        rule.AllowedHeaders?.some((header) =>
          ["*", "content-type"].includes(header.toLowerCase()),
        ),
    ),
    "Allow PUT + Content-Type for the exact application origin",
  );
  const lifecycle = await client.send(
    new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
  );
  assert.ok(
    lifecycle.Rules?.some(
      (rule) =>
        rule.Status === "Enabled" &&
        (rule.Filter?.Prefix ?? rule.Prefix) === "assignment-uploads/" &&
        rule.Expiration?.Days === 1,
    ),
    "Enable one-day expiration for assignment-uploads/ only",
  );
  for (const mb of [8, 20]) {
    const staging = `assignment-uploads/${randomUUID()}`;
    const committed = `assignments/${randomUUID()}`;
    try {
      const bytes = Buffer.alloc(mb * 1024 * 1024, 65);
      const url = await files.presign(staging, bytes.length, 300);
      const preflight: Response = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert.equal(
        preflight.headers.get("access-control-allow-origin"),
        origin,
      );
      const uploaded = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      });
      assert.ok(uploaded.ok, `Direct ${mb} MB PUT failed: ${uploaded.status}`);
      const head = await files.head(staging);
      assert.equal(head.size, bytes.length);
      await files.copy(staging, committed, head.etag);
      assert.deepEqual(
        Buffer.from(
          await new Response((await files.get(committed)).body).arrayBuffer(),
        ),
        bytes,
      );
      // Reusing the still-live PUT changes staging only, never the committed object.
      assert.ok(
        (
          await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: Buffer.alloc(bytes.length, 66),
          })
        ).ok,
      );
      assert.deepEqual(
        Buffer.from(
          await new Response((await files.get(committed)).body).arrayBuffer(),
        ),
        bytes,
      );
      console.log(
        `PASS: private R2 direct PUT, HEAD, immutable copy and download (${mb} MB)`,
      );
    } finally {
      await files.delete(staging);
      await files.delete(committed);
    }
  }
  client.destroy();
}
main().catch(() => {
  console.error(
    "FAIL: private assignment R2 verification. Check separate bucket, read/write/CORS/lifecycle permissions and exact app origin. Bucket credentials and signed URLs suppressed.",
  );
  process.exitCode = 1;
});
