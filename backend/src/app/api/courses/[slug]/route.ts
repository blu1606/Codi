import { NextResponse } from "next/server";
import { getCourseDetail } from "@/lib/get-course-detail";
import { cachedPublic } from "@/lib/public-course-cache";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: "Đường dẫn khóa học không hợp lệ." }, { status: 400 });
  }
  try {
    // Not-found answers are not cached, so made-up slugs cannot fill the cache.
    const detail = await cachedPublic(`detail:${slug}`, () => getCourseDetail(slug), (found) => found !== null);
    if (!detail) return NextResponse.json({ error: "Không tìm thấy khóa học." }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load course detail", error);
    return NextResponse.json({ error: "Không thể tải thông tin khóa học." }, { status: 500 });
  }
}
