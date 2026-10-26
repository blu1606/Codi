import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, db } from "@/services";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import {
  advisorPrompt,
  generateGuestFeedbackToken,
  getLearnerProgressContext,
  getPublishedCatalog,
  logAdvisorInteraction,
  syncLearnerIntakeGoalDraft,
  toAdvisorAnswer,
} from "@/lib/ai-advisor-service";
import { generateAdvisorAnswer } from "@/lib/ai-advisor-ai";
import { intakeStateSchema, type IntakeState } from "@/lib/ai-advisor-contract";
import { ENV } from "@/env";

// Recent turns so follow-ups ("so sánh 2 khoá vừa rồi") have context; invalid history is ignored.
const historySchema = z
  .array(z.object({ role: z.enum(["user", "ai"]), text: z.string().max(4000) }))
  .max(20);

export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const [catalog, progressContext] = await Promise.all([
      getPublishedCatalog(db),
      getLearnerProgressContext(db, userId),
    ]);

    return NextResponse.json({
      user: session?.user ? { id: session.user.id, name: session.user.name } : null,
      currentCourse: progressContext.currentCourse,
      catalog,
      savedIntake: progressContext.savedIntake ?? null,
    });
  } catch (error) {
    console.error("Failed to initialize advisor context", error);
    return NextResponse.json(
      { error: "Không thể tải ngữ cảnh cố vấn AI." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const clientIp = getClientIp(req);

  // Rate limiting (10 requests/min per IP)
  const rateLimit = checkRateLimit(clientIp, { windowMs: 60 * 1000, max: 10 });
  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return new Response(
      JSON.stringify({
        error: "Bạn đã hỏi quá nhiều trong thời gian ngắn",
        body: "Đợi vài phút rồi thử lại.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ (JSON lỗi)." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const { prompt, intake: rawIntake, history: rawHistory } = body as {
    prompt?: unknown;
    intake?: unknown;
    history?: unknown;
  };
  const historyParsed = historySchema.safeParse(rawHistory ?? []);
  const history = historyParsed.success ? historyParsed.data : [];

  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Câu hỏi không được để trống." }, { status: 400 });
  }

  const intakeParsed = intakeStateSchema.safeParse(rawIntake ?? {});
  const intake: IntakeState = intakeParsed.success
    ? intakeParsed.data
    : { skipped: [] };

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id ?? null;

    const [catalog, progressContext] = await Promise.all([
      getPublishedCatalog(db),
      getLearnerProgressContext(db, userId),
    ]);

    const generated = await generateAdvisorAnswer(
      advisorPrompt({
        prompt: prompt.trim(),
        catalog,
        intake,
        ownedCourseIds: progressContext.ownedCourseIds,
        currentCourse: progressContext.currentCourse,
        history,
      }),
      req.signal,
    );
    const answer = toAdvisorAnswer(generated.output, catalog);

    const latencyMs = Date.now() - startedAt;

    // Connect intake persistence to profile and onboarding for signed-in learners
    if (userId && (intake.goal || intake.level || intake.hoursPerWeek)) {
      try {
        await syncLearnerIntakeGoalDraft(db, userId, intake);
      } catch (syncErr) {
        console.warn("Failed to sync intake to goal draft", syncErr);
      }
    }

    // Log to ai_interaction_logs (guests have userId = null)
    const logId = await logAdvisorInteraction(db, {
      userId,
      userPrompt: prompt.trim(),
      aiResponse: JSON.stringify(answer),
      latencyMs,
      isSuccess: true,
      model: generated.model,
      promptTokens: generated.promptTokens,
      completionTokens: generated.completionTokens,
    });

    const feedbackToken =
      !userId && logId ? generateGuestFeedbackToken(logId, ENV.BETTER_AUTH_SECRET) : null;

    return NextResponse.json({
      ...answer,
      logId,
      feedbackToken,
      currentCourse: progressContext.currentCourse,
    });
  } catch (error: any) {
    console.error("AI Course Advisor Error:", error);
    const latencyMs = Date.now() - startedAt;

    try {
      const session = await auth.api.getSession({ headers: req.headers });
      await logAdvisorInteraction(db, {
        userId: session?.user?.id ?? null,
        userPrompt: typeof prompt === "string" ? prompt : "",
        aiResponse: "",
        latencyMs,
        isSuccess: false,
        errorMessage: error?.message || "Unknown error",
      });
    } catch {
      // Ignore logging failure on error
    }

    return NextResponse.json(
      {
        error: "Codi tạm thời không phản hồi",
        body: "Câu hỏi chưa được trả lời. Bạn có thể thử lại hoặc tự xem danh mục khoá học.",
      },
      { status: 500 }
    );
  }
}
