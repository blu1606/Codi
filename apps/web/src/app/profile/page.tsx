import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, ShieldCheck } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { getActiveRoles } from "@codi-1/auth";
import { auth, db } from "@/services";
import ProfileCard from "@/components/profile/profile-card";
import ChangePasswordCard from "@/components/profile/change-password-card";
import EmailVerificationCard from "@/components/profile/email-verification-card";

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const activeRoles = await getActiveRoles(db, session.user.id);

  return (
    <main className="min-h-screen bg-background py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb / Back Action */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Quay lại Bàn làm việc (Dashboard)
            </Button>
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Tài khoản Codi an toàn</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Hồ sơ cá nhân & Bảo mật</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý thông tin tài khoản, ảnh đại diện lưu trữ trên Cloudflare R2 và mật khẩu đăng nhập.
          </p>
        </div>

        {/* Email Verification Card if unverified */}
        <EmailVerificationCard
          email={session.user.email}
          emailVerified={session.user.emailVerified}
        />

        {/* Profile Card (Edit Name, Cloudflare R2 Avatar Upload, Roles) */}
        <ProfileCard user={session.user} roles={activeRoles} />

        {/* Change Password Card */}
        <ChangePasswordCard />
      </div>
    </main>
  );
}
