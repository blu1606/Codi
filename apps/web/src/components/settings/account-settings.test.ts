// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountSettings from "./account-settings";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("./session-settings", () => ({ default: () => null }));
vi.mock("./change-email-form", () => ({ default: () => null }));
vi.mock("@/components/profile/change-password-card", () => ({ default: () => null }));
vi.mock("@/components/profile/email-verification-card", () => ({ default: () => null }));

const user = { id: "user-155", name: "Nguyễn Văn An", email: "learner@example.com", emailVerified: true };
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let nameUpdated: ReturnType<typeof vi.fn<(event: Event) => void>>;

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

async function openNameDialog() {
  await click(container.querySelector<HTMLButtonElement>('button[aria-label="Chỉnh sửa tên hiển thị"]')!);
}

function nameInput() {
  return document.getElementById("settings-display-name") as HTMLInputElement;
}

function saveButton() {
  return document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!;
}

async function fillName(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput(), value);
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function expectNoSaveEffects() {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nameUpdated).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  nameUpdated = vi.fn();
  window.addEventListener("profile-name-updated", nameUpdated);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(AccountSettings, { user })));
  await openNameDialog();
});

afterEach(async () => {
  await act(async () => root.unmount());
  window.removeEventListener("profile-name-updated", nameUpdated);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("settings display name (UI-COM-29)", () => {
  it("disables Save on opening and rejects a forced unchanged submission", async () => {
    expect(nameInput().value).toBe(user.name);
    expect(saveButton().disabled).toBe(true);
    await submit();
    expectNoSaveEffects();
  });

  it.each(["", "   ", `  ${user.name}  `, user.name])("disables Save after editing back to %j", async (value) => {
    await fillName("Tên mới");
    expect(saveButton().disabled).toBe(false);
    await fillName(value);
    expect(saveButton().disabled).toBe(true);
    await submit();
    expectNoSaveEffects();
  });

  it("discards edits on Cancel and reopens with the original name", async () => {
    await fillName("Tên chưa lưu");
    const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find((button) => button.textContent === "Hủy")!;
    await click(cancel);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain(user.name);
    expect(container.textContent).not.toContain("Tên chưa lưu");
    await openNameDialog();
    expect(nameInput().value).toBe(user.name);
    expect(saveButton().disabled).toBe(true);
    expectNoSaveEffects();
  });

  it("saves the trimmed name and uses it as the baseline when reopened", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    await fillName("  Trần Bình  ");
    await submit();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Trần Bình" }),
    });
    expect(saveButton().disabled).toBe(true);
    expect(nameInput().disabled).toBe(true);
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(Response.json({ success: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Trần Bình");
    expect(nameUpdated).toHaveBeenCalledTimes(1);
    expect((nameUpdated.mock.calls[0][0] as CustomEvent).detail).toEqual({ userId: user.id, name: "Trần Bình" });
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Đã cập nhật tên hiển thị.");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
    await openNameDialog();
    expect(nameInput().value).toBe("Trần Bình");
    expect(saveButton().disabled).toBe(true);
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["server", "network"])("keeps the draft and original name after a %s error, then allows retry", async (failure) => {
    if (failure === "server") {
      fetchMock.mockResolvedValueOnce(Response.json({ error: "Không thể lưu tên." }, { status: 500 }));
    } else {
      fetchMock.mockRejectedValueOnce(new Error("Mất kết nối."));
    }
    await fillName("Tên mới");
    await submit();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(nameInput().value).toBe("Tên mới");
    expect(saveButton().disabled).toBe(false);
    expect(container.textContent).toContain(user.name);
    expect(container.textContent).not.toContain("Tên mới");
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(failure === "server" ? "Không thể lưu tên." : "Mất kết nối.");
    expect(nameUpdated).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Tên mới");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(nameUpdated).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
