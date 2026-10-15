import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { Alert } from "@codi-1/ui/components/alert";
import { auth, db } from "@/services";
import Onboarding from "./onboarding";

export default async function OnboardingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?callbackURL=${encodeURIComponent(`/learn/${courseId}/onboarding`)}`);
  const roles = await getActiveRoles(db, session.user.id);
  if (!roles.includes(ROLE.LEARNER)) return <main className="mx-auto w-full max-w-2xl p-6"><Alert variant="destructive">Bạn không có quyền học viên đang hoạt động.</Alert></main>;
  return <Onboarding key={`${session.user.id}:${courseId}`} courseId={courseId} />;
}
