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

    if (tx.status === "paid") {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    const amountReceived = data.transferAmount || data.amountIn || 0;

    // Check if the transferred amount is equal or greater than the required amount
    if (amountReceived >= tx.amount) {
      // Process payment: update transaction and enroll student, and settle order if present
      await db.transaction(async (txDB) => {
        // Update transaction status
        await txDB.update(studentTransactions)
          .set({ status: "paid" })
          .where(eq(studentTransactions.id, txId));

        // Settle orders table if an order matches txId
        const { orders, orderEvents } = await import("@codi-1/db");
        const matchedOrders = typeof txDB.select === "function"
          ? await txDB
              .select({ id: orders.id })
              .from(orders)
              .where(eq(orders.code, txId))
              .limit(1)
          : [];
        const matchedOrder = matchedOrders[0];

        if (matchedOrder) {
          await txDB.update(orders)
            .set({
              status: "paid",
              receivedAmount: amountReceived,
              paidAt: new Date(),
            })
            .where(eq(orders.id, matchedOrder.id));

          await txDB.insert(orderEvents).values({
            orderId: matchedOrder.id,
            label: "Đã thanh toán thành công",
            actorId: tx.userId,
          });
        }

        // Grant access to the course, avoiding duplicates
        await txDB.insert(studentEnrollments)
          .values({
            userId: tx.userId,
            courseId: tx.courseId,
          })
          .onConflictDoNothing();
      });
      console.log(`Successfully processed transaction ${txId}`);
    } else {
      console.log(`Insufficient amount for ${txId}. Expected ${tx.amount}, got ${amountReceived}`);
      return NextResponse.json({ success: true, message: "Insufficient amount" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
