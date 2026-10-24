import { S3Client } from "@aws-sdk/client-s3";
import { createAssignmentFiles } from "../src/lib/assignment-storage";

export function assignmentStorageConfig() {
  const {
    R2_ACCOUNT_ID: account,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_ASSIGNMENT_BUCKET: bucket,
    R2_BUCKET: publicBucket,
  } = process.env;
  if (
    !account ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    bucket === (publicBucket || "codi-avatars")
  )
    throw new Error(
      "Configure a separate private R2_ASSIGNMENT_BUCKET and object read/write credentials first.",
    );
  const client = new S3Client({
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    client,
    bucket,
    files: createAssignmentFiles(() => ({ client, bucket })),
  };
}
