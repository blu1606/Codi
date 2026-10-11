// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountSettings from "./account-settings";
import SessionSettings from "./session-settings";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  changePassword: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function session(id: string) {
  return { id, token: `token-${id}`, createdAt: new Date(), userAgent: "Chrome/1 Windows" };
}

let root: Root;
let container: HTMLDivElement;

async function render(element: ReturnType<typeof createElement>) {
  await act(async () => root.render(element));
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

function logoutButtons() {
  return Array.from(container.querySelectorAll("li button"));
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  auth.listSessions.mockResolvedValue({ data: [session("original"), session("other")], error: null });
  auth.getSession.mockResolvedValue({ data: { session: session("original") }, error: null });
  auth.revokeSession.mockResolvedValue({ data: { status: true }, error: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("settings current session", () => {
  it("refreshes the current marker after changing the password and closing the dialog", async () => {
    let completeChange!: () => void;
    const pendingChange = new Promise<void>((resolve) => { completeChange = resolve; });
    auth.changePassword.mockImplementation(async (_body, options) => {
      await pendingChange;
      auth.listSessions.mockResolvedValue({ data: [session("replacement")], error: null });
      auth.getSession.mockResolvedValue({ data: { session: session("replacement") }, error: null });
      options.onSuccess();
      return { data: { token: "token-replacement" }, error: null };
    });
    await render(createElement(AccountSettings, {
      user: { id: "user", name: "Test User", email: "test@example.com", emailVerified: true },
    }));
    await click(container.querySelector<HTMLButtonElement>('button[aria-controls="settings-session-list"]')!);
    expect(logoutButtons()).toHaveLength(1);

    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Chỉnh sửa mật khẩu"]')!);
    for (const [id, value] of [
      ["currentPassword", "original-password"],
      ["newPassword", "replacement-password"],
      ["confirmPassword", "replacement-password"],
    ]) {
      await act(async () => {
        const input = document.getElementById(id) as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => {
      document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() => expect(auth.changePassword).toHaveBeenCalledWith(
      { currentPassword: "original-password", newPassword: "replacement-password", revokeOtherSessions: true },
      expect.any(Object),
    ));
    const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="Đóng hộp thoại"]')!;
    expect(closeButton.disabled).toBe(true);
    await click(closeButton);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    await act(async () => completeChange());
    await click(document.querySelector<HTMLButtonElement>('button[aria-label="Đóng hộp thoại"]')!);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    expect(auth.listSessions).toHaveBeenCalledTimes(2);
    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Phiên hiện tại");
    expect(logoutButtons()).toHaveLength(0);
    expect(auth.revokeSession).not.toHaveBeenCalled();
  });

  it("uses an authoritative uncached identity and still allows revoking another session", async () => {
    await render(createElement(SessionSettings, { revision: 0 }));
    expect(auth.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true }, fetchOptions: { cache: "no-store" },
    });
    expect(container.querySelector("li")!.textContent).toContain("Phiên hiện tại");
    expect(container.querySelector("li")!.querySelector("button")).toBeNull();
    expect(logoutButtons()).toHaveLength(1);
    await click(logoutButtons()[0] as HTMLButtonElement);
    expect(auth.revokeSession).toHaveBeenCalledExactlyOnceWith({ token: "token-other" });
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "Session unavailable" } },
  ])("hides logout controls when current identity is unavailable: %j", async (response) => {
    await render(createElement(SessionSettings, { revision: 0 }));
    auth.getSession.mockResolvedValue(response);
    await render(createElement(SessionSettings, { revision: 1 }));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(logoutButtons()).toHaveLength(0);
    expect(auth.revokeSession).not.toHaveBeenCalled();
  });

  it("keeps logout controls unavailable until both refreshed responses arrive", async () => {
    await render(createElement(SessionSettings, { revision: 0 }));
    let resolveSession!: (value: unknown) => void;
    auth.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    auth.listSessions.mockResolvedValue({ data: [session("replacement")], error: null });
    await render(createElement(SessionSettings, { revision: 1 }));
    expect(logoutButtons()).toHaveLength(0);
    await act(async () => resolveSession({ data: { session: session("replacement") }, error: null }));
    expect(container.querySelector("li")!.textContent).toContain("Phiên hiện tại");
    expect(logoutButtons()).toHaveLength(0);
  });

  it("ignores a stale response from an earlier refresh", async () => {
    let resolveSession!: (value: unknown) => void;
    auth.getSession.mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve; }));
    await render(createElement(SessionSettings, { revision: 0 }));
    auth.getSession.mockResolvedValue({ data: { session: session("replacement") }, error: null });
    auth.listSessions.mockResolvedValue({ data: [session("replacement")], error: null });
    await render(createElement(SessionSettings, { revision: 1 }));
    await act(async () => resolveSession({ data: { session: session("original") }, error: null }));
    expect(container.querySelector("li")!.textContent).toContain("Phiên hiện tại");
    expect(logoutButtons()).toHaveLength(0);
  });

  it("offers retry after a failed identity request and restores safe controls", async () => {
    auth.getSession.mockRejectedValueOnce(new Error("Network failure"));
    await render(createElement(SessionSettings, { revision: 0 }));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(logoutButtons()).toHaveLength(0);
    await click(container.querySelector<HTMLButtonElement>('button[aria-controls="settings-session-list"]')!);
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Tải lại")!;
    await click(retry);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("li")!.textContent).toContain("Phiên hiện tại");
    expect(logoutButtons()).toHaveLength(1);
  });
});
