import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth, db } from "@/services";
import { aiInteractionLogs } from "@codi-1/db";
import { advisorFeedbackCommand } from "@/lib/ai-advisor-contract";
import { verifyGuestFeedbackToken } from "@/lib/ai-advisor-service";
import { ENV } from "@/env";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    }

    const parsed = advisorFeedbackCommand.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu phản hồi không hợp lệ" }, { status: 400 });
    }

    const { logId, feedbackToken, vote, reason } = parsed.data;

    // If logId exists, verify ownership and requestType, then append feedback without clobbering diagnostics
    if (logId) {
      const [existing] = await db
        .select({
          id: aiInteractionLogs.id,
          userId: aiInteractionLogs.userId,
          requestType: aiInteractionLogs.requestType,
          errorMessage: aiInteractionLogs.errorMessage,
          createdAt: aiInteractionLogs.createdAt,
        })
        .from(aiInteractionLogs)
        .where(eq(aiInteractionLogs.id, logId));

      if (!existing) {
        return NextResponse.json({ error: "Không tìm thấy tương tác AI." }, { status: 404 });
      }

      // Must be an advisor interaction
      if (existing.requestType !== "ask_advisor") {
        return NextResponse.json({ error: "Không được phép gửi phản hồi cho tương tác này." }, { status: 403 });
      }

      // Check ownership:
      // If logged-in interaction, feedback must come from the same user
      if (existing.userId !== null && existing.userId !== userId) {
        return NextResponse.json({ error: "Bạn không có quyền đánh giá tương tác này." }, { status: 403 });
      }

      // If guest interaction (existing.userId === null), require valid capability token and 24h window
      if (existing.userId === null) {
        if (!feedbackToken || !verifyGuestFeedbackToken(existing.id, feedbackToken, ENV.BETTER_AUTH_SECRET)) {
          return NextResponse.json(
            { error: "Mã xác thực phản hồi khách không hợp lệ." },
            { status: 403 }
          );
        }

        const ageMs = Date.now() - new Date(existing.createdAt).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          return NextResponse.json({ error: "Phiên tương tác khách đã hết hạn đánh giá." }, { status: 400 });
        }
      }

      const feedbackTag = reason ? `[Feedback: ${vote} - ${reason}]` : `[Feedback: ${vote}]`;
      const updatedErrorMessage = existing.errorMessage
        ? `${existing.errorMessage} | ${feedbackTag}`
        : feedbackTag;

      await db
        .update(aiInteractionLogs)
        .set({
          errorMessage: updatedErrorMessage,
        })
        .where(eq(aiInteractionLogs.id, logId));
    }

    return NextResponse.json({ success: true, vote, reason });
  } catch (error) {
    console.error("Failed to record advisor feedback", error);
    return NextResponse.json({ error: "Không thể lưu phản hồi." }, { status: 500 });
  }
}
