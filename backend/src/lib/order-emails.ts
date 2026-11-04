import { createMailer, type Mailer } from "@codi-1/auth";
import { orders, orderItems, payments, vouchers } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { and, asc, desc, eq } from "drizzle-orm";

import { ENV } from "@/env.server";
import { db } from "@/services";
import {
  getInvoiceEmailHtml,
  getPurchaseConfirmationEmailHtml,
  invoiceSubject,
  purchaseConfirmationSubject,
  type OrderEmailData,
} from "./order-email-templates";

let cachedMailer: Mailer | null | undefined;
function defaultMailer(): Mailer | null {
  if (cachedMailer === undefined) cachedMailer = createMailer({ RESEND_API_KEY: ENV.RESEND_API_KEY, EMAIL_FROM: ENV.EMAIL_FROM });
  return cachedMailer;
}

export async function loadOrderEmailData(orderId: number, database = db): Promise<OrderEmailData | null> {
  const [order] = await database
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      totalAmount: orders.totalAmount,
      receivedAmount: orders.receivedAmount,
      paidAt: orders.paidAt,
      buyerName: user.name,
      buyerEmail: user.email,
      voucherCode: vouchers.code,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .leftJoin(vouchers, eq(vouchers.id, orders.voucherId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.status !== "paid") return null;

  const items = await database
    .select({ courseId: orderItems.courseId, title: orderItems.courseTitle, unitPrice: orderItems.unitPrice })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  const [settlingPayment] = await database
    .select({ transactionCode: payments.transactionCode })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "success")))
    .orderBy(desc(payments.id))
    .limit(1);

  return {
    appUrl: ENV.BETTER_AUTH_URL,
    orderId: order.id,
    orderCode: order.code,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    items,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    voucherCode: order.voucherCode ?? null,
    totalAmount: order.totalAmount,
    receivedAmount: order.receivedAmount,
    paidAt: order.paidAt ?? new Date(),
    transactionCode: settlingPayment?.transactionCode ?? null,
  };
}

/**
 * Sends the purchase confirmation and the invoice for an order that has just become paid.
 * Call only after the settling transaction commits. Delivery problems are logged, never thrown:
 * the order is already paid and enrolled, so email must not turn a settled payment into an error.
 */
export async function sendOrderPaidEmails(orderId: number, mailer: Mailer | null = defaultMailer()): Promise<void> {
  try {
    const data = await loadOrderEmailData(orderId);
    if (!data) return;
    if (!mailer) {
      console.log(`[Order email] ${data.orderCode}: no RESEND_API_KEY, skipped purchase and invoice emails to ${data.buyerEmail}`);
      return;
    }
    const results = await Promise.allSettled([
      mailer.send({ to: data.buyerEmail, subject: purchaseConfirmationSubject(data), html: getPurchaseConfirmationEmailHtml(data) }),
      mailer.send({ to: data.buyerEmail, subject: invoiceSubject(data), html: getInvoiceEmailHtml(data) }),
    ]);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`[Order email] ${data.orderCode}: ${index === 0 ? "purchase" : "invoice"} email failed:`, result.reason);
      }
    });
  } catch (error) {
    console.error(`[Order email] order ${orderId}: could not send paid-order emails:`, error);
  }
}
