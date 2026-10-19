import { describe, expect, it } from "vitest";
import {
  signUploadTicket,
  verifyUploadTicket,
} from "./assessment-upload-ticket";
const secret = "test-only-upload-ticket-secret";
const ticket = {
  userId: "owner",
  courseId: "course",
  lessonId: "lesson",
  assessmentId: 7,
  key: "assignment-uploads/12345678-1234-1234-1234-123456789012",
  name: "work.zip",
  size: 8 * 1024 * 1024,
  version: "draft-version",
  expiresAt: 2000,
};
describe("assignment upload tickets", () => {
  it("binds the server key, scope, size, filename, draft version and expiry", () =>
    expect(
      verifyUploadTicket(signUploadTicket(ticket, secret), secret, 1000),
    ).toEqual(ticket));
  it.each(["wrong-secret", ""])("rejects another signing secret %s", (key) =>
    expect(() =>
      verifyUploadTicket(signUploadTicket(ticket, secret), key, 1000),
    ).toThrow("không hợp lệ"),
  );
  it.each([2000, 2001])("expires at the TTL boundary %s", (now) =>
    expect(() =>
      verifyUploadTicket(signUploadTicket(ticket, secret), secret, now),
    ).toThrow("hết hạn"),
  );
  it("rejects metadata tampering", () => {
    const token = signUploadTicket(ticket, secret);
    const [, mac] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...ticket, userId: "victim", size: 1 }),
    ).toString("base64url");
    expect(() => verifyUploadTicket(`${forged}.${mac}`, secret, 1000)).toThrow(
      "không hợp lệ",
    );
  });
  it.each(["", "broken", "x.y.z", "x.", "x.eA"])(
    "rejects malformed tokens %s",
    (token) =>
      expect(() => verifyUploadTicket(token, secret, 1000)).toThrow(
        "không hợp lệ",
      ),
  );
});
