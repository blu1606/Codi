import { createMailer, type Mailer } from "@codi-1/auth";
import { orders, orderItems, payments, vouchers } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { and, asc, desc, eq } from "drizzle-orm";

import { ENV } from "@/env.server";
import {
  adminOrderUrl,
  DISCORD_COLOR,
  type DiscordEvent,
  type DiscordField,
  formatVnd,
  maskEmail,
  notifyDiscord,
} from "@/lib/discord-notify";
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

/** Builds the team's "new sale" Discord message; an overpaid order is flagged because the surplus must be refunded. */
export function orderPaidDiscordEvent(data: OrderEmailData, simulated = false): DiscordEvent {
  const overpaid = data.receivedAmount - data.totalAmount;
  const fields: DiscordField[] = [
    { name: "Số tiền", value: data.totalAmount === 0 ? "Miễn phí" : formatVnd(data.totalAmount), inline: true },
    { name: "Thanh toán", value: data.totalAmount === 0 ? "Đơn 0 ₫" : `SePay${data.transactionCode ? ` · ${data.transactionCode}` : ""}`, inline: true },
    { name: "Người mua", value: maskEmail(data.buyerEmail), inline: true },
    { name: `Khoá học (${data.items.length})`, value: data.items.map((item) => `• ${item.title} — ${formatVnd(item.unitPrice)}`).join("\n") },
  ];
  if (data.voucherCode) fields.push({ name: "Mã giảm giá", value: `${data.voucherCode} (−${formatVnd(data.discountAmount)})`, inline: true });
  if (overpaid > 0) fields.push({ name: "⚠️ Chuyển thừa", value: `${formatVnd(overpaid)} — cần hoàn lại cho người mua`, inline: true });
  return {
    title: `💰 Đơn mới ${data.orderCode} · ${formatVnd(data.totalAmount)}`,
    color: overpaid > 0 ? DISCORD_COLOR.attention : DISCORD_COLOR.sale,
    url: adminOrderUrl(data.orderId),
    fields,
    simulated,
  };
}

/**
 * Everything that follows an order becoming paid: the buyer's confirmation and invoice emails and the team's Discord
 * message. Call after the settling transaction commits and do not await it; failures are logged, never thrown.
 */
export async function announceOrderPaid(orderId: number, { simulated = false } = {}): Promise<void> {
  await Promise.allSettled([
    sendOrderPaidEmails(orderId),
    (async () => {
      const data = await loadOrderEmailData(orderId);
      if (data) await notifyDiscord(orderPaidDiscordEvent(data, simulated));
    })().catch((error) => console.error(`[Discord] order ${orderId}: could not build the sale message:`, error)),
  ]);
}
