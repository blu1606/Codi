"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Link2, X } from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";

const DISMISS_KEY = "codi.github-card.dismissed";
const PROFILE_HREF = "/profile?tab=nang-luc";

type LinkStatus = "loading" | "connected" | "not-connected" | "unavailable";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Learner-home GitHub entry point (S12). Shows a connect card until GitHub is connected or dismissed,
 * then a compact link to the "Hồ sơ năng lực" tab. Only status is read; nothing is analysed here.
 */
export default function GithubLearnerCard() {
  const [status, setStatus] = useState<LinkStatus>("loading");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
    const controller = new AbortController();
    fetch("/api/github-profile", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("github_status_unavailable");
        const body = (await response.json()) as { profile?: unknown } | null;
        setStatus(body?.profile ? "connected" : "not-connected");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage can be blocked; the card then stays hidden for this page view only.
    }
  }

  if (status === "loading" || status === "unavailable") return null;

  if (status === "connected") {
    return (
      <Link
        href={PROFILE_HREF}
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Link2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block font-semibold">Hồ sơ năng lực</span>
            <span className="block truncate text-xs text-muted-foreground">
              Ước tính từ GitHub · xem và chỉnh sửa
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  if (dismissed) return null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">Kết nối GitHub để Codi hiểu bạn nhanh hơn</p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ẩn thông báo kết nối GitHub"
            onClick={dismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Codi chỉ đọc repo công khai để gợi ý điểm bắt đầu, ghi nhãn "ước tính từ GitHub". Bài kiểm tra và bài tập vẫn
          quyết định trình độ của bạn.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={PROFILE_HREF}>
            Kết nối GitHub
          </Link>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Để sau
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
