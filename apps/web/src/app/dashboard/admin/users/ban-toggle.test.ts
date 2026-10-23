// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BanToggle from "./ban-toggle";
import type { UserImpactCounts } from "../actions";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks = vi.hoisted(() => ({
  impact: vi.fn(),
  ban: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  confirm: undefined as (() => void) | undefined,
}));
vi.mock("../actions", () => ({
  getUserImpactCounts: mocks.impact,
  toggleUserBan: mocks.ban,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@codi-1/ui/components/button", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@codi-1/ui/components/button")>();
  return {
    ...original,
    Button: (props: ComponentProps<typeof original.Button>) => {
      // Observe the actual callback while retaining the real button/disabled behavior.
      if (props.variant === "destructive")
        mocks.confirm = props.onClick as (() => void) | undefined;
      return createElement(original.Button, props);
    },
  };
});
let root: Root | undefined;
let host: HTMLDivElement;
const props = {
  userId: "learner-a",
  userName: "An",
  userEmail: "an@example.invalid",
  isBanned: false,
  isSelf: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const findButton = (text: string, within: ParentNode = document) => {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(found, `button ${text}`).toBeDefined();
  return found!;
};
const click = async (text: string, within: ParentNode = document) => {
  await act(async () => {
    findButton(text, within).click();
  });
};
async function mount(overrides: Partial<typeof props> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(BanToggle, { ...props, ...overrides }));
  });
}
async function reason(value = "  vi phạm  ") {
  const input = dialog().querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function consent() {
  await act(async () => {
    dialog().querySelector<HTMLElement>('[role="checkbox"]')!.click();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm = undefined;
  mocks.impact.mockReset();
  mocks.ban.mockReset();
  mocks.impact.mockResolvedValue({
    ownedCourses: 4,
    pendingOrders: 1,
    taughtCourses: 2,
  });
  mocks.ban.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
});

describe("deactivation impact confirmation", () => {
  it.each(["loading", "error"])(
    "enforces impact readiness inside the handler while %s",
    async (state) => {
      if (state === "loading")
        mocks.impact.mockReturnValue(deferred<UserImpactCounts>().promise);
      else mocks.impact.mockRejectedValue(new Error("impact unavailable"));
      await mount();
      await click("Vô hiệu hoá");
      await reason();
      await consent();
      expect(mocks.confirm).toBeTypeOf("function");
      await act(async () => mocks.confirm!());
      expect(mocks.ban).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );
  it("shows loading without invented zeros and guards the handler as well as the button", async () => {
    const pending = deferred<UserImpactCounts>();
    mocks.impact.mockReturnValue(pending.promise);
    await mount();
    await click("Vô hiệu hoá");
    await reason();
    await consent();
    expect(dialog().textContent).toContain("Đang tải tác động");
    expect(dialog().querySelectorAll("strong")).toHaveLength(0);
    expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
    await act(async () => mocks.confirm!());
    expect(mocks.ban).not.toHaveBeenCalled();
  });
  it("keeps an impact failure nonconfirmable and retries with actual returned counts", async () => {
    mocks.impact.mockRejectedValueOnce(new Error("not available"));
    await mount();
    await click("Vô hiệu hoá");
    await reason();
    await consent();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(
      "Không thể tải tác động",
    );
    expect(dialog().querySelectorAll("strong")).toHaveLength(0);
    expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
    await act(async () => mocks.confirm!());
    expect(mocks.ban).not.toHaveBeenCalled();
    await click("Thử lại", dialog());
    expect(
      [...dialog().querySelectorAll("strong")].map((node) => node.textContent),
    ).toEqual(["4", "1", "2"]);
    await click("Vô hiệu hoá", dialog());
    expect(mocks.ban).toHaveBeenCalledExactlyOnceWith(
      "learner-a",
      true,
      "vi phạm",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("accepts genuine zero counts but still requires both a nonblank reason and consent", async () => {
    mocks.impact.mockResolvedValue({
      ownedCourses: 0,
      pendingOrders: 0,
      taughtCourses: 0,
    });
    await mount();
    await click("Vô hiệu hoá");
    expect(
      [...dialog().querySelectorAll("strong")].map((node) => node.textContent),
    ).toEqual(["0", "0", "0"]);
    await reason("   ");
    await consent();
    expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
    await act(async () => mocks.confirm!());
    expect(mocks.ban).not.toHaveBeenCalled();
    await reason();
    await consent();
    expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
    await consent();
    await click("Vô hiệu hoá", dialog());
    expect(mocks.ban).toHaveBeenCalledOnce();
  });
  it.each(["resolve", "reject"] as const)(
    "ignores an obsolete %s after close and reopen",
    async (outcome) => {
      const old = deferred<UserImpactCounts>();
      const current = deferred<UserImpactCounts>();
      mocks.impact
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise);
      await mount();
      await click("Vô hiệu hoá");
      await click("Huỷ", dialog());
      await click("Vô hiệu hoá");
      await reason();
      await consent();
      await act(async () => {
        if (outcome === "resolve")
          old.resolve({
            ownedCourses: 99,
            pendingOrders: 99,
            taughtCourses: 99,
          });
        else old.reject(new Error("old"));
      });
      expect(dialog().textContent).toContain("Đang tải tác động");
      expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
      expect(dialog().querySelectorAll("strong")).toHaveLength(0);
      await act(async () =>
        current.resolve({
          ownedCourses: 7,
          pendingOrders: 3,
          taughtCourses: 1,
        }),
      );
      expect(
        [...dialog().querySelectorAll("strong")].map(
          (node) => node.textContent,
        ),
      ).toEqual(["7", "3", "1"]);
      expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(false);
    },
  );
  it("closes and resets state when the target identity changes", async () => {
    const old = deferred<UserImpactCounts>();
    mocks.impact.mockReturnValueOnce(old.promise);
    await mount();
    await click("Vô hiệu hoá");
    await reason();
    await consent();
    await act(async () =>
      root!.render(
        createElement(BanToggle, {
          ...props,
          userId: "learner-b",
          userName: "Bình",
        }),
      ),
    );
    expect(dialog()).toBeNull();
    await act(async () =>
      old.resolve({ ownedCourses: 99, pendingOrders: 99, taughtCourses: 99 }),
    );
    await click("Vô hiệu hoá");
    expect(dialog().textContent).toContain("Bình");
    expect(dialog().querySelector("textarea")!.value).toBe("");
    expect(findButton("Vô hiệu hoá", dialog()).disabled).toBe(true);
    expect(mocks.impact).toHaveBeenLastCalledWith("learner-b");
  });
  it("does not replace a ready reopened dialog with a late older success", async () => {
    const old = deferred<UserImpactCounts>();
    mocks.impact.mockReturnValueOnce(old.promise);
    await mount();
    await click("Vô hiệu hoá");
    await click("Huỷ", dialog());
    await click("Vô hiệu hoá");
    await act(async () =>
      old.resolve({ ownedCourses: 99, pendingOrders: 99, taughtCourses: 99 }),
    );
    expect(
      [...dialog().querySelectorAll("strong")].map((node) => node.textContent),
    ).toEqual(["4", "1", "2"]);
    expect(dialog().querySelector("textarea")!.value).toBe("");
    expect(
      dialog().querySelector('[role="checkbox"]')!.getAttribute("aria-checked"),
    ).toBe("false");
  });
  it("prevents duplicate mutation or cancellation while deactivation is pending", async () => {
    const pending = deferred<void>();
    mocks.ban.mockReturnValue(pending.promise);
    await mount();
    await click("Vô hiệu hoá");
    await reason();
    await consent();
    await click("Vô hiệu hoá", dialog());
    expect(findButton("Huỷ", dialog()).disabled).toBe(true);
    expect(findButton("Đang xử lý...", dialog()).disabled).toBe(true);
    await act(async () => mocks.confirm!());
    expect(mocks.ban).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("preserves the dialog and displays action failure without refreshing", async () => {
    mocks.ban.mockRejectedValue(new Error("Không thể lưu"));
    await mount();
    await click("Vô hiệu hoá");
    await reason();
    await consent();
    await click("Vô hiệu hoá", dialog());
    expect(dialog()).not.toBeNull();
    expect(mocks.error).toHaveBeenCalledWith("Không thể lưu");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("retains self protection and reactivation without loading deactivation impact", async () => {
    await mount({ isSelf: true });
    expect(host.textContent).toContain("Tài khoản của bạn");
    expect(host.querySelector("button")).toBeNull();
    await act(async () =>
      root!.render(createElement(BanToggle, { ...props, isBanned: true })),
    );
    await click("Kích hoạt lại");
    await click("Huỷ", dialog());
    expect(mocks.ban).not.toHaveBeenCalled();
    await click("Kích hoạt lại");
    await click("Kích hoạt lại", dialog());
    expect(mocks.ban).toHaveBeenCalledExactlyOnceWith("learner-a", false);
    expect(mocks.impact).not.toHaveBeenCalled();
  });
});
