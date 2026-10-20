import { timingSafeEqual } from "node:crypto";
import { getSepayConfig } from "@/lib/sepay-config";
import { NextResponse } from "next/server";
import { db } from "@/services";
import { orders, orderEvents, orderItems, vouchers } from "@codi-1/db";
import { studentTransactions, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { and, eq, isNull, or, sql } from "drizzle-orm";

function verifyApiKey(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = `Apikey ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export async function POST(req: Request) {
  try {
    // Authenticate the webhook request
    const config = getSepayConfig();
    if (!config) {
      return NextResponse.json({ success: false, message: "Payments unavailable" }, { status: 503 });
    }
    const apiKey = config.webhookSecret;
    const authHeader = req.headers.get("authorization");
    if (!verifyApiKey(authHeader, apiKey)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();

    // Verify it's an incoming transfer
    if (data.transferType !== "in") {
      return NextResponse.json({ success: true, message: "Ignored outbound transfer" });
    }

    // Verify it's for the correct account
    const expectedAccount = config.receiver.accountNumber;
    if (data.accountNumber !== expectedAccount) {
      return NextResponse.json({ success: true, message: "Ignored transfer to different account" });
    }

    // SePay sends the transfer content in data.content or data.description
    const content = data.content || data.description || "";

    // Find our specific transaction ID format (e.g., CODI12345)
    const match = content.match(/CODI\d{5}/i);

    if (!match) {
      console.log("No valid CODI transaction ID found in content:", content);
      return NextResponse.json({ success: true, message: "No matching ID, ignored" });
    }

    const txId = match[0].toUpperCase();

    // Find the transaction in DB
    const [tx] = await db.select().from(studentTransactions).where(eq(studentTransactions.id, txId)).limit(1);

    if (!tx) {
      console.log("Transaction not found for ID:", txId);
      return NextResponse.json({ success: true, message: "Transaction not found" });
    }

    const amountReceived = data.transferAmount || data.amountIn || 0;

    // Check if the transferred amount is equal or greater than the required amount
    if (amountReceived < tx.amount) {
      console.log(`Insufficient amount for ${txId}. Expected ${tx.amount}, got ${amountReceived}`);
      return NextResponse.json({ success: true, message: "Insufficient amount" });
    }

    // Process payment atomically within transaction
    const processResult = await db.transaction(async (txDB) => {
      // 1. Check if there is an associated order in the `orders` table
      const [existingOrder] = await txDB
        .select({ id: orders.id, status: orders.status, voucherId: orders.voucherId })
        .from(orders)
        .where(eq(orders.code, txId))
        .limit(1);

      // If an order exists for this code, but it is not pending (e.g. cancelled/expired/refunded),
      // do NOT settle as paid and do NOT grant enrollment. Mark transaction as failed/needs-reconciliation.
      if (existingOrder && existingOrder.status !== "pending") {
        await txDB
          .update(studentTransactions)
          .set({ status: "failed" })
          .where(and(eq(studentTransactions.id, txId), eq(studentTransactions.status, "pending")));

        return { orderNotPending: true, orderStatus: existingOrder.status };
      }

      // 2. Atomically update transaction status if still pending
      const updatedTx = await txDB
        .update(studentTransactions)
        .set({ status: "paid" })
        .where(
          and(
            eq(studentTransactions.id, txId),
            eq(studentTransactions.status, "pending")
          )
        )
        .returning({ id: studentTransactions.id });

      // If already processed by a concurrent webhook request, exit early
      if (updatedTx.length === 0) {
        return { alreadyProcessed: true };
      }

      let courseIdsToEnroll: string[] = [tx.courseId];

      // 3. Atomically settle orders table if a pending order matches txId
      if (existingOrder && existingOrder.status === "pending") {
        const updatedOrders = await txDB
          .update(orders)
          .set({
            status: "paid",
            receivedAmount: amountReceived,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(orders.code, txId), eq(orders.status, "pending")))
          .returning({ id: orders.id, totalAmount: orders.totalAmount, voucherId: orders.voucherId });

        const matchedOrder = updatedOrders[0];
        if (matchedOrder) {
          await txDB.insert(orderEvents).values({
            orderId: matchedOrder.id,
            label: "Đã thanh toán thành công",
            actorId: tx.userId,
          });

          // Fetch all courses in order_items (fixes Blocking Point 1)
          const items = await txDB
            .select({ courseId: orderItems.courseId })
            .from(orderItems)
            .where(eq(orderItems.orderId, matchedOrder.id));

          if (items.length > 0) {
            courseIdsToEnroll = items.map((it) => it.courseId);
          }

          // Atomically increment voucher used_count if a voucher was applied (fixes Blocking Point 2)
          if (matchedOrder.voucherId) {
            const voucherRes = await txDB
              .update(vouchers)
              .set({
                usedCount: sql`${vouchers.usedCount} + 1`,
              })
              .where(
                and(
                  eq(vouchers.id, matchedOrder.voucherId),
                  or(
                    isNull(vouchers.usageLimit),
                    sql`${vouchers.usedCount} < ${vouchers.usageLimit}`,
                  ),
                ),
              )
              .returning({ id: vouchers.id });

            if (voucherRes.length === 0) {
              // Usage limit was reached concurrently - mark order for reconciliation
              await txDB
                .update(orders)
                .set({ needsReconciliation: true })
                .where(eq(orders.id, matchedOrder.id));

              await txDB.insert(orderEvents).values({
                orderId: matchedOrder.id,
                label: "Mã giảm giá vượt hạn mức sử dụng khi thanh toán (Cần đối soát)",
                actorId: tx.userId,
              });
            }
          }
        } else {
          // Order was concurrently modified or not pending, stop enrollment
          return { orderNotPending: true };
        }
      }

      // 4. Grant access to all courses in the order, avoiding duplicates
      for (const cId of courseIdsToEnroll) {
        await txDB
          .insert(studentEnrollments)
          .values({
            userId: tx.userId,
            courseId: cId,
          })
          .onConflictDoNothing();
      }

      return { success: true };
    });

    if (processResult.alreadyProcessed) {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    if (processResult.orderNotPending) {
      console.warn(`Order ${txId} is not in pending state (was ${processResult.orderStatus ?? "non-pending"}). Ignored enrollment, marked for reconciliation.`);
      return NextResponse.json({ success: true, message: "Order not pending, marked for reconciliation" });
    }

    console.log(`Successfully processed transaction ${txId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
