"use client";

import { useMemo, useState } from "react";
import { PanelLeftClose, Plus, Search } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  groupTutorThreads,
  tutorThreadTitle,
  type TutorThreadSummary,
} from "@/lib/ai-tutor-contract";
import { cn } from "@codi-1/ui/lib/utils";

/** History of the learner's Tutor threads in one course, grouped by day (Asia/Bangkok). */
export function TutorThreadList({
  threads,
  activeLessonId,
  onPick,
  onNewThread,
  onCollapse,
}: {
  /** null while loading. */
  threads: TutorThreadSummary[] | null;
  activeLessonId: string | null;
  onPick: (lessonId: string) => void;
  onNewThread: () => void;
  onCollapse?: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!threads || !needle) return threads;
    return threads.filter((thread) =>
      `${thread.firstQuestion} ${thread.lessonTitle}`
        .toLocaleLowerCase("vi")
        .includes(needle),
    );
  }, [threads, query]);
  const groups = useMemo(() => (shown ? groupTutorThreads(shown) : []), [shown]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Tutor</h2>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Thu gọn danh sách đoạn chat"
            onClick={onCollapse}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>
      <Button variant="outline" className="justify-start" onClick={onNewThread}>
        <Plus className="size-4" />
        Đoạn chat mới
      </Button>
      <label className="relative block">
        <span className="sr-only">Tìm đoạn chat</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm đoạn chat"
          className="min-h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <nav aria-label="Lịch sử đoạn chat" className="min-h-0 flex-1 overflow-y-auto">
        {threads === null && (
          <p className="px-2 py-3 text-sm text-muted-foreground" role="status">
            Đang tải lịch sử…
          </p>
        )}
        {threads !== null && threads.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Chưa có đoạn chat nào. Bấm “Đoạn chat mới” để hỏi về một bài học.
          </p>
        )}
        {threads !== null && threads.length > 0 && groups.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Không có đoạn chat khớp “{query.trim()}”.
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} className="mb-3">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.threads.map((thread) => {
                const active = thread.lessonId === activeLessonId;
                return (
                  <li key={thread.lessonId}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onPick(thread.lessonId)}
                      className={cn(
                        "flex min-h-11 w-full flex-col justify-center rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                        active && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="w-full truncate text-sm">
                        {tutorThreadTitle(thread.firstQuestion)}
                      </span>
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {thread.lessonTitle}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}
