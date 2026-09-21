import { NextRequest, NextResponse } from "next/server";
import { getObjectFromR2 } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get("key");

  if (!key) {
    return new NextResponse("Missing key parameter", { status: 400 });
  }

  try {
    const object = await getObjectFromR2(key);

    if (!object.Body) {
      return new NextResponse("Avatar not found", { status: 404 });
    }

    const contentType = object.ContentType || "image/jpeg";
    const byteArray = await object.Body.transformToByteArray();

    return new NextResponse(Buffer.from(byteArray), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error retrieving avatar from R2:", error);
    return new NextResponse("Failed to load avatar", { status: 500 });
  }
}
