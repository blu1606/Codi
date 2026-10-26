import { jsonBody } from "./lab-support";
import { delay, http } from "msw";
import CheckoutPage from "@/app/checkout/page";
import {
  cancelledOrder, expiredOrder, paidOrder, pendingOrder, underpaidOrder,
} from "@/demo-fixtures/commerce/s06-checkout";
import type { Screen } from "../screen-types";
import { seedMockupCart, seedMockupOrder } from "../mockup-seed";
import { Scripted, asSearchParams, clickButton, fixtureHandlers } from "./lab-support";

const CODE = "CODI20261026-0042";
const order = (body: unknown) => http.get(`/api/orders/${CODE}`, () => jsonBody(body));
const check = (body: unknown) => http.post(`/api/orders/${CODE}/manual-check`, () => jsonBody(body));
const awaiting = pendingOrder();
const route = { pathname: "/checkout", search: { order: CODE } };
const page = () => <CheckoutPage searchParams={asSearchParams({ order: CODE })} />;

export const checkoutScreen: Screen = {
  id: "S06",
  title: "Thanh toán",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/checkout",
  mockupSetup: (codi) => `#/checkout?order=${seedMockupOrder(codi, "pending")}`,
  states: {
    creating: {
      label: "Đang tạo đơn",
      route: { pathname: "/checkout" },
      handlers: [http.post("/api/orders/checkout", async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: () => <CheckoutPage searchParams={asSearchParams({})} />,
    },
    "create-error": {
      label: "Lỗi tạo đơn",
      route: { pathname: "/checkout" },
      handlers: [http.post("/api/orders/checkout", () => jsonBody({ error: "Không thể tạo đơn hàng. Vui lòng thử lại sau." }, { status: 500 })), ...fixtureHandlers],
      render: () => <CheckoutPage searchParams={asSearchParams({})} />,
    },
    "payments-unavailable": {
      label: "Thanh toán không khả dụng",
      route: { pathname: "/checkout" },
      handlers: [http.post("/api/orders/checkout", () => jsonBody({ error: "Thanh toán tạm thời không khả dụng. Vui lòng thử lại sau." }, { status: 503 })), ...fixtureHandlers],
      render: () => <CheckoutPage searchParams={asSearchParams({})} />,
    },
    awaiting: {
      label: "Chờ chuyển khoản",
      route,
      handlers: [order(awaiting), check({ status: "pending", receivedAmount: 0, failReason: null }), ...fixtureHandlers],
      mockupScenario: { paymentOutcome: "success" },
      render: page,
    },
    "manual-check": {
      label: "Đang kiểm tra",
      route,
      handlers: [order(awaiting), http.post(`/api/orders/${CODE}/manual-check`, async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: () => <Scripted script={() => clickButton("Tôi đã chuyển khoản")}>{page()}</Scripted>,
    },
    "still-pending": {
      label: "Chưa nhận được tiền",
      route,
      handlers: [order(awaiting), check({ status: "pending", receivedAmount: 0, failReason: null }), ...fixtureHandlers],
      render: () => <Scripted script={() => clickButton("Tôi đã chuyển khoản")}>{page()}</Scripted>,
    },
    underpaid: {
      label: "Thiếu tiền",
      route,
      handlers: [order(underpaidOrder()), check({ status: "pending", receivedAmount: 1000000, failReason: null }), ...fixtureHandlers],
      mockupScenario: { paymentOutcome: "underpaid" },
      render: page,
    },
    confirmed: {
      label: "Đã thanh toán",
      route,
      handlers: [order(paidOrder()), ...fixtureHandlers],
      mockupScenario: { paymentOutcome: "success" },
      render: page,
    },
    expired: {
      label: "Hết hạn",
      route,
      handlers: [order(expiredOrder()), check({ status: "failed", failReason: "expired", receivedAmount: 0 }), ...fixtureHandlers],
      mockupScenario: { paymentOutcome: "expired" },
      render: page,
    },
    cancelled: {
      label: "Đã huỷ",
      route,
      handlers: [order(cancelledOrder()), ...fixtureHandlers],
      render: page,
    },
  },
};
