// Course completion certificates: the code format, input normalisation, request validation and the public view.
// Pure functions only; certificate-service.ts owns the database and the email.
import { randomInt } from "node:crypto";
import { z } from "zod";

export class CertificateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CertificateError";
  }
}

// Crockford base32: no I, L, O, U, so a code read off paper is not misread.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_PATTERN = /^CODI-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** A new random code, CODI-XXXX-XXXX (32^8 ≈ 10^12 values). */
export function newCertificateCode(random: (max: number) => number = randomInt): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[random(ALPHABET.length)]!);
  return `CODI-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/**
 * The canonical code for what a person typed or a link carried, or null when it cannot be one: case and spaces are
 * ignored, the CODI- prefix and dashes are optional, and O / I / L read as 0 / 1 / 1 (Crockford).
 */
export function normalizeCertificateCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.startsWith("CODI")) s = s.slice(4);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8) return null;
  const code = `CODI-${s.slice(0, 4)}-${s.slice(4)}`;
  return CODE_PATTERN.test(code) ? code : null;
}

export const RENAME_MIN = 2;
export const RENAME_MAX = 80;
export const REVOKE_REASON_MAX = 500;

const name = z.string().trim().min(RENAME_MIN, `Tên cần ít nhất ${RENAME_MIN} ký tự.`).max(RENAME_MAX, `Tên tối đa ${RENAME_MAX} ký tự.`)
  .refine((v) => /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(v), "Tên chỉ gồm chữ cái, khoảng trắng và dấu . ' -");
export const certificateAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name }).strict(),
  z.object({ action: z.literal("revoke"), reason: z.string().trim().min(5, "Ghi lý do thu hồi (ít nhất 5 ký tự).").max(REVOKE_REASON_MAX) }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);
export type CertificateAction = z.infer<typeof certificateAction>;

export type CertificateRow = {
  code: string;
  userId: string | null;
  courseId: string | null;
  recipientName: string;
  courseTitle: string;
  lecturerName: string | null;
  lessonCount: number;
  totalSeconds: number;
  issuedAt: Date;
  nameEditedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

export type CertificateViewer = { userId: string | null; isAdmin: boolean };

/**
 * What /verify shows. Never the holder's email or user ID; the revocation reason only to the holder and admins.
 * courseSlug links back to the course only while it is still public.
 */
export function certificateView(row: CertificateRow, viewer: CertificateViewer, courseSlug: string | null) {
  const isOwner = !!viewer.userId && viewer.userId === row.userId;
  const revoked = !!row.revokedAt;
  return {
    code: row.code,
    status: revoked ? ("revoked" as const) : ("valid" as const),
    recipientName: row.recipientName,
    courseTitle: row.courseTitle,
    courseSlug,
    lecturerName: row.lecturerName,
    lessonCount: row.lessonCount,
    totalMinutes: Math.max(1, Math.round(row.totalSeconds / 60)),
    issuedAt: row.issuedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedReason: revoked && (isOwner || viewer.isAdmin) ? row.revokedReason : null,
    viewer: {
      isOwner,
      isAdmin: viewer.isAdmin,
      canRename: isOwner && !revoked && !row.nameEditedAt,
      nameEdited: !!row.nameEditedAt,
    },
  };
}
export type CertificateView = ReturnType<typeof certificateView>;

/** Who may run an action on a certificate, and whether its state allows it (checked before any write). */
export function assertCertificateAction(row: Pick<CertificateRow, "userId" | "revokedAt" | "nameEditedAt">,
  viewer: CertificateViewer, action: CertificateAction["action"]) {
  if (action === "rename") {
    if (!viewer.userId || viewer.userId !== row.userId) throw new CertificateError("Chỉ chủ chứng chỉ được sửa tên.", 403);
    if (row.revokedAt) throw new CertificateError("Chứng chỉ đã bị thu hồi nên không sửa được tên.", 409);
    if (row.nameEditedAt) throw new CertificateError("Bạn đã dùng lượt sửa tên. Liên hệ quản trị viên nếu cần sửa thêm.", 409);
    return;
  }
  if (!viewer.isAdmin) throw new CertificateError("Chỉ quản trị viên được thu hồi hoặc khôi phục chứng chỉ.", 403);
  if (action === "revoke" && row.revokedAt) throw new CertificateError("Chứng chỉ này đã bị thu hồi.", 409);
  if (action === "restore" && !row.revokedAt) throw new CertificateError("Chứng chỉ này đang hợp lệ.", 409);
}
