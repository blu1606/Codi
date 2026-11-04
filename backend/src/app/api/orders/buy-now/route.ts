import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ForbiddenError } from "@codi-1/auth";
import { auth, db } from "@/services";
import { createBuyNowOrder, BuyNowError } from "@/lib/buy-now";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const courseId = body?.courseId;

    if (!courseId || typeof courseId !== "string" || !courseId.trim()) {
      return NextResponse.json({ error: "Mã khóa học không hợp lệ" }, { status: 400 });
    }

    const result = await createBuyNowOrder(db, session.user.id, courseId.trim());
    return NextResponse.json(result, { status: result.isExisting ? 200 : 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Chỉ tài khoản học viên mới mua được khoá học." }, { status: 403 });
    }
    if (error instanceof BuyNowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Buy now order error:", error);
    return NextResponse.json({ error: "Không thể xử lý mua ngay. Vui lòng thử lại." }, { status: 500 });
  }
}
