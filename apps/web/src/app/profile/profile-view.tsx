import Link from "next/link";
import { ArrowLeft, User, ShieldCheck } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import type { ComponentProps } from "react";
import type { RoleId } from "@codi-1/auth";
import EmailVerificationCard from "@/components/profile/email-verification-card";
import GithubProfilePanel from "@/components/profile/github-profile-panel";
import type { GithubProfilePageState } from "@/components/profile/github-profile-page-state";
import ProfileCard from "@/components/profile/profile-card";
import StudentProfileOverview, { ProfileStats } from "@/components/profile/student-profile-overview";
import { PROFILE_TABS, profileTabHref, type ProfileTab } from "./profile-tabs";

const NO_GITHUB_STATE: GithubProfilePageState = {
  initialProfile: null,
  initialLinked: null,
  initialLinkError: null,
  readFailed: false,
};

export function ProfileView({
  user,
  roles,
  activeTab = "overview",
  github,
}: {
  user: ComponentProps<typeof ProfileCard>["user"];
  roles: RoleId[];
  activeTab?: ProfileTab;
  github?: GithubProfilePageState | null;
}) {
  const isLearner = roles.includes("LEARNER");
  const tabs = PROFILE_TABS.filter((tab) => !tab.learnerOnly || isLearner);
  const githubState = github ?? NO_GITHUB_STATE;

  return (
    <main className="min-h-screen min-w-0 bg-background py-8 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-2 sm:px-4 lg:px-8">
        {/* Navigation Breadcrumb / Back Action */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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
            <h1 className="text-2xl tracking-tight">Hồ sơ cá nhân & Bảo mật</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý thông tin tài khoản, ảnh đại diện lưu trữ trên Cloudflare R2 và mật khẩu đăng nhập.
          </p>
        </div>

        {/* Email Verification Card if unverified */}
        <EmailVerificationCard email={user.email} emailVerified={user.emailVerified} />

        <nav
          aria-label="Điều hướng hồ sơ"
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={profileTabHref(tab.id)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile Card (Edit Name, Cloudflare R2 Avatar Upload, Roles) */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)] xl:gap-12">
          <div className="min-w-0 space-y-4">
            <ProfileCard user={user} roles={roles} />
            <ProfileStats />
          </div>
          {activeTab === "nang-luc" ? (
            <div className="min-w-0">
              {githubState.readFailed && (
                <p role="alert" className="mb-6 text-sm text-destructive">
                  Chưa tải được hồ sơ đã lưu. Không có lượt phân tích mới nào được bắt đầu.
                </p>
              )}
              <GithubProfilePanel
                initialProfile={githubState.initialProfile}
                initialLinked={githubState.initialLinked}
                initialLinkError={githubState.initialLinkError}
                initialJob={githubState.initialJob}
              />
            </div>
          ) : (
            <StudentProfileOverview tab={activeTab} />
          )}
        </div>
      </div>
    </main>
  );
}
