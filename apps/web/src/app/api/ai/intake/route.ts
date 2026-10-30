import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth, db } from "@/services";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, privateHeaders } from "@/lib/learning-path-http";
import { ONBOARDING_GOALS, ONBOARDING_LEVELS, WEEKLY_HOURS } from "@codi-1/db/schema/onboarding-values";
import {
  readLearnerIntake,
  saveLearnerIntake,
} from "@/lib/learner-intake-service";

// null clears one answer; a missing key leaves it as it is.
const patchSchema = z
  .object({
    goal: z.enum(ONBOARDING_GOALS).nullable().optional(),
    level: z.enum(ONBOARDING_LEVELS).nullable().optional(),
    hours: z
      .number()
      .refine((value) => (WEEKLY_HOURS as readonly number[]).includes(value))
      .nullable()
      .optional(),
  })
  .strict();

/** The signed-in learner's S17 intake answers (goal, level, weekly hours). */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw new LearningPathError("Vui lòng đăng nhập.", 401);
    return NextResponse.json(
      { draft: await readLearnerIntake(db, session.user.id) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw new LearningPathError("Vui lòng đăng nhập.", 401);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new LearningPathError("Thông tin chưa hợp lệ.", 400);
    const draft = await saveLearnerIntake(db, session.user.id, parsed.data);
    return NextResponse.json({ draft }, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
