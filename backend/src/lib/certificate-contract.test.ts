import { describe, expect, it } from "vitest";
import {
  assertCertificateAction, certificateAction, certificateView, CODE_PATTERN, newCertificateCode, normalizeCertificateCode,
  type CertificateRow,
} from "./certificate-contract";

const row: CertificateRow = {
  code: "CODI-7KQ2-M9XA", userId: "u1", courseId: "c1", recipientName: "Nguyễn Văn A", courseTitle: "JavaScript nền tảng",
  lecturerName: "Cô Lan", lessonCount: 12, totalSeconds: 7_230, issuedAt: new Date("2026-11-13T08:00:00Z"),
  nameEditedAt: null, revokedAt: null, revokedReason: null,
};
const guest = { userId: null, isAdmin: false };
const owner = { userId: "u1", isAdmin: false };
const admin = { userId: "a1", isAdmin: true };

describe("certificate codes", () => {
  it("makes CODI-XXXX-XXXX codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) expect(newCertificateCode()).toMatch(CODE_PATTERN);
    expect(newCertificateCode(() => 0)).toBe("CODI-0000-0000");
  });

  it("accepts what people type: case, spaces, missing dashes or prefix, and O/I/L for 0/1/1", () => {
    expect(normalizeCertificateCode("codi-7kq2-m9xa")).toBe("CODI-7KQ2-M9XA");
    expect(normalizeCertificateCode(" 7KQ2 M9XA ")).toBe("CODI-7KQ2-M9XA");
    expect(normalizeCertificateCode("CODI7KQ2M9XA")).toBe("CODI-7KQ2-M9XA");
    expect(normalizeCertificateCode("CODI-O1L2-I9XA")).toBe("CODI-0112-19XA");
  });

  it("rejects anything that cannot be a code", () => {
    for (const bad of ["", "CODI-123", "CODI-7KQ2-M9XAZ", "CODI-7KQ2-M9U!", 42, null, "x".repeat(50)]) {
      expect(normalizeCertificateCode(bad)).toBeNull();
    }
  });
});

describe("certificateView", () => {
  it("shows a guest the public facts only", () => {
    const v = certificateView(row, guest, "javascript");
    expect(v).toMatchObject({ status: "valid", recipientName: "Nguyễn Văn A", totalMinutes: 121, courseSlug: "javascript" });
    expect(v.viewer).toEqual({ isOwner: false, isAdmin: false, canRename: false, nameEdited: false });
    expect(JSON.stringify(v)).not.toContain("u1");
  });

  it("lets the holder rename once, and only while the certificate is valid", () => {
    expect(certificateView(row, owner, null).viewer.canRename).toBe(true);
    expect(certificateView({ ...row, nameEditedAt: new Date() }, owner, null).viewer.canRename).toBe(false);
    expect(certificateView({ ...row, revokedAt: new Date() }, owner, null).viewer.canRename).toBe(false);
  });

  it("shows the revocation reason to the holder and admins, never to a guest", () => {
    const revoked = { ...row, revokedAt: new Date("2026-11-14T00:00:00Z"), revokedReason: "Hoàn tiền khoá học" };
    expect(certificateView(revoked, guest, null)).toMatchObject({ status: "revoked", revokedReason: null });
    expect(certificateView(revoked, owner, null).revokedReason).toBe("Hoàn tiền khoá học");
    expect(certificateView(revoked, admin, null).revokedReason).toBe("Hoàn tiền khoá học");
  });
});

describe("assertCertificateAction", () => {
  it("allows rename by the holder once, never by someone else or after revocation", () => {
    expect(() => assertCertificateAction(row, owner, "rename")).not.toThrow();
    expect(() => assertCertificateAction(row, admin, "rename")).toThrow(/chủ chứng chỉ/);
    expect(() => assertCertificateAction({ ...row, nameEditedAt: new Date() }, owner, "rename")).toThrow(/lượt sửa tên/);
    expect(() => assertCertificateAction({ ...row, revokedAt: new Date() }, owner, "rename")).toThrow(/thu hồi/);
  });

  it("keeps revoke and restore to admins, each only from the matching state", () => {
    expect(() => assertCertificateAction(row, owner, "revoke")).toThrow(/quản trị viên/);
    expect(() => assertCertificateAction(row, admin, "revoke")).not.toThrow();
    expect(() => assertCertificateAction(row, admin, "restore")).toThrow(/đang hợp lệ/);
    expect(() => assertCertificateAction({ ...row, revokedAt: new Date() }, admin, "restore")).not.toThrow();
    expect(() => assertCertificateAction({ ...row, revokedAt: new Date() }, admin, "revoke")).toThrow(/đã bị thu hồi/);
  });

  it("validates the request body", () => {
    expect(certificateAction.safeParse({ action: "rename", name: "Trần Thị Bích" }).success).toBe(true);
    expect(certificateAction.safeParse({ action: "rename", name: "<script>" }).success).toBe(false);
    expect(certificateAction.safeParse({ action: "rename", name: "A" }).success).toBe(false);
    expect(certificateAction.safeParse({ action: "revoke", reason: "ok" }).success).toBe(false);
    expect(certificateAction.safeParse({ action: "restore", extra: 1 }).success).toBe(false);
  });
});
