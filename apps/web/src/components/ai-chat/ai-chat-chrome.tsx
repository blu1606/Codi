"use client";

import { useEffect, useState } from "react";
import { BookOpen, Compass, Info, Search, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { cn } from "@codi-1/ui/lib/utils";
import {
  groupAiChats,
  matchesAiChat,
  type AiChatMessage,
  type AiChatSummary,
} from "@/lib/ai-chat-contract";
import type { TutorLessonMeta } from "@/lib/ai-tutor-contract";
import { useAiChat } from "./ai-chat-provider";

export function TutorAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
        className,
      )}
    >
      <span className="flex gap-1">
        <span className="size-1 rounded-full bg-current" />
        <span className="size-1 rounded-full bg-current" />
      </span>
      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-background bg-warning" />
    </span>
  );
}

export const KEEP_HISTORY =
  "Tutor lưu lịch sử để bạn xem lại; bạn xoá từng đoạn chat bất kỳ lúc nào. Chỉ bạn thấy lịch sử; giảng viên chỉ thấy câu hỏi bạn chủ động gửi qua “Hỏi giảng viên”.";

/** "Lưu ý khi dùng Trợ giảng AI": one line under the composer, the full notes on click. */
export function AiDisclaimer({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Lưu ý khi dùng Trợ giảng AI
        </button>
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lưu ý khi dùng Trợ giảng AI</DialogTitle>
            <DialogDescription>
              Tutor giúp bạn hiểu bài, không làm bài thay bạn.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Tutor trả lời theo tài liệu của Codi, kèm nguồn để mở lại đúng chỗ. Tutor có thể trả lời sai, hãy đối chiếu với bài học.</li>
            <li>Tutor không chấm điểm, không đổi điểm và không viết sẵn lời giải. Với bài code, Tutor chỉ gợi ý hướng làm.</li>
            <li>Tutor đọc bài đang mở và phần code, lỗi, test bạn thấy trong khung ngữ cảnh. Bạn bỏ bớt được từng phần.</li>
            <li>Đừng nhập thông tin cá nhân như số CCCD, số điện thoại, sức khoẻ hay tài khoản ngân hàng.</li>
            <li>{signedIn ? KEEP_HISTORY : "Bạn chưa đăng nhập nên đoạn chat không được lưu. Đăng nhập để giữ lịch sử."}</li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

const DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
});
const TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

/** History grouped by day, with search; used by the panel's history menu and the Tutor page's sidebar. */
export function AiChatHistoryList({
  chats,
  activeId,
  onSelect,
  limit,
  search,
  dense = false,
}: {
  chats: AiChatSummary[] | null;
  activeId: string | null;
  onSelect: (chat: AiChatSummary) => void;
  limit?: number;
  search?: string;
  dense?: boolean;
}) {
  if (chats === null)
    return <p className="px-3 py-2 text-sm text-muted-foreground">Đang tải lịch sử…</p>;
  const shown = chats.filter((chat) => matchesAiChat(chat, search ?? "")).slice(0, limit);
  if (!shown.length)
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        {search ? "Không có đoạn chat nào khớp." : "Chưa có đoạn chat nào."}
      </p>
    );
  const today = new Date();
  return (
    <div className="space-y-3">
      {groupAiChats(shown, today).map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 text-xs text-muted-foreground">{group.label}</p>
          <ul>
            {group.chats.map((chat) => {
              const Icon = chat.kind === "lesson" ? BookOpen : Compass;
              const at = new Date(chat.updatedAt);
              const when =
                group.label === "Hôm nay" ? TIME.format(at) : DATE.format(at);
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    aria-current={chat.id === activeId ? "true" : undefined}
                    title={`${chat.contextLabel} · ${when}`}
                    onClick={() => onSelect(chat)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted aria-[current=true]:bg-muted aria-[current=true]:font-medium",
                      dense ? "min-h-9 items-center py-1.5" : "py-2",
                    )}
                  >
                    {!dense && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{chat.title}</span>
                      {!dense && (
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {chat.contextLabel} · {when}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function HistorySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground focus-within:bg-muted hover:bg-muted">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Tìm đoạn chat"
        aria-label="Tìm đoạn chat"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

export function KeepHistoryNote() {
  return (
    <p className="flex items-start gap-1.5 px-3 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{KEEP_HISTORY}</span>
    </p>
  );
}

export type Conversation = {
  id: string;
  /** What a new chat was loaded for: its lesson meta depends on the screen and the session. */
  loadedFor: string;
  chat: AiChatSummary | null;
  messages: AiChatMessage[];
  lesson: TutorLessonMeta | null;
};

/**
 * Loads what the active chat needs: its stored messages, or nothing for a new one; and the lesson meta
 * (hint ladder, lecturer) for a lesson chat, or for a new chat opened on a lesson.
 */
export function useConversation() {
  const ai = useAiChat();
  const { active, page } = ai;
  const [data, setData] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lessonKey = page.kind === "lesson" ? `${page.courseId}/${page.lessonId}` : null;
  const loadedFor = `${lessonKey}|${ai.signedIn}`;

  useEffect(() => {
    if (!active.id) return;
    // A stored chat (or a draft that just got its first answer) keeps its live thread; nothing to reload.
    if (data?.id === active.id && (active.stored || data.loadedFor === loadedFor)) return;
    const controller = new AbortController();
    setError(null);
    (async () => {
      if (!active.stored) {
        let lesson: TutorLessonMeta | null = null;
        if (page.kind === "lesson" && ai.signedIn) {
          const query = new URLSearchParams({ courseId: page.courseId, lessonId: page.lessonId });
          const response = await fetch(`/api/ai/lesson?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.ok) lesson = await response.json();
        }
        setData({ id: active.id, loadedFor, chat: null, messages: [], lesson });
        return;
      }
      const response = await fetch(`/api/ai/chats/${active.id}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 404 || response.status === 401) {
        ai.removeChat(active.id);
        return;
      }
      if (!response.ok) throw new Error();
      const body = await response.json();
      setData({ id: active.id, loadedFor, chat: body.chat, messages: body.messages, lesson: body.lesson });
    })().catch((cause) => {
      if (!controller.signal.aborted && !(cause instanceof DOMException))
        setError("Chưa tải được đoạn chat.");
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, active.stored, loadedFor, attempt]);

  return {
    data: data?.id === active.id ? data : null,
    error,
    retry: () => setAttempt((n) => n + 1),
    setLesson: (lesson: TutorLessonMeta) =>
      setData((previous) => (previous ? { ...previous, lesson } : previous)),
  };
}

export function ChatLoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      <Info className="size-5 text-muted-foreground" aria-hidden="true" />
      <p>{message}</p>
      <button type="button" className="text-primary underline underline-offset-4" onClick={retry}>
        Thử lại
      </button>
    </div>
  );
}
