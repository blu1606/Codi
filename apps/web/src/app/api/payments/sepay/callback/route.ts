import { getSepayConfig } from "@/lib/sepay-config";
import { NextResponse } from "next/server";
import { db } from "@/services";
import { studentTransactions, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    // Authenticate the webhook request
    const config = getSepayConfig();
    if (!config) {
      return NextResponse.json({ success: false, message: "Payments unavailable" }, { status: 503 });
    }
    const apiKey = config.webhookSecret;
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Apikey ${apiKey}`) {
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

    const { orders, orderEvents } = await import("@codi-1/db");
    const { and } = await import("drizzle-orm");

    // Process payment atomically within transaction
    const processResult = await db.transaction(async (txDB) => {
      // 1. Atomically update transaction status if still pending
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

      // 2. Atomically settle orders table if a pending order matches txId
      const updatedOrders = await txDB
        .update(orders)
        .set({
          status: "paid",
          receivedAmount: amountReceived,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(orders.code, txId), eq(orders.status, "pending")))
        .returning({ id: orders.id, totalAmount: orders.totalAmount });

      const matchedOrder = updatedOrders[0];
      if (matchedOrder) {
        await txDB.insert(orderEvents).values({
          orderId: matchedOrder.id,
          label: "Đã thanh toán thành công",
          actorId: tx.userId,
        });
      }

      // 3. Grant access to the course, avoiding duplicates
      await txDB
        .insert(studentEnrollments)
        .values({
          userId: tx.userId,
          courseId: tx.courseId,
        })
        .onConflictDoNothing();

      return { alreadyProcessed: false };
    });

    if (processResult.alreadyProcessed) {
      return NextResponse.json({ success: true, message: "Already processed" });
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
