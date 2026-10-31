import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "@/env";

const MAX_SIZE = 200 * 1024 * 1024;
const TYPES: Record<string, string> = {
  video: "video/mp4,video/webm,video/quicktime",
  pdf: "application/pdf",
  slide: "application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  document: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
};

export function validateLessonUpload(type: string, name: string, size: number, contentType: string) {
  if (!(type in TYPES) || !name.trim() || name.length > 240 || !Number.isInteger(size) || size < 1 || size > MAX_SIZE) return false;
  return TYPES[type].split(",").includes(contentType.toLowerCase());
}

export function createLessonUploadTicket(payload: { userId: string; courseId: string; lessonId: string; key: string; name: string; type: string; size: number; contentType: string }) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 15 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", ENV.BETTER_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readLessonUploadTicket(ticket: string) {
  const [encoded, signature, extra] = ticket.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", ENV.BETTER_AUTH_SECRET).update(encoded).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.expiresAt > Date.now() ? payload as { userId: string; courseId: string; lessonId: string; key: string; name: string; type: string; size: number; contentType: string } : null;
  } catch { return null; }
}
