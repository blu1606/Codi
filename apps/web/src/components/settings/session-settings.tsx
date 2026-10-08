"use client";

import { Button } from "@codi-1/ui/components/button";
import { ChevronRight, Loader2, Monitor, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

interface DeviceSession {
  id: string;
  token: string;
  createdAt: Date | string;
  userAgent?: string | null;
}
type Sessions = DeviceSession[];

function describeDevice(userAgent?: string | null) {
  if (!userAgent) return "Thiết bị không xác định";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Trình duyệt";
  const system = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "Thiết bị khác";
  return `${browser} · ${system}`;
}

export default function SessionSettings({ currentSessionId, revision }: { currentSessionId: string; revision: number }) {
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSessions() {
      setLoading(true);
      setError(false);
      try {
        const result = await authClient.listSessions();
        if (result.error || !result.data) throw new Error("Không thể tải phiên đăng nhập.");
        if (active) setSessions(result.data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSessions();
    return () => { active = false; };
  }, [revision, refresh]);

  async function revokeSession(session: Sessions[number]) {
    if (revoking || session.id === currentSessionId) return;
    setRevoking(session.id);
    try {
      const result = await authClient.revokeSession({ token: session.token });
      if (result.error) throw new Error(result.error.message || "Không thể đăng xuất thiết bị.");
      setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
      toast.success("Đã đăng xuất thiết bị.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể đăng xuất thiết bị.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div>
      <button type="button" aria-expanded={expanded} aria-controls="settings-session-list" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-4 rounded-lg py-5 text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-sm font-semibold">Thiết Bị Đã Đăng Nhập</span>
        <span className="flex items-center gap-3 text-sm" aria-live="polite">{loading ? <Loader2 aria-label="Đang tải thiết bị" className="size-4 animate-spin" /> : error ? "Không thể tải" : `${sessions?.length ?? 0} phiên`}<ChevronRight aria-hidden="true" className={`size-5 transition-transform ${expanded ? "rotate-90" : ""}`} /></span>
      </button>
      <div id="settings-session-list" hidden={!expanded} className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-start justify-between gap-3"><p className="text-xs leading-relaxed text-muted-foreground">Các phiên đăng nhập đang hoạt động. Một thiết bị có thể có nhiều phiên.</p><Button variant="ghost" size="sm" disabled={loading || revoking !== null} onClick={() => setRefresh((value) => value + 1)} className="rounded-lg">Tải lại</Button></div>
        {error ? <p role="alert" className="text-sm text-destructive">Không thể tải danh sách thiết bị. Vui lòng thử lại.</p> : loading ? <p role="status" className="text-sm text-muted-foreground">Đang tải phiên đăng nhập...</p> : (
          <ul className="divide-y divide-border/60">
            {sessions?.map((session) => {
              const current = session.id === currentSessionId;
              const DeviceIcon = /Android|iPhone|iPad/.test(session.userAgent ?? "") ? Smartphone : Monitor;
              return (
                <li key={session.id} className="flex flex-wrap items-center gap-3 py-4">
                  <DeviceIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{describeDevice(session.userAgent)}</p><p className="mt-1 text-xs text-muted-foreground">Đăng nhập: {new Date(session.createdAt).toLocaleString("vi-VN")}</p></div>
                  {current ? <span className="text-xs font-medium text-primary">Phiên hiện tại</span> : <Button variant="outline" size="sm" disabled={revoking !== null} onClick={() => void revokeSession(session)} className="rounded-lg">{revoking === session.id ? "Đang đăng xuất..." : "Đăng xuất"}</Button>}
                </li>
              );
            })}
            {sessions?.length === 0 && <li className="py-3 text-sm text-muted-foreground">Không có phiên đăng nhập đang hoạt động.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
