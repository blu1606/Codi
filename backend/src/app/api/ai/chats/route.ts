import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/services";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, privateHeaders } from "@/lib/learning-path-http";
import { chatService } from "@/lib/ai-tutor-runtime";

/** The signed-in viewer's Tutor history across every screen, newest first. */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw new LearningPathError("Vui lòng đăng nhập.", 401);
    return NextResponse.json(
      { chats: await chatService.list(session.user.id) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}
