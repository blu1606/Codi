"use client";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { cn } from "@codi-1/ui/lib/utils";
import { KeyRound, Link2, Pencil, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import ChangePasswordCard from "@/components/profile/change-password-card";
import EmailVerificationCard from "@/components/profile/email-verification-card";
import SessionSettings from "./session-settings";
import ChangeEmailForm from "./change-email-form";

export type SettingsTab = "account" | "security" | "connections";

const TABS: { id: SettingsTab; href: string; label: string; icon: typeof UserRound }[] = [
  { id: "account", href: "/settings", label: "Thông tin tài khoản", icon: UserRound },
  { id: "security", href: "/settings?tab=security", label: "Mật khẩu & Bảo mật", icon: KeyRound },
  { id: "connections", href: "/settings?tab=connections", label: "Tài khoản liên kết", icon: Link2 },
];

const editButtonClass = "h-10 rounded-lg px-4 text-sm font-semibold";

/** GitHub link state. Optional: the settings page does not load it yet, so the tab asks the profile panel instead. */
export interface GithubConnectionState {
  connected: boolean;
  username?: string | null;
}

interface AccountSettingsProps {
  user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null };
  initialTab?: SettingsTab;
  githubConnection?: GithubConnectionState;
}

export default function AccountSettings({ user, initialTab = "account", githubConnection }: AccountSettingsProps) {
  const router = useRouter();
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const [tab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(user.name);
  const [draftName, setDraftName] = useState(user.name);
  const [emailVisible, setEmailVisible] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [dialog, setDialog] = useState<"name" | "password" | "email" | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);
  const isNameDirty = draftName.trim() !== name;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dialog && !event.defaultPrevented) router.push("/dashboard");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, router]);

  function openDialog(kind: "name" | "password" | "email") {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(kind);
  }

  function closeDialog() {
    if (saving) return;
    if (dialog === "password") setSessionRevision((value) => value + 1);
    setDialog(null);
  }

  async function connectGithub() {
    setLinkError(null);
    try {
      const { authClient } = await import("@/lib/auth-client");
      const result = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/settings?tab=connections",
        errorCallbackURL: "/settings?tab=connections",
      });
      if (result.error) setLinkError("Không thể mở kết nối GitHub. Bạn có thể thử lại sau.");
    } catch {
      setLinkError("Không thể mở kết nối GitHub. Bạn có thể thử lại sau.");
    }
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = draftName.trim();
    if (!nextName || !isNameDirty || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể cập nhật tên hiển thị.");
      setName(nextName);
      window.dispatchEvent(new CustomEvent("profile-name-updated", { detail: { userId: user.id, name: nextName } }));
      setDialog(null);
      toast.success("Đã cập nhật tên hiển thị.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật tên hiển thị.");
    } finally {
      setSaving(false);
    }
  }

  const currentEmail = emailOverride ?? user.email;
  const emailVerified = emailOverride !== null || user.emailVerified;
  const maskedEmail = `••••••••${currentEmail.slice(currentEmail.lastIndexOf("@"))}`;

  const accountTab = (
    <>
      <h1 className="text-2xl tracking-tight">Thông tin tài khoản</h1>
      <p className="mt-1 text-sm text-muted-foreground">Quản lý tên hiển thị và email đăng nhập.</p>
      <section aria-label="Thông tin cá nhân" className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-3 py-4 sm:grid-cols-[minmax(130px,1fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
          <h2 className="text-sm font-semibold">Tên hiển thị</h2>
          <p className="break-words text-sm font-medium sm:text-right">{name}</p>
          <Button variant="secondary" className={cn(editButtonClass, "justify-self-start sm:justify-self-end")} onClick={() => { setDraftName(name); openDialog("name"); }} aria-label="Chỉnh sửa tên hiển thị">
            <Pencil aria-hidden="true" className="size-4" />
            Sửa
          </Button>
        </div>
        <div className="grid gap-3 border-t border-border/60 py-4 sm:grid-cols-[minmax(130px,1fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
          <h2 className="text-sm font-semibold">Email</h2>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm sm:justify-end">
            <span className="break-all font-medium">{emailVisible ? currentEmail : maskedEmail}</span>
            <button type="button" aria-pressed={emailVisible} aria-label={emailVisible ? "Ẩn địa chỉ email" : "Hiển thị địa chỉ email"} onClick={() => setEmailVisible((value) => !value)} className="rounded text-muted-foreground hover:text-foreground">
              {emailVisible ? "Ẩn" : "Hiện"}
            </button>
            {emailVerified && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Đã xác thực</span>}
          </div>
          <Button variant="secondary" className={cn(editButtonClass, "justify-self-start sm:justify-self-end")} onClick={() => openDialog("email")} aria-label="Đổi email">
            Đổi email
          </Button>
        </div>
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Khi đổi email, chúng tôi gửi mã xác thực đến địa chỉ mới. Email cũ vẫn dùng được cho đến khi bạn xác thực.
      </p>
      {!emailVerified && (
        <div className="mt-6">
          <EmailVerificationCard email={currentEmail} emailVerified={emailVerified} displayEmail={emailVisible ? currentEmail : maskedEmail} />
        </div>
      )}
    </>
  );

  const securityTab = (
    <>
      <h1 className="text-2xl tracking-tight">Mật khẩu & Bảo mật</h1>
      <p className="mt-1 text-sm text-muted-foreground">Đổi mật khẩu đăng nhập.</p>
      <section aria-label="Mật khẩu" className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Mật khẩu</h2>
            <p className="text-xs text-muted-foreground">Dùng mật khẩu mạnh và không dùng lại ở trang khác.</p>
          </div>
          <Button variant="secondary" className={editButtonClass} onClick={() => openDialog("password")} aria-label="Chỉnh sửa mật khẩu">
            Đổi mật khẩu
          </Button>
        </div>
      </section>
      <div className="mt-6">
        <SessionSettings revision={sessionRevision} />
      </div>
    </>
  );

  const githubConnected = githubConnection?.connected === true;
  const connectionsTab = (
    <>
      <h1 className="text-2xl tracking-tight">Tài khoản liên kết</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Kết nối tài khoản bên ngoài để Codi cá nhân hoá gợi ý khoá học và bài tập.
      </p>
      <section aria-label="Liên kết GitHub" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Link2 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-sm font-semibold">GitHub</h2>
            {githubConnection === undefined ? (
              <p className="text-xs text-muted-foreground">Trạng thái kết nối xem trong Hồ sơ năng lực.</p>
            ) : githubConnected ? (
              <p className="text-xs text-muted-foreground">
                Đã kết nối{githubConnection.username ? <> <span className="font-mono">@{githubConnection.username}</span></> : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa kết nối. Codi chỉ đọc repo công khai khi bạn xác nhận phân tích.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {githubConnected ? (
            <Button variant="outline" nativeButton={false} render={<Link href="/profile?tab=nang-luc" />}>
              Xem hồ sơ năng lực
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={connectGithub}>Kết nối GitHub</Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/profile?tab=nang-luc" />}>
                Mở Hồ sơ năng lực
              </Button>
            </>
          )}
        </div>
      </section>
      {linkError && <p role="alert" className="mt-3 text-sm text-destructive">{linkError}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Thông tin kết nối chỉ dùng trong tài khoản Codi của bạn. Bạn ngắt kết nối bất kỳ lúc nào — dữ liệu phân tích sẽ bị xoá.
      </p>
    </>
  );

  return (
    <main className="grid h-svh min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground md:grid-cols-[250px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <aside aria-label="Menu cài đặt" className="border-b border-border/40 bg-muted/40 px-3.5 py-4 md:overflow-y-auto md:border-b-0 md:border-r md:py-5">
        <Link href="/profile" className="mb-4 flex min-w-0 items-center gap-3 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-lg font-semibold">
            {user.image && !avatarFailed ? (
              <img src={user.image} alt="" className="size-full object-cover" onError={() => setAvatarFailed(true)} />
            ) : <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "C"}</span>}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">Sửa Hồ Sơ <Pencil aria-hidden="true" className="size-3" /></span>
          </span>
        </Link>

        <nav aria-label="Cài đặt tài khoản">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">Tài khoản</p>
          <ul className="space-y-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = item.id === tab;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href as never}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-end border-b border-border/40 px-5">
          <Link href="/dashboard" aria-label="Đóng cài đặt" title="Đóng cài đặt (Esc)" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X aria-hidden="true" className="size-5" />
          </Link>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[776px] px-5 pb-24 pt-8 sm:px-10 md:pt-12">
            {tab === "account" && accountTab}
            {tab === "security" && securityTab}
            {tab === "connections" && connectionsTab}
          </div>
        </div>
      </div>

      <Dialog.Root open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); dialogTriggerRef.current?.focus(); }} onOpenAutoFocus={(event) => { if (dialog === "name" || dialog === "email") { event.preventDefault(); document.getElementById(dialog === "email" ? "settings-new-email" : "settings-display-name")?.focus(); } }} className="fixed left-1/2 top-1/2 z-50 max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
            <Dialog.Title className="pr-8 text-xl font-semibold">{dialog === "name" ? "Chỉnh sửa tên hiển thị" : dialog === "email" ? "Thay đổi email" : "Mật Khẩu & Bảo Mật"}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">{dialog === "name" ? "Tên này hiển thị trên hồ sơ và trong Codi." : dialog === "email" ? "Xác thực địa chỉ email mới trước khi thay đổi email đăng nhập." : "Đổi mật khẩu đăng nhập của bạn."}</Dialog.Description>
            <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={saving} className="absolute right-4 top-4 rounded-lg" aria-label="Đóng hộp thoại"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
            {dialog === "name" ? (
              <form onSubmit={saveName} className="mt-6 space-y-4">
                <div className="space-y-2"><Label htmlFor="settings-display-name">Tên hiển thị</Label><Input id="settings-display-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} autoComplete="name" maxLength={100} required disabled={saving} className="h-10 rounded-lg" /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={closeDialog} className="rounded-lg">Hủy</Button><Button type="submit" disabled={saving || !draftName.trim() || !isNameDirty} className="rounded-lg">{saving ? "Đang lưu..." : "Lưu thay đổi"}</Button></div>
              </form>
            ) : dialog === "email" ? <ChangeEmailForm currentEmail={currentEmail} onBusyChange={setSaving} onSuccess={(email) => { setEmailOverride(email); setEmailVisible(false); setDialog(null); toast.success("Đã xác thực và cập nhật email. Bạn có thể dùng email mới để đăng nhập."); router.refresh(); }} /> : dialog === "password" ? <div className="mt-6 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:ring-0 [&_[data-slot=card]]:py-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0"><ChangePasswordCard onBusyChange={setSaving} /></div> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
