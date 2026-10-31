import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { githubProfileCorrectionsSchema } from "@/lib/github-profile-analysis-contract";
import {
  createGithubProfileStore,
  GithubProfileStoreError,
} from "@/lib/github-profile-store";
import { auth, db } from "@/services";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.strictObject({
  corrections: githubProfileCorrectionsSchema,
});
const failure = (code: string, error: string, status: number) =>
  NextResponse.json({ code, error }, { status, headers });
async function readBody(request: NextRequest) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("invalid_body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 64_000) throw new Error("body_limit");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export async function PATCH(request: NextRequest) {
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", "Yêu cầu không hợp lệ.", 403);
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (
      !session?.user ||
      !(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER)
    )
      return failure(
        "unauthorized",
        "Vui lòng đăng nhập bằng tài khoản học viên.",
        401,
      );
    let input: unknown;
    try {
      input = await readBody(request);
    } catch {
      return failure("invalid_input", "Dữ liệu chỉnh sửa không hợp lệ.", 400);
    }
    const parsed = bodySchema.safeParse(input);
    if (!parsed.success)
      return failure("invalid_input", "Dữ liệu chỉnh sửa không hợp lệ.", 400);
    const saved = await createGithubProfileStore(db).saveCorrections(
      session.user.id,
      parsed.data.corrections,
    );
    return NextResponse.json({ saved: true, ...saved }, { headers });
  } catch (error) {
    if (error instanceof GithubProfileStoreError) {
      if (error.code === "profile_not_found")
        return failure(
          "profile_not_found",
          "Chưa có hồ sơ GitHub để chỉnh sửa.",
          404,
        );
      if (error.code === "invalid_input")
        return failure(
          "invalid_input",
          "Chỉnh sửa không khớp với hồ sơ hiện tại.",
          400,
        );
      if (error.code === "active_request")
        return failure(
          "active_request",
          "Một lượt phân tích đang chạy. Vui lòng thử lại sau khi lượt đó hoàn tất.",
          409,
        );
    }
    return failure("store_failed", "Chưa lưu được chỉnh sửa hồ sơ.", 503);
  }
}
