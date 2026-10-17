import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CopyObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createAssignmentFiles } from "./assignment-storage";
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
const client = new S3Client({
  region: "auto",
  credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
});
const files = createAssignmentFiles(() => ({
  client,
  bucket: "private-assignment-fixture",
}));
beforeEach(() => vi.restoreAllMocks());
describe("private assignment storage", () => {
  it("signs a bounded five-minute PUT to the private bucket", async () => {
    mocks.sign.mockResolvedValue("signed-url");
    expect(
      await files.presign("assignment-uploads/generated", 8 * 1024 * 1024, 300),
    ).toBe("signed-url");
    const [, command, options] = mocks.sign.mock.calls.at(-1)!;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "private-assignment-fixture",
      Key: "assignment-uploads/generated",
      ContentLength: 8 * 1024 * 1024,
      ContentType: "application/octet-stream",
    });
    expect(options).toEqual({ expiresIn: 300 });
  });
  it("reads the actual size and etag using HEAD", async () => {
    const send = vi
      .spyOn(client, "send")
      .mockResolvedValue({ ContentLength: 8, ETag: '"etag"' } as never);
    expect(await files.head("assignment-uploads/generated")).toEqual({
      size: 8,
      etag: '"etag"',
    });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
  });
  it("uses If-Match when copying to a different immutable key", async () => {
    const send = vi.spyOn(client, "send").mockResolvedValue({} as never);
    await files.copy(
      "assignment-uploads/generated",
      "assignments/immutable",
      '"etag"',
    );
    const command = send.mock.calls[0]![0] as CopyObjectCommand;
    expect(command).toBeInstanceOf(CopyObjectCommand);
    expect(command.input).toEqual({
      Bucket: "private-assignment-fixture",
      Key: "assignments/immutable",
      CopySource: "private-assignment-fixture/assignment-uploads/generated",
      CopySourceIfMatch: '"etag"',
    });
  });
  it("reports incomplete/missing objects without exposing bucket details", async () => {
    vi.spyOn(client, "send").mockResolvedValue({} as never);
    await expect(
      files.head("assignment-uploads/generated"),
    ).rejects.toMatchObject({ status: 409 });
  });
});
