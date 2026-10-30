import { delay, http, HttpResponse } from "msw";
import { CartView } from "@/components/cart/cart-view";
import type { CartCourse, CartSummaryData } from "@/lib/cart-contract";
import type { Screen } from "../screen-types";
import { seedMockupCart, seedMockupOrder } from "../mockup-seed";

const courses: CartCourse[] = [
  { id: "c-react", title: "React từ cơ bản đến dự án thực tế", slug: "react-du-an-thuc-te", price: 1290000, level: "Intermediate", category: "Frontend", coverImageUrl: null, lecturerName: "Trần Minh Khoa" },
  { id: "c-node", title: "Node.js & Express xây dựng REST API", slug: "nodejs-express-rest-api", price: 990000, level: "Beginner", category: "Backend", coverImageUrl: null, lecturerName: "Lê Thu Hà" },
];

function summary(overrides: Partial<CartSummaryData> = {}): CartSummaryData {
  const items = overrides.items ?? courses;
  const subtotal = items.reduce((sum, c) => sum + c.price, 0);
  const discount = overrides.discount ?? 0;
  return {
    items, subtotal, discount, total: subtotal - discount,
    voucher: null, removedOwnedTitles: [], pendingOrder: null,
    ...overrides,
  };
}

const cart = (body: CartSummaryData) => http.get("/api/student/cart", () => HttpResponse.json(body));
const cartMutations = [
  http.delete("/api/student/cart", () => HttpResponse.json({ ok: true })),
  http.post("/api/student/cart", () => HttpResponse.json({ ok: true })),
];

export const cartScreen: Screen = {
  id: "S05",
  title: "Giỏ hàng",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/cart",
  mockupSetup: seedMockupCart,
  states: {
    default: {
      label: "Có khoá học",
      route: { pathname: "/cart" },
      handlers: [cart(summary()), ...cartMutations],
      render: () => <CartView />,
    },
    loading: {
      label: "Đang tải",
      route: { pathname: "/cart" },
      handlers: [http.get("/api/student/cart", async () => { await delay("infinite"); return HttpResponse.json({}); })],
      render: () => <CartView />,
    },
    empty: {
      label: "Trống",
      route: { pathname: "/cart" },
      handlers: [cart(summary({ items: [] }))],
      render: () => <CartView />,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: "/cart" },
      handlers: [http.get("/api/student/cart", () => HttpResponse.json({ error: "Không thể tải giỏ hàng." }, { status: 500 }))],
      render: () => <CartView />,
    },
    voucher: {
      label: "Đã áp voucher",
      route: { pathname: "/cart", search: { voucher: "CODI10" } },
      handlers: [
        cart(summary({ discount: 228000, voucher: { code: "CODI10", type: "percent", value: 10, discount: 228000 } })),
        http.post("/api/vouchers/validate", () => HttpResponse.json({ valid: true, voucher: { code: "CODI10", type: "percent", value: 10, discount: 228000 } })),
        ...cartMutations,
      ],
      render: () => <CartView />,
    },
    "voucher-invalid": {
      label: "Voucher không hợp lệ",
      route: { pathname: "/cart" },
      handlers: [
        cart(summary()),
        http.post("/api/vouchers/validate", () => HttpResponse.json({ error: "Mã giảm giá đã hết hạn." }, { status: 400 })),
      ],
      render: () => <CartView />,
    },
    "removed-owned": {
      label: "Đã gỡ khoá đã sở hữu",
      route: { pathname: "/cart" },
      handlers: [cart(summary({ items: courses.slice(1), removedOwnedTitles: [courses[0].title] })), ...cartMutations],
      render: () => <CartView />,
    },
    "pending-order": {
      label: "Có đơn chờ thanh toán",
      route: { pathname: "/cart" },
      handlers: [
        cart(summary({ pendingOrder: { id: 42, code: "CODI-20261026-0042", itemCount: 2, totalAmount: 2280000, createdAt: "2026-10-26T06:30:00.000Z" } })),
        http.post("/api/orders/cancel", () => HttpResponse.json({ ok: true })),
      ],
      render: () => <CartView />,
    },
  },
};
