// @vitest-environment happy-dom
import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Header from "../components/header";

const state = vi.hoisted(() => ({ pending: true, signedIn: false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/learn/course/lesson",
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: state.signedIn ? { user: { id: "learner" } } : null,
      isPending: state.pending,
    }),
  },
}));
vi.mock("@/hooks/use-active-role", () => ({
  useActiveRole: () => ({ role: null, loading: false }),
}));
vi.mock("../components/notification-menu", () => ({
  default: () =>
    state.signedIn ? createElement("button", null, "Thông báo") : null,
}));
vi.mock("../components/user-menu", () => ({
  default: () =>
    state.pending
      ? createElement("div", { "aria-label": "Đang tải tài khoản" })
      : createElement(
          "button",
          null,
          state.signedIn ? "Tài khoản" : "Đăng nhập",
        ),
}));
vi.mock("../components/mode-toggle", () => ({ ModeToggle: () => null }));
vi.mock("../components/brand-logo", () => ({ default: () => "Codi" }));
vi.mock("../components/cart-nav-button", () => ({ default: () => null }));
vi.mock("@codi-1/ui/components/sheet", () => ({ Sheet: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

it.each([false, true])(
  "hydrates when the session resolves before the header (signed in: %s)",
  async (signedIn) => {
    state.pending = true;
    state.signedIn = false;
    const host = document.createElement("div");
    host.innerHTML = renderToString(createElement(Header));
    document.body.append(host);
    expect(
      host.querySelector('[aria-label="Đang tải tài khoản"]'),
    ).toBeTruthy();
    state.pending = false;
    state.signedIn = signedIn;
    const recovered = vi.fn();
    await act(async () => {
      root = hydrateRoot(host, createElement(Header), {
        onRecoverableError: recovered,
      });
    });
    expect(recovered).not.toHaveBeenCalled();
    expect(host.textContent).toContain(signedIn ? "Tài khoản" : "Đăng nhập");
    expect(host.querySelector('[aria-label="Đang tải tài khoản"]')).toBeNull();
  },
);
