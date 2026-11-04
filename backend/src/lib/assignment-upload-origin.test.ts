import { afterEach, describe, expect, it, vi } from "vitest";

// The page's Content-Security-Policy allows assignmentUploadOrigin() in connect-src; learners' browsers PUT files to
// the URL assignmentFiles.presign() returns. If the two ever disagree, file assignments silently stop uploading.
const env = vi.hoisted(() => ({
  R2_ACCOUNT_ID: "acct123" as string | undefined,
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "codi-avatars",
  R2_ASSIGNMENT_BUCKET: "codi-assignments" as string | undefined,
  R2_PUBLIC_URL: undefined,
}));
vi.mock("@/env", () => ({ ENV: env }));

const { assignmentFiles, assignmentUploadOrigin } = await import("./storage");

afterEach(() => {
  env.R2_ACCOUNT_ID = "acct123";
  env.R2_ASSIGNMENT_BUCKET = "codi-assignments";
});

describe("assignmentUploadOrigin", () => {
  it("is the origin of the presigned upload URL", async () => {
    const url = await assignmentFiles.presign("submissions/1/a.pdf", 10, 60);
    expect(assignmentUploadOrigin()).toBe(new URL(url).origin);
    expect(assignmentUploadOrigin()).toBe("https://codi-assignments.acct123.r2.cloudflarestorage.com");
  });

  it("is null when assignment storage is not configured", () => {
    env.R2_ASSIGNMENT_BUCKET = undefined;
    expect(assignmentUploadOrigin()).toBeNull();
    env.R2_ASSIGNMENT_BUCKET = "codi-assignments";
    env.R2_ACCOUNT_ID = undefined;
    expect(assignmentUploadOrigin()).toBeNull();
  });
});
