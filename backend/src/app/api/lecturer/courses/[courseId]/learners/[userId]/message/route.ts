import { NextResponse } from "next/server";
import { authoringErrorResponse, messageLearner, readJson } from "@/lib/lecturer-authoring";

type Ctx = { params: Promise<{ courseId: string; userId: string }> };

/** Body: {text (10–2000)}. Sends an in-app notification to a learner enrolled in the lecturer's course. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { courseId, userId } = await params;
    const body = await readJson(request);
    if (body === undefined) return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    return NextResponse.json(await messageLearner(courseId, userId, body));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
