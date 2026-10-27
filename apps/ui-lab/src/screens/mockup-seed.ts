import type { MockupCodi } from "./screen-types";

// Ids from docs/mockup/js/data.js that the seeded learner does not own yet.
const CART_COURSES = ["course-node-001", "course-python-001"];
const PRICES: Record<string, number> = { "course-node-001": 1290000, "course-python-001": 990000 };

/** Puts two courses in the mockup learner's cart. */
export function seedMockupCart(codi: MockupCodi) {
  const uid = codi.state.currentUserId;
  if (uid) codi.state.carts[uid] = [...CART_COURSES];
}

/** Adds an order for the mockup learner and returns its id, for /checkout?order=… pages. */
export function seedMockupOrder(codi: MockupCodi, status: "pending" | "paid") {
  const id = `order-lab-${status}`;
  const orders = codi.state.db.orders;
  const at = new Date().toISOString();
  const items = CART_COURSES.map((courseId) => ({ courseId, price: PRICES[courseId] }));
  const total = items.reduce((sum, i) => sum + i.price, 0);
  const order = {
    id, code: status === "paid" ? "CODI20481" : "CODI20480", userId: codi.state.currentUserId, items,
    voucherCode: null, discount: 0, total, method: "Chuyển khoản ngân hàng", status,
    createdAt: at, paidAt: status === "paid" ? at : null, content: "CODI20480",
    timeline: [{ at, label: "Đã tạo đơn" }],
  };
  const index = orders.findIndex((o) => o.id === id);
  if (index >= 0) orders[index] = order;
  else orders.push(order);
  return id;
}
