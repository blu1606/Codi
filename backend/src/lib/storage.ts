import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createAssignmentFiles } from "./assignment-storage";
import { LearningPathError } from "./learning-path-contract";

import { ENV } from "@/env";

export function getR2Client(): S3Client | null {
  const accountId = ENV.R2_ACCOUNT_ID;
  const accessKeyId = ENV.R2_ACCESS_KEY_ID;
  const secretAccessKey = ENV.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export const R2_BUCKET = ENV.R2_BUCKET || "codi-avatars";

// Assignment objects never use the public avatar bucket or its CDN URLs.
function assignmentBucket() {
  const bucket = ENV.R2_ASSIGNMENT_BUCKET;
  if (!bucket || bucket === R2_BUCKET) throw storageUnavailable();
  return bucket;
}
export const assignmentFiles = createAssignmentFiles(() => ({
  client: assignmentClient(),
  bucket: assignmentBucket(),
}));
function storageUnavailable() {
  return new LearningPathError(
    "Kho tệp bài tập chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    503,
  );
}
function assignmentClient() {
  const client = getR2Client();
  if (!client) throw storageUnavailable();
  return client;
}

/**
 * Upload an image buffer to Cloudflare R2
 */
export async function uploadToR2({
  buffer,
  key,
  contentType,
}: {
  buffer: Buffer;
  key: string;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const client = getR2Client();
  if (!client) {
    throw new Error("Cloudflare R2 chưa được cấu hình các biến môi trường!");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  // A public storage domain serves the file directly; otherwise our proxy endpoint /api/avatar?key=... does.
  const publicBase = publicStorageBase();
  const finalUrl = publicBase ? `${publicBase}/${key}` : `/api/avatar?key=${encodeURIComponent(key)}`;

  return { key, url: finalUrl };
}

/**
 * Base URL (no trailing slash) that serves uploaded files to browsers directly, or null when they go through the
 * same-origin proxies (/api/avatar, /api/lesson-media). R2_PUBLIC_URL counts only when it is a public domain: the
 * S3 API endpoint (*.r2.cloudflarestorage.com) needs signed requests, so its files are always proxied. The page's
 * Content-Security-Policy allows this origin (server.ts).
 */
/**
 * Origin of the presigned URLs learners PUT assignment files to (assignmentFiles.presign): the R2 S3 endpoint in
 * virtual-host style, https://<bucket>.<account>.r2.cloudflarestorage.com (R2 bucket names are DNS-safe). The page's
 * Content-Security-Policy allows it in connect-src (server.ts). Null when assignment storage is not configured.
 */
export function assignmentUploadOrigin(): string | null {
  const account = ENV.R2_ACCOUNT_ID;
  const bucket = ENV.R2_ASSIGNMENT_BUCKET;
  if (!account || !bucket || bucket === R2_BUCKET) return null;
  return `https://${bucket}.${account}.r2.cloudflarestorage.com`;
}

export function publicStorageBase(): string | null {
  const publicUrl = ENV.R2_PUBLIC_URL;
  if (!publicUrl || publicUrl.includes(".r2.cloudflarestorage.com")) return null;
  return publicUrl.replace(/\/$/, "");
}

/**
 * Retrieve an object from Cloudflare R2
 */
export async function getObjectFromR2(key: string) {
  const client = getR2Client();
  if (!client) {
    throw new Error("Cloudflare R2 chưa được cấu hình!");
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
  );

  return response;
}
