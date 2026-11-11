// Request plumbing shared by the AI classroom routes (learner) and the War Room council routes (lecturer).
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, privateHeaders } from "@/lib/learning-path-http";
import { authoringErrorResponse } from "@/lib/lecturer-authoring";
import { checkRateLimit } from "@/lib/rate-limit";
import { ClassroomError } from "./classroom-contract";

// Each learner action runs one to three model turns.
const LEARNER_RATE = { windowMs: 60_000, max: 12 };

const isClassroomError = (e: unknown): e is ClassroomError =>
  e instanceof ClassroomError || (e instanceof Error && e.name === "ClassroomError" && typeof (e as ClassroomError).status === "number");

function classroomResponse(error: ClassroomError) {
  const headers: Record<string, string> = { ...privateHeaders };
  if (error.status === 429) headers["Retry-After"] = "60";
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
}

export function learnerClassroomFailure(error: unknown) {
  if (isClassroomError(error)) return classroomResponse(error);
  if (!(error instanceof LearningPathError || error instanceof ZodError)) console.error("[classroom]", error);
  return learningFailure(error);
}

export function lecturerClassroomFailure(error: unknown) {
  if (isClassroomError(error)) return classroomResponse(error);
  if (error instanceof ZodError) return NextResponse.json({ error: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại." }, { status: 400 });
  return authoringErrorResponse(error);
}

/** Writes must come from the app's own origin (the session cookie alone is not proof of intent). */
export function assertSameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) throw new ClassroomError("Yêu cầu không hợp lệ.", 403);
}

export function limitLearner(userId: string) {
  if (!checkRateLimit(`classroom:${userId}`, LEARNER_RATE).success)
    throw new ClassroomError("Bạn gửi hơi nhanh, cả lớp chưa kịp trả lời. Đợi một chút rồi thử lại.", 429, "rate_limited");
}

export async function readBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}
