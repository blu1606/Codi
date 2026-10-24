"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { canRequestForSession, subscribeToSessionRequests } from "@/lib/session-requests";

export default function CartNavButton({ mobile }: { mobile?: boolean } = {}) {
  const { data: session } = authClient.useSession();
  const sessionId = session?.session.id;
  const userId = session?.user.id;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const [cart, setCart] = useState<{ sessionId: string; count: number; failed?: boolean } | null>(null);
  const count = cart && cart.sessionId === sessionId ? cart.count : 0;
  const label = cart && cart.sessionId === sessionId && cart.failed
    ? "Giỏ hàng, không tải được số khoá học"
    : `Giỏ hàng, ${count} khoá học`;

  useEffect(() => {
    if (!sessionId || !userId || userRole === "lecturer" || userRole === "admin") return;
    let controller: AbortController | undefined;
    let leavingPage = false;
    const fetchCart = async () => {
      controller?.abort();
      if (leavingPage || !canRequestForSession(sessionId)) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/student/cart", { signal: request.signal });
        if (request.signal.aborted) return;
        if (!response.ok) throw new Error(`Cart request failed (${response.status})`);
        const data = await response.json();
        if (!request.signal.aborted && typeof data.count === "number") {
          setCart({ sessionId, count: data.count });
        }
      } catch (error) {
        if (request.signal.aborted) return;
        setCart({ sessionId, count: 0, failed: true });
        console.error("Không thể tải số khoá học trong giỏ hàng.", error);
      }
    };
    const handleUpdate = () => { void fetchCart(); };
    // A full navigation can cancel fetch before React's effect cleanup runs.
    const handlePageHide = () => { leavingPage = true; controller?.abort(); };
    const handlePageShow = () => { if (leavingPage) { leavingPage = false; handleUpdate(); } };
    const unsubscribe = subscribeToSessionRequests(handleUpdate);
    handleUpdate();
    window.addEventListener("codi:cart-updated", handleUpdate);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      controller?.abort();
      unsubscribe();
      window.removeEventListener("codi:cart-updated", handleUpdate);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [sessionId, userId, userRole]);

  if (!session?.user) return null;

  if (userRole === "lecturer" || userRole === "admin") return null;

  if (mobile) {
    return (
      <Link
        href={"/cart" as any}
        aria-label={label}
        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="h-4 w-4" />
          <span>Giỏ hàng</span>
        </div>
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={"/cart" as any}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none">
          {count}
        </span>
      )}
    </Link>
  );
}
