import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { orders } from "@codi-1/db";
import { auth, db } from "@/services";
import { ENV } from "@/env";
import { getSepayConfig } from "@/lib/sepay-config";
import { POST as sepayCallback } from "@/app/api/payments/sepay/callback/route";

/**
 * Development-only stand-in for the bank: the signed-in owner of an order asks for a simulated SePay transfer,
 * and this route posts it to the real webhook handler with the local webhook secret (which never reaches the
 * browser). The webhook rules decide what the transfer does (paid, underpaid, overpaid, late payment).
 *
 * POST { orderCode: "CODI12345", outcome: "paid" | "underpaid" | "overpaid" | "expire" }
 *  - paid: the amount still due; underpaid: half of it; overpaid: due + 50.000 ₫.
 *  - expire: moves a pending order's payment deadline to now, so the next read expires it (no transfer).
 * Returns the webhook's reply ({ success, message } / { success, underpaid, receivedAmount, targetTotal }).
 * Disabled (404) when demo tools are off (NODE_ENV is production and DEMO_TOOLS is not true; see ENV.DEMO_TOOLS).
 */
const OUTCOMES = new Set(["paid", "underpaid", "overpaid", "expire"]);
const OVERPAY_EXTRA = 50000;

export async function POST(request: NextRequest) {
  if (!ENV.DEMO_TOOLS) return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
  // Reject cross-origin cookie-authenticated writes, including requests without Origin.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Yêu cầu Content-Type application/json" }, { status: 415 });
  }
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    const orderCode = body && typeof body === "object" && "orderCode" in body && typeof body.orderCode === "string"
      ? body.orderCode.trim().toUpperCase() : "";
    const outcome = body && typeof body === "object" && "outcome" in body && typeof body.outcome === "string" ? body.outcome : "";
    if (!/^CODI\d{5}$/.test(orderCode) || !OUTCOMES.has(outcome)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    }

    const [order] = await db
      .select({ id: orders.id, status: orders.status, totalAmount: orders.totalAmount, receivedAmount: orders.receivedAmount })
      .from(orders)
      .where(and(eq(orders.code, orderCode), eq(orders.userId, session.user.id)))
      .limit(1);
    if (!order) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

    if (outcome === "expire") {
      if (order.status !== "pending") return NextResponse.json({ error: "Đơn hàng không còn chờ thanh toán." }, { status: 409 });
      await db.update(orders).set({ paymentDeadline: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
      return NextResponse.json({ success: true, message: "Payment deadline moved to now" });
    }

    const config = getSepayConfig();
    if (!config) {
      return NextResponse.json({ error: "Thanh toán tạm thời chưa khả dụng do thiếu cấu hình cổng thanh toán." }, { status: 503 });
    }
    const due = Math.max(0, order.totalAmount - order.receivedAmount);
    const amount = outcome === "underpaid" ? Math.max(1, Math.round(due / 2))
      : outcome === "overpaid" ? due + OVERPAY_EXTRA
      : due || order.totalAmount;

    const transfer = new Request(new URL("/api/payments/sepay/callback", request.nextUrl.origin), {
      method: "POST",
      headers: { authorization: `Apikey ${config.webhookSecret}`, "content-type": "application/json" },
      body: JSON.stringify({
        id: `SIM-${randomUUID()}`,
        transferType: "in",
        accountNumber: config.receiver.accountNumber,
        content: `${orderCode} thanh toan khoa hoc`,
        transferAmount: amount,
      }),
    });
    const reply = await sepayCallback(transfer);
    return NextResponse.json(await reply.json(), { status: reply.status });
  } catch (error) {
    console.error("Simulated payment failed", error);
    return NextResponse.json({ error: "Không thể mô phỏng thanh toán." }, { status: 500 });
  }
}
