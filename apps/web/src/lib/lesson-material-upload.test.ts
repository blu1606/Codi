import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ ENV: { BETTER_AUTH_SECRET: "test-secret" } }));

import { createLessonUploadTicket, readLessonUploadTicket, validateLessonUpload } from "./lesson-material-upload";

describe("lesson material upload contract", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows supported files up to 200 MB only", () => {
    expect(validateLessonUpload("pdf", "notes.pdf", 1024, "application/pdf")).toBe(true);
    expect(validateLessonUpload("pdf", "notes.pdf", 200 * 1024 * 1024, "application/pdf")).toBe(true);
    expect(validateLessonUpload("pdf", "notes.pdf", 200 * 1024 * 1024 + 1, "application/pdf")).toBe(false);
    expect(validateLessonUpload("pdf", "notes.pdf", 20, "text/html")).toBe(false);
    expect(validateLessonUpload("link", "notes", 20, "application/pdf")).toBe(false);
  });

  it("signs tickets and rejects altered or expired ones", () => {
    const ticket = createLessonUploadTicket({ userId: "u1", courseId: "c1", lessonId: "l1", key: "lesson-material-uploads/k1", name: "notes.pdf", type: "pdf", size: 20, contentType: "application/pdf" });
    expect(readLessonUploadTicket(ticket)?.userId).toBe("u1");
    expect(readLessonUploadTicket(`${ticket}x`)).toBeNull();
  });
});
