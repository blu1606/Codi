// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleId } from "@codi-1/auth";
import RoleSelect from "./role-select";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  updateRole: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../actions", () => ({
  updateUserRole: mocks.updateRole,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

let root: Root | undefined;
let host: HTMLDivElement;

const props = {
  userId: "user-1",
  currentRoleId: "LEARNER" as RoleId,
  userName: "Nguyễn Văn A",
  disabled: false,
};

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const selectElement = () => host.querySelector<HTMLSelectElement>("select")!;
const findButton = (text: string, within: ParentNode = document) => {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(found, `button with text "${text}"`).toBeDefined();
  return found!;
};

const click = async (text: string, within: ParentNode = document) => {
  await act(async () => {
    findButton(text, within).click();
  });
};

const changeSelect = async (newRole: RoleId) => {
  const select = selectElement();
  await act(async () => {
    select.value = newRole;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

async function mount(overrides: Partial<typeof props> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(RoleSelect, { ...props, ...overrides }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateRole.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
});

describe("RoleSelect component - Confirmation & Cancellation Contract (UI-ADM-17, Issue #154)", () => {
  it("disables the Save button when the selected role is identical to currentRoleId", async () => {
    await mount();
    expect(selectElement().value).toBe("LEARNER");
    const saveBtn = findButton("Lưu", host);
    expect(saveBtn.disabled).toBe(true);
  });

  it("enables the Save button when a different role is selected", async () => {
    await mount();
    await changeSelect("LECTURER");
    expect(selectElement().value).toBe("LECTURER");
    const saveBtn = findButton("Lưu", host);
    expect(saveBtn.disabled).toBe(false);
  });

  it("does not call updateUserRole immediately upon clicking Save; instead opens the confirmation dialog", async () => {
    await mount();
    await changeSelect("LECTURER");
    await click("Lưu", host);

    // Assert dialog is opened and displays correct consequence description
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("Đổi vai trò của Nguyễn Văn A?");
    expect(dialog()?.textContent).toContain("Học viên → Giảng viên");
    expect(dialog()?.textContent).toContain("Thay đổi có hiệu lực ở lần tải trang tiếp theo của họ.");

    // Server action should NOT be called yet
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });

  it("reverts the select value back to currentRoleId and closes dialog on cancel without updating role", async () => {
    await mount();
    await changeSelect("LECTURER");
    expect(selectElement().value).toBe("LECTURER");

    await click("Lưu", host);
    expect(dialog()).not.toBeNull();

    // Click 'Huỷ' in dialog
    await click("Huỷ", dialog()!);

    // Dialog should close
    expect(dialog()).toBeNull();

    // Select should be reverted back to initial currentRoleId
    expect(selectElement().value).toBe("LEARNER");

    // Save button must be disabled again since role matches currentRoleId
    expect(findButton("Lưu", host).disabled).toBe(true);

    // Server action must never be called
    expect(mocks.updateRole).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("persists role change when confirming in dialog, notifies user and refreshes page", async () => {
    await mount();
    await changeSelect("LECTURER");
    await click("Lưu", host);

    // Click 'Đổi vai trò' in confirmation dialog
    await click("Đổi vai trò", dialog()!);

    expect(mocks.updateRole).toHaveBeenCalledExactlyOnceWith("user-1", "LECTURER");
    expect(mocks.success).toHaveBeenCalledWith("Đã cập nhật vai trò người dùng.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("handles server action error by reverting select, closing dialog, and displaying error toast", async () => {
    mocks.updateRole.mockRejectedValue(new Error("Lỗi phân quyền hệ thống"));
    await mount();
    await changeSelect("ADMIN");
    await click("Lưu", host);

    await click("Đổi vai trò", dialog()!);

    expect(mocks.updateRole).toHaveBeenCalledExactlyOnceWith("user-1", "ADMIN");
    expect(mocks.error).toHaveBeenCalledWith("Lỗi phân quyền hệ thống");
    expect(dialog()).toBeNull();
    expect(selectElement().value).toBe("LEARNER");
    expect(findButton("Lưu", host).disabled).toBe(true);
  });
});
