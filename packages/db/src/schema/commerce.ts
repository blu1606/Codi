import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";

// UC-10 Purchase Course, UC-11 Confirm Payment, UC-42 View Orders and Transactions.
// The cart itself is student_cart (student-profile.ts). student_transactions is the legacy
// one-row-per-course payment record; new checkout code writes orders/order_items/payments.

// Shared with the legacy student_transactions table (re-exported from student-profile.ts).
export const orderStatus = pgEnum("student_order_status", ["pending", "paid", "failed", "cancelled", "refunded"]);

export const voucherType = pgEnum("voucher_type", ["percent", "amount"]);

// One voucher per order, whole cart, no stacking / per-course scope / per-user limit (decision D14).
export const vouchers = pgTable.withRLS("vouchers", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: voucherType("type").notNull(),
  // percent: 1..100 · amount: VND
  value: integer("value").notNull(),
  minOrderAmount: integer("min_order_amount").default(0).notNull(),
  maxDiscountAmount: integer("max_discount_amount"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").default(0).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("vouchers_value_check", sql`${table.value} > 0 AND (${table.type} <> 'percent' OR ${table.value} <= 100)`),
  check("vouchers_min_order_check", sql`${table.minOrderAmount} >= 0`),
  check("vouchers_usage_check", sql`${table.usedCount} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usageLimit} > 0)`),
  check("vouchers_window_check", sql`${table.startsAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`),
]);

// Order status uses the existing student_order_status enum: pending | paid | failed | cancelled | refunded
// (STATE-MACHINES.md §5). Expiry is failed + fail_reason = 'expired', not a separate status.
export const orders = pgTable.withRLS("orders", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  // CODI + 5 digits — also the bank-transfer content the webhook matches on.
  code: text("code").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id),
  voucherId: bigint("voucher_id", { mode: "number" }).references(() => vouchers.id),
  subtotal: integer("subtotal").notNull(),
  discountAmount: integer("discount_amount").default(0).notNull(),
  totalAmount: integer("total_amount").notNull(),
  // Sum of matched bank transfers; < total means underpaid, > total means overpaid (decision D3).
  receivedAmount: integer("received_amount").default(0).notNull(),
  currency: text("currency").default("VND").notNull(),
  status: orderStatus("status").default("pending").notNull(),
  failReason: text("fail_reason"),
  // "Mua ngay" orders are single-course and never touch the cart (decision D4).
  isBuyNow: boolean("is_buy_now").default(false).notNull(),
  // "Tạo mã mới" after expiry creates a new order that replaces the failed one.
  replacesOrderId: bigint("replaces_order_id", { mode: "number" }),
  // Underpaid-then-expired, overpaid, or late payment for courses already owned (decisions D2/D3).
  needsReconciliation: boolean("needs_reconciliation").default(false).notNull(),
  paymentDeadline: timestamp("payment_deadline", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (table) => [
  index("orders_user_idx").on(table.userId),
  index("orders_status_created_idx").on(table.status, table.createdAt),
  check("orders_amounts_check", sql`${table.subtotal} >= 0 AND ${table.discountAmount} >= 0 AND ${table.totalAmount} = ${table.subtotal} - ${table.discountAmount} AND ${table.totalAmount} >= 0 AND ${table.receivedAmount} >= 0`),
  check("orders_paid_check", sql`${table.status} <> 'paid' OR ${table.paidAt} IS NOT NULL`),
  check("orders_buy_now_voucher_check", sql`NOT ${table.isBuyNow} OR ${table.voucherId} IS NULL`),
]);

export const orderItems = pgTable.withRLS("order_items", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id),
  // Copied, not joined: an order must read correctly after the course is renamed or repriced.
  courseTitle: text("course_title").notNull(),
  unitPrice: integer("unit_price").notNull(),
}, (table) => [
  uniqueIndex("order_items_order_course_idx").on(table.orderId, table.courseId),
  index("order_items_course_idx").on(table.courseId),
  check("order_items_price_check", sql`${table.unitPrice} >= 0`),
]);

// Timeline shown in the admin order drawer and on checkout ("Đã tạo đơn", "Đã nhận tiền", ...).
export const orderEvents = pgTable.withRLS("order_events", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  actorId: text("actor_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("order_events_order_idx").on(table.orderId, table.createdAt)]);

export const paymentStatus = pgEnum("payment_status", ["pending", "success", "failed"]);

// One row per bank transfer / webhook call (SePay). Several rows may belong to one underpaid order.
export const payments = pgTable.withRLS("payments", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id, { onDelete: "set null" }),
  // Provider transaction id; unique when present so a replayed webhook is idempotent.
  transactionCode: text("transaction_code"),
  method: text("method").default("bank_transfer").notNull(),
  amount: integer("amount").notNull(),
  // Raw transfer content as received; unmatched content leaves orderId null (manual support).
  transferContent: text("transfer_content"),
  status: paymentStatus("status").default("pending").notNull(),
  providerResponse: text("provider_response"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("payments_transaction_code_idx").on(table.transactionCode).where(sql`${table.transactionCode} IS NOT NULL`),
  index("payments_order_idx").on(table.orderId),
  check("payments_amount_check", sql`${table.amount} >= 0`),
]);
