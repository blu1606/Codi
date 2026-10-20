import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { LearningPathError } from "./learning-path-contract";

const ticket = z
  .object({
    userId: z.string(),
    courseId: z.string(),
    lessonId: z.string(),
    assessmentId: z.number(),
    key: z.string().regex(/^assignment-uploads\/[0-9a-f-]{36}$/),
    name: z.string(),
    size: z.number().int().positive(),
    version: z.string(),
    expiresAt: z.number(),
  })
  .strict();
export type UploadTicket = z.infer<typeof ticket>;
const signature = (body: string, secret: string) =>
  createHmac("sha256", secret).update(`assignment-upload:${body}`).digest();
export function signUploadTicket(value: UploadTicket, secret: string) {
  const body = Buffer.from(JSON.stringify(ticket.parse(value))).toString(
    "base64url",
  );
  return `${body}.${signature(body, secret).toString("base64url")}`;
}
export function verifyUploadTicket(
  token: string,
  secret: string,
  now = Date.now(),
): UploadTicket {
  try {
    const [body, mac, extra] = token.split(".");
    if (!body || !mac || extra) throw new Error();
    const expected = signature(body, secret);
    const actual = Buffer.from(mac, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const value = ticket.parse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );
    if (value.expiresAt <= now) throw new Error();
    return value;
  } catch {
    throw new LearningPathError(
      "Phiên tải tệp không hợp lệ hoặc đã hết hạn. Hãy chọn tệp lại.",
      409,
    );
  }
}
