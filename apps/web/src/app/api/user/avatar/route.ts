import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/services";
import { uploadToR2 } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const reqHeaders = await headers();
    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const contentType = request.headers.get("content-type") || "";

    let finalImageUrl = "";

    if (contentType.includes("multipart/form-data")) {
      // Direct file upload from user
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { error: "Vui lòng chọn file ảnh để tải lên" },
          { status: 400 }
        );
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Kích thước ảnh không được vượt quá 5MB" },
          { status: 400 }
        );
      }

      // Validate MIME type
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: "Định dạng file không được hỗ trợ. Vui lòng chọn file JPEG, PNG, WebP hoặc SVG." },
          { status: 400 }
        );
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const key = `avatars/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const result = await uploadToR2({
        buffer,
        key,
        contentType: file.type,
      });

      finalImageUrl = result.url;
    } else {
      // JSON payload for preset or sync URL
      const body = await request.json();
      const { presetUrl, syncUrl } = body;
      const targetUrl = presetUrl || syncUrl;

      if (!targetUrl) {
        return NextResponse.json(
          { error: "Thiếu đường dẫn ảnh để tải lên R2" },
          { status: 400 }
        );
      }

      // Fetch the remote image to push to R2
      const imgRes = await fetch(targetUrl);
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: "Không thể tải ảnh nguồn để lưu vào R2" },
          { status: 400 }
        );
      }

      const mime = imgRes.headers.get("content-type") || "image/svg+xml";
      const ext = mime.includes("svg") ? "svg" : mime.includes("png") ? "png" : "jpg";
      const key = `avatars/${userId}/${Date.now()}-preset.${ext}`;
      const buffer = Buffer.from(await imgRes.arrayBuffer());

      const result = await uploadToR2({
        buffer,
        key,
        contentType: mime,
      });

      finalImageUrl = result.url;
    }

    // Update user image in Database & Auth Session
    await auth.api.updateUser({
      body: {
        image: finalImageUrl,
      },
      headers: reqHeaders,
    });

    return NextResponse.json({
      success: true,
      imageUrl: finalImageUrl,
      message: "Cập nhật ảnh đại diện lên Cloudflare R2 thành công!",
    });
  } catch (error: any) {
    console.error("Lỗi upload avatar lên R2:", error);
    return NextResponse.json(
      { error: error?.message || "Đã xảy ra lỗi khi lưu ảnh lên Cloudflare R2" },
      { status: 500 }
    );
  }
}
