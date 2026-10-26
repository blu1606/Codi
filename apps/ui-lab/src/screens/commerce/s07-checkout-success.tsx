import { jsonBody } from "./lab-support";
import { delay, http } from "msw";
import CheckoutSuccessPage from "@/app/checkout/success/page";
import { pendingOrder, successOrder } from "@/demo-fixtures/commerce/s06-checkout";
import type { Screen } from "../screen-types";
import { seedMockupCart, seedMockupOrder } from "../mockup-seed";
import { asSearchParams, fixtureHandlers } from "./lab-support";

const CODE = "CODI20261026-0042";
const route = { pathname: "/checkout/success", search: { order: CODE } };
const page = () => <CheckoutSuccessPage searchParams={asSearchParams({ order: CODE })} />;

export const checkoutSuccessScreen: Screen = {
  id: "S07",
  title: "Thanh toán thành công",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/checkout/success",
  mockupSetup: (codi) => `#/checkout/success?order=${seedMockupOrder(codi, "paid")}`,
  states: {
    paid: {
      label: "Thành công",
      route,
      handlers: [http.get(`/api/orders/${CODE}`, () => jsonBody(successOrder())), ...fixtureHandlers],
      render: page,
    },
    "not-confirmed": {
      label: "Chưa xác nhận",
      route,
      handlers: [http.get(`/api/orders/${CODE}`, () => jsonBody(pendingOrder())), ...fixtureHandlers],
      render: page,
    },
    loading: {
      label: "Đang tải",
      route,
      handlers: [http.get(`/api/orders/${CODE}`, async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: page,
    },
  },
};
