// @vitest-environment happy-dom

import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CartNavButton from "./cart-nav-button";
import { canRequestForSession, endSession } from "@/lib/session-requests";

type Session = { session: { id: string }; user: { id: string; name: string; role?: string } };
const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: auth.session }) } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let serial = 0;
const response = (count: number) => ({ ok: true, json: async () => ({ count }) });
const CartButton = CartNavButton as ComponentType<{ mobile?: boolean }>;
const render = async (both = false) => {
  await act(async () => root.render(createElement("div", null,
    createElement(CartButton), both && createElement(CartButton, { mobile: true }))));
};
const update = async () => { await act(async () => window.dispatchEvent(new Event("codi:cart-updated"))); };
const signal = (index = 0) => fetchMock.mock.calls[index][1].signal as AbortSignal;
const label = () => host.querySelector("a")?.getAttribute("aria-label");

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  auth.session = { session: { id: `cart-session-${++serial}` }, user: { id: "learner", name: "Học viên" } };
  fetchMock = vi.fn().mockResolvedValue(response(3));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cart requests across logout", () => {
  it.each(["pending", "succeeded"])("does not restart desktop/mobile carts when a concurrent logout has %s", async (state) => {
    await render(true);
    const sessionId = auth.session!.session.id;
    const first = deferred<{ error: unknown }>();
    const second = deferred<{ error: unknown }>();
    let firstResult!: Promise<{ error: unknown }>;
    let secondResult!: Promise<{ error: unknown }>;
    await act(async () => {
      firstResult = endSession(sessionId, () => first.promise);
      secondResult = endSession(sessionId, () => second.promise);
    });
    expect(signal(0).aborted).toBe(true);
    expect(signal(1).aborted).toBe(true);
    if (state === "succeeded") {
      await act(async () => { second.resolve({ error: null }); await secondResult; });
    }
    await act(async () => { first.resolve({ error: { status: 500 } }); await firstResult; });
    await update();
    await act(async () => root.render(null));
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (state === "pending") {
      await act(async () => { second.resolve({ error: null }); await secondResult; });
    }
    await update();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch again when the same user's session object is refreshed", async () => {
    await render();
    expect(label()).toBe("Giỏ hàng, 3 khoá học");
    auth.session = { ...auth.session!, user: { ...auth.session!.user, name: "Tên mới" } };
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts desktop and mobile requests before logout starts; blocks updates and remounts with the cached session", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const logout = deferred<{ error: null }>();
    let completion!: Promise<{ error: null }>;
    await act(async () => {
      completion = endSession(auth.session!.session.id, () => {
        expect(signal(0).aborted).toBe(true);
        expect(signal(1).aborted).toBe(true);
        return logout.promise;
      });
    });
    await update();
    await act(async () => root.render(null));
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { logout.resolve({ error: null }); await completion; });
    await update();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Even a transport that finishes after abort must not update the badge.
    await act(async () => pending.resolve(response(99)));
    expect(label()).toBe("Giỏ hàng, 0 khoá học");
    auth.session = null;
    await render(true);
    expect(host.querySelector("a")).toBeNull();
  });

  it.each(["http", "network"])("restores requests after %s logout failure and allows retry", async (failure) => {
    await render();
    const sessionId = auth.session!.session.id;
    await act(async () => {
      if (failure === "http") {
        const result = await endSession(sessionId, async () => ({ error: { status: 500 } }));
        expect(result.error?.status).toBe(500);
      } else {
        await expect(endSession(sessionId, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
      }
    });
    expect(canRequestForSession(sessionId)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(label()).toBe("Giỏ hàng, 3 khoá học");
    await act(async () => { await endSession(sessionId, async () => ({ error: null })); });
    await update();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a new session for the same user after successful logout", async () => {
    await render();
    await act(async () => { await endSession(auth.session!.session.id, async () => ({ error: null })); });
    auth.session = { ...auth.session!, session: { id: "fresh-login" } };
    fetchMock.mockResolvedValue(response(7));
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(label()).toBe("Giỏ hàng, 7 khoá học");
  });

  it("ignores stale responses when switching users and replacing cart requests", async () => {
    const old = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(old.promise);
    await render();
    auth.session = { session: { id: "other-session" }, user: { id: "other-user", name: "Người khác" } };
    fetchMock.mockResolvedValue(response(8));
    await render();
    expect(signal(0).aborted).toBe(true);
    await act(async () => old.resolve(response(99)));
    expect(label()).toBe("Giỏ hàng, 8 khoá học");
    const firstUpdate = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(firstUpdate.promise).mockResolvedValue(response(9));
    await update();
    await update();
    expect(signal(2).aborted).toBe(true);
    await act(async () => firstUpdate.resolve(response(77)));
    expect(label()).toBe("Giỏ hàng, 9 khoá học");
  });

  it("aborts on unmount and removes the cart update listener", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    await render();
    await act(async () => root.render(null));
    expect(signal().aborted).toBe(true);
    await update();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels before full navigation and refreshes when restored from the back-forward cache", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockReturnValueOnce(pending.promise);
    await render();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(signal().aborted).toBe(true);
    await act(async () => pending.reject(new TypeError("Failed to fetch")));
    expect(log).not.toHaveBeenCalled();
    await update();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event("pageshow")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(label()).toBe("Giỏ hàng, 3 khoá học");
  });

  it.each([401, 500])("reports an actual cart HTTP %s instead of hiding it", async (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status });
    await render();
    expect(label()).toBe("Giỏ hàng, không tải được số khoá học");
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: `Cart request failed (${status})` }));
  });

  it.each([null, "lecturer", "admin"])("does not request a cart for guest/non-learner: %s", async (role) => {
    if (role === null) auth.session = null;
    else auth.session!.user.role = role;
    await render();
    await update();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector("a")).toBeNull();
  });
});
