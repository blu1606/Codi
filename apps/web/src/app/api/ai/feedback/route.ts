import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth, db } from "@/services";
import { aiInteractionLogs } from "@codi-1/db";
import { advisorFeedbackCommand } from "@/lib/ai-advisor-contract";

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

    const { logId, vote, reason } = parsed.data;

    // If logId exists and user is authenticated or it's recent log, update the interaction log metadata
    if (logId) {
      const [existing] = await db
        .select({ id: aiInteractionLogs.id, userId: aiInteractionLogs.userId })
        .from(aiInteractionLogs)
        .where(eq(aiInteractionLogs.id, logId));

      if (existing) {
        // Can optionally append feedback/reason to error_message or a metadata note
        await db
          .update(aiInteractionLogs)
          .set({
            errorMessage: reason ? `[Feedback: ${vote} - ${reason}]` : `[Feedback: ${vote}]`,
          })
          .where(eq(aiInteractionLogs.id, logId));
      }
    }

    return NextResponse.json({ success: true, vote, reason });
  } catch (error) {
    console.error("Failed to record advisor feedback", error);
    return NextResponse.json({ error: "Không thể lưu phản hồi." }, { status: 500 });
  }
}
