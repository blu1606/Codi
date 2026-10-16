import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, db } from "@/services";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningPathService } from "@/lib/learning-path-runtime";

// #98's lesson player inherits this server gate. Its write APIs must call the
// same service guard inside their transaction; a layout cannot protect an API.
export default async function LessonAccessLayout({ children, params }: { children: ReactNode; params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  const courseHome = `/learn/${encodeURIComponent(courseId)}` as Route;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?callbackURL=${encodeURIComponent(courseHome)}`);
  try {
    if (!(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER)) throw new LearningPathError("Bạn không có quyền học viên đang hoạt động.", 403);
    await learningPathService.assertLessonAccess(session.user.id, courseId, lessonId);
  } catch (error) {
    if (!(error instanceof LearningPathError)) throw error;
    return <main className="mx-auto max-w-2xl p-6"><Alert variant="warning"><AlertTitle>Chưa thể mở bài học</AlertTitle><AlertDescription>{error.message}<Link className="text-primary underline" href={courseHome}>Về lộ trình để xem điều kiện cần hoàn thành</Link></AlertDescription></Alert></main>;
  }
  return children;
}
