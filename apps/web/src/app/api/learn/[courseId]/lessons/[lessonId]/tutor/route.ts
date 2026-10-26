import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/services";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { tutorCommand } from "@/lib/tutor-contract";
import {
  executeTutorTurn,
  getMemoryThread,
  getPrompts,
} from "@/lib/tutor-service";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { lessonId } = await context.params;
    const messages = getMemoryThread(userId, lessonId);
    let hintLevel = 0;
    for (const m of messages) {
      if (m.text.includes("Gợi ý 3/3")) hintLevel = Math.max(hintLevel, 3);
      else if (m.text.includes("Gợi ý 2/3")) hintLevel = Math.max(hintLevel, 2);
      else if (m.text.includes("Gợi ý 1/3")) hintLevel = Math.max(hintLevel, 1);
    }
    return NextResponse.json(
      {
        lessonId,
        messages,
        hintLevel,
        availablePrompts: getPrompts(false),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const cmd = tutorCommand.parse(body);

    const result = await executeTutorTurn(db, userId, courseId, lessonId, cmd);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
