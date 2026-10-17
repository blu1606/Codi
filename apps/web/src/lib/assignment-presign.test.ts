import { describe, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { createAssignmentFiles } from "./assignment-storage";
describe("browser R2 presigning", () => {
  it("signs content length and expiry without a checksum for an empty server body", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://fixture.r2.cloudflarestorage.com",
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
    });
    try {
      const files = createAssignmentFiles(() => ({
        client,
        bucket: "private-fixture",
      }));
      const url = new URL(
        await files.presign("assignment-uploads/fixture", 8 * 1024 * 1024, 300),
      );
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
        "content-length",
      );
      expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
      expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
    } finally {
      client.destroy();
    }
  });
});
