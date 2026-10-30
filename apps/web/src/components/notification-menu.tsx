"use client";

import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Alert } from "@codi-1/ui/components/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@codi-1/ui/components/empty";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@codi-1/ui/components/dropdown-menu";
import { cn } from "@codi-1/ui/lib/utils";
import { authClient } from "@/lib/auth-client";

type Notification = { id: number; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
type Inbox = { userId: string; items: Notification[]; unreadCount: number };

export default function NotificationMenu() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const router = useRouter();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [failure, setFailure] = useState<{ userId: string; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const revision = useRef(0);
  const current = inbox?.userId === userId ? inbox : null;
  const error = failure && failure.userId === userId ? failure.message : null;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function load() {
      const requestRevision = ++revision.current;
      try {
        const response = await fetch("/api/notifications", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Không thể tải thông báo. Vui lòng thử lại.");
        const body = await response.json();
        if (!controller.signal.aborted && requestRevision === revision.current) { setInbox({ userId: userId!, ...body }); setFailure(null); }
      } catch { if (!controller.signal.aborted && requestRevision === revision.current) setFailure({ userId: userId!, message: "Không thể tải thông báo. Vui lòng thử lại." }); }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [userId, refresh]);

  async function markRead(item?: Notification) {
    if (busy || !userId) return;
    ++revision.current;
    setBusy(true); setFailure(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { id: item.id } : { all: true }),
      });
      if (!response.ok) throw new Error("Không thể đánh dấu đã đọc. Vui lòng thử lại.");
      setInbox((previous) => previous?.userId === userId ? {
        ...previous,
        unreadCount: item ? Math.max(0, previous.unreadCount - (item.readAt ? 0 : 1)) : 0,
        items: previous.items.map((n) => !item || n.id === item.id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n),
      } : previous);
      setRefresh((value) => value + 1);
      if (item?.link && item.link.startsWith("/") && !item.link.startsWith("//") && !/[\\\u0000-\u0020]/.test(item.link)) {
        setOpen(false);
        router.push(item.link as Route);
      }
    } catch { setFailure({ userId, message: "Không thể đánh dấu đã đọc. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }

  if (!userId) return null;
  const unread = current?.unreadCount ?? 0;
  return <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next) setRefresh((value) => value + 1); }}>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative size-11 text-muted-foreground hover:text-foreground" />} aria-label={`Thông báo, ${unread} chưa đọc`}>
      <Bell aria-hidden="true" className="size-5" />
      {unread > 0 && <span aria-hidden="true" className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-pill bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="w-96 max-w-[calc(100vw-2rem)] rounded-lg p-2 shadow-pop">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-sm font-semibold text-foreground">Thông báo</DropdownMenuLabel>
        {unread > 0 && <DropdownMenuItem disabled={busy} onClick={(event) => { event.preventDefault(); void markRead(); }}><CheckCheck aria-hidden="true" />Đánh dấu tất cả đã đọc</DropdownMenuItem>}
        <DropdownMenuSeparator />
        {error && <div className="space-y-2 p-2"><Alert variant="destructive">{error}</Alert><Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>Thử lại</Button></div>}
        {!current && !error && <LoadingRegion label="Đang tải thông báo…" className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><Skeleton className="size-8 shrink-0 rounded-full" /><div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3 w-2/5" /></div></div>)}</LoadingRegion>}
        {current?.items.length === 0 && <Empty className="p-5"><EmptyHeader><EmptyMedia variant="icon"><Bell aria-hidden="true" /></EmptyMedia><EmptyTitle>Chưa có thông báo.</EmptyTitle><EmptyDescription>Thông báo về học tập sẽ xuất hiện tại đây.</EmptyDescription></EmptyHeader></Empty>}
        {current && <div className="max-h-[min(60dvh,400px)] overflow-y-auto">{current.items.map((item) => <DropdownMenuItem key={item.id} disabled={busy} onClick={(event) => { event.preventDefault(); void markRead(item); }} className={cn("my-1 flex min-h-11 items-start rounded-md p-3 whitespace-normal", !item.readAt && "bg-accent")}>
          <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-border" : "bg-primary")} />
          <span className="min-w-0 space-y-1"><span className="block text-sm font-medium">{item.title}<span className="sr-only">{item.readAt ? ", đã đọc" : ", chưa đọc"}</span></span>{item.body && <span className="block text-sm text-muted-foreground">{item.body}</span>}<time dateTime={item.createdAt} className="block text-xs text-faint">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time></span>
        </DropdownMenuItem>)}</div>}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
