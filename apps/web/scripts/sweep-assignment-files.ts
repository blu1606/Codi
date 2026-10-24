import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { eq, or, sql } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { assignmentStorageConfig } from "./assignment-storage-config";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const { client, bucket, files } = assignmentStorageConfig();
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const apply = process.argv.includes("--apply");
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let candidates = 0;
  let removed = 0;
  try {
    // Confirmed keys are server-generated and immutable. A five-minute ticket can never adopt
    // an unreferenced assignments/ key that is already over 24 hours old.
    for (const prefix of ["assignments/", "assignment-uploads/"]) {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents ?? []) {
          const key = item.Key;
          if (
            !key ||
            !item.LastModified ||
            item.LastModified.getTime() >= cutoff
          )
            continue;
          // Recheck both submitted content and draft immediately before deleting.
          const [reference] = await db
            .select({ id: assessmentSubmissions.id })
            .from(assessmentSubmissions)
            .where(
              or(
                eq(assessmentSubmissions.fileUrl, key),
                sql`${assessmentSubmissions.assignmentDraft}->>'fileKey' = ${key}`,
              ),
            )
            .limit(1);
          if (reference) continue;
          candidates++;
          if (apply) {
            await files.delete(key);
            removed++;
          }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
    console.log(
      `${apply ? "APPLY" : "DRY RUN"}: ${candidates} unreferenced objects older than 24h; ${removed} removed. No object keys or learner data logged.`,
    );
  } finally {
    client.destroy();
    await db.$client.end();
  }
}
main().catch(() => {
  console.error(
    "Assignment storage sweep failed; details suppressed. Check DB and private bucket configuration.",
  );
  process.exitCode = 1;
});
