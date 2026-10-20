// @vitest-environment happy-dom

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type AvatarPicker from "./avatar-picker";
import type { AvatarSelection } from "./avatar-picker";
import ProfileCard from "./profile-card";

type PickerProps = ComponentProps<typeof AvatarPicker>;
const boundary = vi.hoisted(() => ({
  refresh: vi.fn(), success: vi.fn(), error: vi.fn(), picker: null as PickerProps | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: boundary.success, error: boundary.error } }));
vi.mock("./avatar-picker", () => ({ default: (props: PickerProps) => { boundary.picker = props; return null; } }));

const user = { id: "profile-user", name: "Nguyễn Văn An", email: "learner@example.com", emailVerified: true, image: "https://cdn.example.com/original.jpg" };
const savedImage = "https://cdn.example.com/saved.jpg";
let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let nameEvent: Mock<(event: Event) => void>;
let avatarEvent: Mock<(event: Event) => void>;

function button(label: string) {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const saveButton = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const nameInput = () => host.querySelector<HTMLInputElement>("#displayName")!;
async function click(label: string) { await act(async () => button(label).click()); }
async function fillName(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput(), value);
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function selectAvatar(selection: AvatarSelection) {
  await act(async () => boundary.picker!.onAvatarSelected(selection));
}
function expectNoSaveEffects() {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nameEvent).not.toHaveBeenCalled();
  expect(avatarEvent).not.toHaveBeenCalled();
  expect(boundary.success).not.toHaveBeenCalled();
  expect(boundary.error).not.toHaveBeenCalled();
  expect(boundary.refresh).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock = vi.fn().mockRejectedValue(new Error("Unexpected request"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:profile-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  nameEvent = vi.fn<(event: Event) => void>();
  avatarEvent = vi.fn<(event: Event) => void>();
  window.addEventListener("profile-name-updated", nameEvent);
  window.addEventListener("profile-avatar-updated", avatarEvent);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ProfileCard, { user })));
  await click("Chỉnh sửa hồ sơ");
});
afterEach(async () => {
  await act(async () => root.unmount());
  window.removeEventListener("profile-name-updated", nameEvent);
  window.removeEventListener("profile-avatar-updated", avatarEvent);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("profile save eligibility", () => {
  it("disables Save when opened without name or avatar changes", () => {
    expect(nameInput().value).toBe(user.name);
    expect(saveButton().disabled).toBe(true);
    expectNoSaveEffects();
  });

  it.each([user.name, `  ${user.name}  `])("ignores forced unchanged or trim-equivalent submission: %j", async (value) => {
    await fillName(value);
    await submit();
    expectNoSaveEffects();
  });

  it.each([user.name, `  ${user.name}  `, "", "   "])("disables Save after a real edit is reverted to %j", async (value) => {
    await fillName("Tên mới");
    expect(saveButton().disabled).toBe(false);
    await fillName(value);
    expect(saveButton().disabled).toBe(true);
  });

  it("preserves blank-name validation for forced submissions", async () => {
    await fillName("   ");
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(boundary.error).toHaveBeenCalledExactlyOnceWith("Họ và tên không được để trống");
  });

  it("saves a trimmed real name once and uses the successful result as the new baseline", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    await fillName("  Trần Bình  ");
    await submit();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/user/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Trần Bình" }),
    });
    expect(saveButton().disabled).toBe(true);
    expect(nameInput().disabled).toBe(true);
    expect(boundary.picker!.disabled).toBe(true);
    await submit();
    await click("Huỷ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector("form")).not.toBeNull();
    await act(async () => finish(Response.json({ success: true })));
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Trần Bình");
    expect(nameEvent).toHaveBeenCalledTimes(1);
    expect((nameEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ userId: user.id, name: "Trần Bình" });
    expect(avatarEvent).not.toHaveBeenCalled();
    expect(boundary.refresh).toHaveBeenCalledOnce();
    expect(boundary.success).toHaveBeenCalledOnce();
    await click("Chỉnh sửa hồ sơ");
    expect(nameInput().value).toBe("Trần Bình");
    expect(saveButton().disabled).toBe(true);
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fillName(user.name);
    expect(saveButton().disabled).toBe(false);
  });

  it.each(["preset", "file"] as const)("saves a pending %s avatar with the unchanged name", async (kind) => {
    const file = new File(["selected image"], "avatar.jpg", { type: "image/jpeg" });
    const presetUrl = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CodiBot";
    await selectAvatar(kind === "file" ? { kind, file } : { kind, url: presetUrl });
    expect(saveButton().disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, imageUrl: savedImage }));
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/user/avatar");
    expect(options.method).toBe("POST");
    if (kind === "file") {
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get("name")).toBe(user.name);
      expect(options.body.get("file").name).toBe(file.name);
      expect(options.headers).toBeUndefined();
    } else {
      expect(JSON.parse(options.body)).toEqual({ name: user.name, presetUrl });
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
    }
    expect((avatarEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ userId: user.id, imageUrl: savedImage });
    expect(avatarEvent).toHaveBeenCalledTimes(1);
    expect(nameEvent).toHaveBeenCalledTimes(1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(savedImage);
    await click("Chỉnh sửa hồ sơ");
    expect(boundary.picker!.currentAvatar).toBe(savedImage);
    expect(saveButton().disabled).toBe(true);
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["preset", "file"] as const)("discards a name and pending %s avatar on cancel/reopen", async (kind) => {
    await fillName("Tên chưa lưu");
    await selectAvatar(kind === "file"
      ? { kind, file: new File(["image"], "avatar.jpg", { type: "image/jpeg" }) }
      : { kind, url: "https://example.com/preset.svg" });
    await click("Huỷ");
    expect(host.textContent).toContain(user.name);
    await click("Chỉnh sửa hồ sơ");
    expect(nameInput().value).toBe(user.name);
    expect(boundary.picker!.currentAvatar).toBe(user.image);
    expect(saveButton().disabled).toBe(true);
    expectNoSaveEffects();
  });

  it.each(["server", "network"] as const)("keeps the original name and draft after %s failure and supports retry", async (failure) => {
    if (failure === "server") fetchMock.mockResolvedValueOnce(Response.json({ error: "Save failed" }, { status: 500 }));
    else fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await fillName("Tên mới");
    await submit();
    expect(nameInput().value).toBe("Tên mới");
    expect(saveButton().disabled).toBe(false);
    expect(nameInput().disabled).toBe(false);
    expect(nameEvent).not.toHaveBeenCalled();
    expect(avatarEvent).not.toHaveBeenCalled();
    expect(boundary.success).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
    expect(boundary.error).toHaveBeenCalledExactlyOnceWith(failure === "server" ? "Save failed" : "Offline");
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    await submit();
    expect(host.textContent).toContain("Tên mới");
    expect(nameEvent).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains an avatar-only draft after failure and retries the avatar endpoint", async () => {
    await selectAvatar({ kind: "preset", url: "https://example.com/preset.svg" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Upload failed" }, { status: 500 }));
    await submit();
    expect(saveButton().disabled).toBe(false);
    expect(avatarEvent).not.toHaveBeenCalled();
    expect(nameEvent).not.toHaveBeenCalled();
    expect(boundary.picker!.currentAvatar).toBe("https://example.com/preset.svg");
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, imageUrl: savedImage }));
    await submit();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/user/avatar", "/api/user/avatar"]);
    expect(avatarEvent).toHaveBeenCalledOnce();
    expect(boundary.refresh).toHaveBeenCalledOnce();
  });
});
