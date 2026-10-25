// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartView } from "./cart-view";

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/cart",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) =>
    createElement("a", { ...props, href: typeof href === "object" ? href.pathname : href }, children),
}));

vi.mock("next/image", () => ({
  default: (props: any) => createElement("img", props),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mockRouter.push.mockReset();
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

describe("CartView guest empty state (#178)", () => {
  it("renders empty cart for unauthenticated guest on 401 without redirecting to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Vui lòng đăng nhập để xem giỏ hàng" }),
      }),
    );

    await act(async () => {
      root.render(createElement(CartView));
    });

    // Wait for async fetchCart effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Should NOT redirect to /login
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining("/login"));

    // Should render empty cart view
    expect(host.textContent).toContain("Giỏ hàng");
    expect(host.textContent).toContain("Giỏ hàng của bạn đang trống");
    expect(host.textContent).toContain("Khám phá khoá học");
    expect(host.textContent).toContain("Hỏi AI Codi");
  });

  it("renders cart items when student has courses in cart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "course-1",
              title: "Lập trình TypeScript",
              slug: "lap-trinh-typescript",
              price: 500000,
              level: "Beginner",
              thumbnail: "/thumb.png",
              lecturerName: "Nguyễn Văn A",
            },
          ],
          subtotal: 500000,
          discount: 0,
          total: 500000,
          voucher: null,
          removedOwnedTitles: [],
          pendingOrder: null,
        }),
      }),
    );

    await act(async () => {
      root.render(createElement(CartView));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(host.textContent).toContain("Lập trình TypeScript");
    expect(host.textContent).toContain("Thanh toán");
  });
});
