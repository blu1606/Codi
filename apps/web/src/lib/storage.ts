import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export const R2_BUCKET = ENV.R2_BUCKET || "codi-avatars";

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
    })
  );

  // If a public domain is configured and it's not the internal S3 endpoint, use it directly.
  // Otherwise, use our reliable proxy endpoint /api/avatar?key=...
  const publicUrl = ENV.R2_PUBLIC_URL;
  let finalUrl: string;

  if (publicUrl && !publicUrl.includes(".r2.cloudflarestorage.com")) {
    finalUrl = `${publicUrl.replace(/\/$/, "")}/${key}`;
  } else {
    finalUrl = `/api/avatar?key=${encodeURIComponent(key)}`;
  }

  return { key, url: finalUrl };
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
    })
  );

  return response;
}

/**
 * Preset default avatars for Codi learners
 */
export const PRESET_DEFAULT_AVATARS = [
  {
    id: "codi-bot",
    name: "Codi Bot",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CodiBot&backgroundColor=0ea5e9",
  },
  {
    id: "neon-coder",
    name: "Cyber Hacker",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CyberHacker&backgroundColor=6366f1",
  },
  {
    id: "tech-wizard",
    name: "Tech Wizard",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=TechWizard&backgroundColor=10b981",
  },
  {
    id: "pixel-ninja",
    name: "Pixel Ninja",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=PixelNinja&backgroundColor=f59e0b",
  },
  {
    id: "algo-master",
    name: "Algo Master",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=AlgoMaster&backgroundColor=ec4899",
  },
  {
    id: "coffee-dev",
    name: "Coffee Dev",
    url: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CoffeeDev&backgroundColor=8b5cf6",
  },
];
