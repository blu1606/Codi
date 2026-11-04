import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LearningPathError } from "./learning-path-contract";
import type { FileStore } from "./assessment-service";

export function createAssignmentFiles(
  configuration: () => { client: S3Client; bucket: string },
): FileStore {
  return {
    async presign(key, size, expiresIn) {
      const { client, bucket } = configuration();
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentLength: size,
          ContentType: "application/octet-stream",
        }),
        { expiresIn },
      );
    },
    async head(key) {
      const { client, bucket } = configuration();
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (result.ContentLength == null || !result.ETag) throw new Error();
        return { size: result.ContentLength, etag: result.ETag };
      } catch (error) {
        if (
          error instanceof Error &&
          !["NotFound", "NoSuchKey", "Error"].includes(error.name)
        )
          throw error;
        throw new LearningPathError(
          "Tệp chưa tải lên hoàn tất. Vui lòng thử lại.",
          409,
        );
      }
    },
    async copy(source, key, etag) {
      const { client, bucket } = configuration();
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${bucket}/${source}`,
          CopySourceIfMatch: etag,
        }),
      );
    },
    async delete(key) {
      const { client, bucket } = configuration();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async get(key) {
      const { client, bucket } = configuration();
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!result.Body)
        throw new LearningPathError("Không tìm thấy tệp bài làm.", 404);
      return {
        body: result.Body.transformToWebStream(),
        size: result.ContentLength,
      };
    },
  };
}
