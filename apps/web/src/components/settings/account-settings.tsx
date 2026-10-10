"use client";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { cn } from "@codi-1/ui/lib/utils";
import { ChevronRight, Pencil, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import ChangePasswordCard from "@/components/profile/change-password-card";
import EmailVerificationCard from "@/components/profile/email-verification-card";
import SessionSettings from "./session-settings";
import ChangeEmailForm from "./change-email-form";

type Section = "account-information" | "password-security";
const sections: { id: Section; label: string }[] = [
  { id: "account-information", label: "Thông Tin Tài Khoản" },
  { id: "password-security", label: "Mật Khẩu & Bảo Mật" },
];
const editButtonClass = "h-10 rounded-lg px-4 text-sm font-semibold";

interface AccountSettingsProps {
  user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null };
}

export default function AccountSettings({ user }: AccountSettingsProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("account-information");
  const [query, setQuery] = useState("");
  const [name, setName] = useState(user.name);
  const [draftName, setDraftName] = useState(user.name);
  const [emailVisible, setEmailVisible] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [dialog, setDialog] = useState<"name" | "password" | "email" | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dialog && !event.defaultPrevented) router.push("/dashboard");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, router]);

  function navigateToSection(id: Section) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleScroll() {
    const container = scrollRef.current;
    const security = document.getElementById("password-security");
    if (!container || !security) return;
    const securityAtTop = security.getBoundingClientRect().top - container.getBoundingClientRect().top < 100;
    const atBottom = container.scrollTop > 0 && container.scrollHeight - container.scrollTop - container.clientHeight < 4;
    setActiveSection(securityAtTop || atBottom ? "password-security" : "account-information");
  }

  function openDialog(kind: "name" | "password" | "email") {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(kind);
  }

  function closeDialog() {
    if (saving) return;
    if (dialog === "password") setSessionRevision((value) => value + 1);
    setDialog(null);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = draftName.trim();
    if (!nextName || saving) return;
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
  const visibleSections = sections.filter((section) => section.label.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")));

  return (
    <main className="grid h-svh min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground dark:bg-muted/70 md:grid-cols-[250px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <aside aria-label="Menu cài đặt" className="border-b border-border/40 bg-muted/40 px-3.5 py-4 dark:bg-card md:overflow-y-auto md:border-b-0 md:border-r md:py-5">
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

        <div className="relative mb-3 hidden md:block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input aria-label="Tìm kiếm cài đặt" placeholder="Tìm kiếm" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-lg bg-background/50 pl-9 text-sm" />
        </div>

        <nav aria-label="Cài đặt tài khoản">
          <button type="button" onClick={() => { setQuery(""); navigateToSection("account-information"); }} className="flex w-full items-center gap-2 rounded-lg bg-accent px-2.5 py-2 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserRound aria-hidden="true" className="size-4" />
            Tài Khoản
          </button>
          <div className="ml-4 mt-1 flex border-l border-border md:block">
            {visibleSections.map((section) => (
              <a key={section.id} href={`#${section.id}`} onClick={(event) => { event.preventDefault(); navigateToSection(section.id); }} aria-current={activeSection === section.id ? "location" : undefined} className={cn("relative block px-4 py-2 text-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", activeSection === section.id ? "font-medium text-foreground before:absolute before:-left-px before:top-2 before:h-5 before:w-0.5 before:bg-foreground" : "text-muted-foreground")}>
                {section.label}
              </a>
            ))}
            {visibleSections.length === 0 && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">Không tìm thấy cài đặt.</p>}
          </div>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-5">
          <h1 className="text-sm font-semibold">Tài Khoản</h1>
          <Link href="/dashboard" aria-label="Đóng cài đặt" title="Đóng cài đặt (Esc)" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="size-5" />
          </Link>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[776px] px-5 pb-24 pt-8 sm:px-10 md:pt-16">
            <section id="account-information" aria-labelledby="account-information-title" className="scroll-mt-8 border-b border-border/60 pb-8">
              <h2 id="account-information-title" className="mb-4 text-2xl font-medium tracking-tight">Thông Tin Tài Khoản</h2>
              <div className="grid gap-3 py-4 sm:grid-cols-[minmax(130px,1fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
                <h3 className="text-sm font-semibold">Tên hiển thị</h3>
                <p className="break-words text-sm font-medium sm:text-right">{name}</p>
                <Button variant="secondary" className={cn(editButtonClass, "justify-self-start sm:justify-self-end")} onClick={() => { setDraftName(name); openDialog("name"); }} aria-label="Chỉnh sửa tên hiển thị">Chỉnh sửa</Button>
              </div>
              <div className="grid gap-3 py-4 sm:grid-cols-[minmax(130px,1fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
                <h3 className="text-sm font-semibold">Email</h3>
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm sm:justify-end">
                  <span className="break-all font-medium">{emailVisible ? currentEmail : maskedEmail}</span>
                  <button type="button" aria-pressed={emailVisible} aria-label={emailVisible ? "Ẩn địa chỉ email" : "Hiển thị địa chỉ email"} onClick={() => setEmailVisible((value) => !value)} className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{emailVisible ? "Ẩn" : "Hiển thị"}</button>
                </div>
                <Button variant="secondary" className={cn(editButtonClass, "justify-self-start sm:justify-self-end")} onClick={() => openDialog("email")} aria-label="Chỉnh sửa email">Chỉnh sửa</Button>
              </div>
              <div className="grid gap-3 py-4 sm:grid-cols-[minmax(130px,1fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
                <h3 className="text-sm font-semibold">Số Điện Thoại</h3>
                <p className="text-sm text-muted-foreground sm:text-right">Chưa liên kết</p>
                <Button variant="secondary" disabled className={cn(editButtonClass, "justify-self-start sm:justify-self-end")}>Chưa hỗ trợ</Button>
              </div>
              {!emailVerified && <div className="mt-6"><EmailVerificationCard email={currentEmail} emailVerified={emailVerified} displayEmail={emailVisible ? currentEmail : maskedEmail} /></div>}
            </section>

            <section id="password-security" aria-labelledby="password-security-title" className="scroll-mt-8 pt-10">
              <h2 id="password-security-title" className="mb-4 text-2xl font-medium tracking-tight">Mật Khẩu & Bảo Mật</h2>
              <div className="flex items-center justify-between gap-4 py-4">
                <h3 className="text-sm font-semibold">Mật khẩu</h3>
                <Button variant="secondary" className={editButtonClass} onClick={() => openDialog("password")} aria-label="Chỉnh sửa mật khẩu">Chỉnh sửa</Button>
              </div>
              <div className="flex items-center justify-between gap-4 py-5">
                <h3 className="text-sm font-semibold">Xác Thực Đa Nhân Tố</h3>
                <span className="flex items-center gap-3 text-sm text-muted-foreground">Chưa hỗ trợ <ChevronRight aria-hidden="true" className="size-5" /></span>
              </div>
              <SessionSettings revision={sessionRevision} />
            </section>
          </div>
        </div>
      </div>

      <Dialog.Root open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); dialogTriggerRef.current?.focus(); }} onOpenAutoFocus={(event) => { if (dialog === "name" || dialog === "email") { event.preventDefault(); document.getElementById(dialog === "email" ? "settings-new-email" : "settings-display-name")?.focus(); } }} className="fixed left-1/2 top-1/2 z-50 max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
            <Dialog.Title className="pr-8 text-xl font-semibold">{dialog === "name" ? "Chỉnh sửa tên hiển thị" : dialog === "email" ? "Thay đổi email" : "Mật Khẩu & Bảo Mật"}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">{dialog === "name" ? "Tên này hiển thị trên hồ sơ và trong Codi." : dialog === "email" ? "Xác thực địa chỉ email mới trước khi cập nhật tài khoản." : "Cập nhật mật khẩu để bảo vệ tài khoản của bạn."}</Dialog.Description>
            <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={saving} className="absolute right-4 top-4 rounded-lg" aria-label="Đóng hộp thoại"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
            {dialog === "name" ? (
              <form onSubmit={saveName} className="mt-6 space-y-4">
                <div className="space-y-2"><Label htmlFor="settings-display-name">Tên hiển thị</Label><Input id="settings-display-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} autoComplete="name" maxLength={100} required disabled={saving} className="h-10 rounded-lg" /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={closeDialog} className="rounded-lg">Hủy</Button><Button type="submit" disabled={saving || !draftName.trim()} className="rounded-lg">{saving ? "Đang lưu..." : "Lưu thay đổi"}</Button></div>
              </form>
            ) : dialog === "email" ? <ChangeEmailForm currentEmail={currentEmail} onBusyChange={setSaving} onSuccess={(email) => { setEmailOverride(email); setEmailVisible(false); setDialog(null); toast.success("Đã xác thực và cập nhật email. Bạn có thể dùng email mới để đăng nhập."); router.refresh(); }} /> : dialog === "password" ? <div className="mt-6 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:ring-0 [&_[data-slot=card]]:py-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0"><ChangePasswordCard onBusyChange={setSaving} /></div> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
