import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/services";

export async function PATCH(request: NextRequest) {
  try {
    const reqHeaders = await headers();
    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Họ và tên không được để trống" },
        { status: 400 }
      );
    }

    // Update user profile via Better Auth API
    await auth.api.updateUser({
      body: {
        name: name.trim(),
      },
      headers: reqHeaders,
    });

    return NextResponse.json({
      success: true,
      message: "Cập nhật hồ sơ thành công",
      user: {
        id: session.user.id,
        name: name.trim(),
        email: session.user.email,
      },
    });
  } catch (error: any) {
    console.error("Lỗi cập nhật profile:", error);
    return NextResponse.json(
      { error: error?.message || "Đã xảy ra lỗi khi cập nhật hồ sơ" },
      { status: 500 }
    );
  }
}
