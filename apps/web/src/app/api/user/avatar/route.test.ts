import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSession, updateUser, uploadToR2, fetchImage } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  uploadToR2: vi.fn(),
  fetchImage: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/services", () => ({ auth: { api: { getSession, updateUser } } }));
vi.mock("@/lib/storage", () => ({ uploadToR2 }));

import { POST } from "./route";

const imageUrl = "https://cdn.example.com/avatars/user-1/saved.jpg";
const presetUrl = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CodiBot";

function presetRequest(name?: unknown) {
  return new NextRequest("http://localhost/api/user/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presetUrl, ...(name !== undefined ? { name } : {}) }),
  });
}

function fileRequest(name: string) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", new File(["image data"], "avatar.jpg", { type: "image/jpeg" }));
  return new NextRequest("http://localhost/api/user/avatar", { method: "POST", body: form });
}

describe("POST /api/user/avatar — save profile changes together", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    updateUser.mockResolvedValue({ success: true });
    uploadToR2.mockResolvedValue({ url: imageUrl });
    fetchImage.mockResolvedValue(new Response("image data", { headers: { "Content-Type": "image/svg+xml" } }));
    vi.stubGlobal("fetch", fetchImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves a trimmed name and preset avatar in a single profile update", async () => {
    const response = await POST(presetRequest("  Tên mới  "));

    expect(response.status).toBe(200);
    expect((await response.json()).imageUrl).toBe(imageUrl);
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({
      headers: expect.any(Headers),
      body: { name: "Tên mới", image: imageUrl },
    });
  });

  it("saves a cropped file and name together", async () => {
    const response = await POST(fileRequest("  Tên mới  "));

    expect(response.status).toBe(200);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(uploadToR2).toHaveBeenCalledWith(expect.objectContaining({ contentType: "image/jpeg" }));
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({
      headers: expect.any(Headers),
      body: { name: "Tên mới", image: imageUrl },
    });
  });

  it("does not change the name while the image upload is still pending", async () => {
    let finishUpload!: (value: { url: string }) => void;
    uploadToR2.mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));

    const pendingSave = POST(presetRequest("Tên mới"));
    await vi.waitFor(() => expect(uploadToR2).toHaveBeenCalledOnce());
    expect(updateUser).not.toHaveBeenCalled();
    finishUpload({ url: imageUrl });

    expect((await pendingSave).status).toBe(200);
    expect(updateUser).toHaveBeenCalledOnce();
  });

  it("leaves both name and avatar unchanged if uploading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    uploadToR2.mockRejectedValue(new Error("Upload failed"));

    expect((await POST(presetRequest("Tên mới"))).status).toBe(500);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each(["", "   ", null, 42])("rejects an invalid name before fetching or uploading an image: %j", async (name) => {
    expect((await POST(presetRequest(name))).status).toBe(400);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("validates the name for file uploads as well", async () => {
    expect((await POST(fileRequest("   "))).status).toBe(400);
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("does not save either field without an authenticated session", async () => {
    getSession.mockResolvedValue(null);

    expect((await POST(presetRequest("Tên mới"))).status).toBe(401);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("keeps avatar-only requests compatible", async () => {
    expect((await POST(presetRequest())).status).toBe(200);
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({
      headers: expect.any(Headers),
      body: { image: imageUrl },
    });
  });
});
