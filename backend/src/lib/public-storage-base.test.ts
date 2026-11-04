import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ R2_PUBLIC_URL: undefined as string | undefined }));
vi.mock("@/env", () => ({ ENV: env }));

const { publicStorageBase } = await import("./storage");
const { mediaUrl } = await import("./lesson-media");

afterEach(() => {
  env.R2_PUBLIC_URL = undefined;
});

describe("publicStorageBase", () => {
  it("is null without R2_PUBLIC_URL, so files go through the same-origin proxies", () => {
    expect(publicStorageBase()).toBeNull();
    expect(mediaUrl("lesson-media/a.pdf")).toBe("/api/lesson-media?key=lesson-media%2Fa.pdf");
  });

  it("is null for the S3 API endpoint, which needs signed requests", () => {
    env.R2_PUBLIC_URL = "https://abc123.r2.cloudflarestorage.com";
    expect(publicStorageBase()).toBeNull();
  });

  it("is the public domain without a trailing slash, and lesson media links there", () => {
    env.R2_PUBLIC_URL = "https://media.example.com/";
    expect(publicStorageBase()).toBe("https://media.example.com");
    expect(mediaUrl("lesson-media/a.pdf")).toBe("https://media.example.com/lesson-media/a.pdf");
  });
});
