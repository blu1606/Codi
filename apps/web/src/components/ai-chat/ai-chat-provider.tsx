"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { AiChatContext, AiChatSummary } from "@/lib/ai-chat-contract";
import type {
  TutorCodeBridge,
  TutorOpenRequest,
} from "@/components/ai-tutor/tutor-bridge";
import AiChatPanel from "./ai-chat-panel";

/** Where the Tutor is open, as the header chip says it ("Đang hỏi về: …"). */
export type TutorPage =
  | { kind: "general"; label: string; href: string | null }
  | {
      kind: "lesson";
      courseId: string;
      lessonId: string;
      label: string;
      href: string;
    };
/** The chat on screen: a draft (not stored until its first question) or one from the history. */
export type ActiveChat = { id: string; stored: boolean; key: string };

type AiChatState = {
  signedIn: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  page: TutorPage;
  /** A screen that knows more than its path (a lesson) describes itself; null goes back to the path label. */
  setPage: (page: TutorPage | null) => void;
  active: ActiveChat;
  startNew: () => void;
  select: (chat: AiChatSummary) => void;
  /** The draft just got its first answer, so it is now a stored chat. */
  markStored: (id: string) => void;
  chats: AiChatSummary[] | null;
  refreshChats: () => Promise<void>;
  removeChat: (id: string) => void;
  code: RefObject<TutorCodeBridge | null>;
  codeVersion: number;
  registerCode: (bridge: TutorCodeBridge | null) => void;
  request: (TutorOpenRequest & { id: number }) | null;
  /** Contextual entry points (selection toolbar, failing test) open the panel with context and maybe a question. */
  openWith: (request?: TutorOpenRequest) => void;
};

const AiChatContextValue = createContext<AiChatState | null>(null);
export const useAiChat = () => {
  const value = useContext(AiChatContextValue);
  if (!value) throw new Error("useAiChat outside AiChatProvider");
  return value;
};

// Screens without their own description: the chip still says where the learner is.
const PATH_LABELS: [RegExp, string][] = [
  [/^\/$/, "Trang chủ"],
  [/^\/courses\/[^/]+/, "Trang khoá học"],
  [/^\/courses/, "Danh mục khoá học"],
  [/^\/dashboard/, "Học tập của tôi"],
  [/^\/learn\/[^/]+/, "Lộ trình khoá học"],
  [/^\/progress/, "Tiến độ học tập"],
  [/^\/insights/, "Phân tích học tập"],
  [/^\/cart/, "Giỏ hàng"],
  [/^\/checkout/, "Thanh toán"],
  [/^\/profile/, "Hồ sơ"],
  [/^\/settings/, "Cài đặt"],
];
// No bubble where the Tutor is the page itself or the viewer is signing in.
const HIDDEN = /^\/(ai|login|forgot-password|reset-password|dev)(\/|$)/;
const OPEN_KEY = "codi:tutor-open";
// Last chat per context ("general" or "lesson:<id>"), so coming back to a lesson reopens its conversation.
const ACTIVE_KEY = "codi:tutor-chats";

const pageKey = (page: TutorPage) =>
  page.kind === "lesson" ? `lesson:${page.lessonId}` : "general";
const chatKey = (chat: Pick<AiChatSummary, "kind" | "lessonId">) =>
  chat.kind === "lesson" ? `lesson:${chat.lessonId}` : "general";
const draft = (key: string): ActiveChat => ({
  id: crypto.randomUUID(),
  stored: false,
  key,
});

export function toChatContext(page: TutorPage): AiChatContext {
  return page.kind === "lesson"
    ? { kind: "lesson", courseId: page.courseId, lessonId: page.lessonId }
    : { kind: "general", label: page.label, href: page.href };
}

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the panel just starts closed */
  }
}

export function AiChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !!session?.user;
  const onTutorPage = /^\/ai(\/|$)/.test(pathname);

  const pathPage = useMemo<TutorPage>(() => {
    const label =
      PATH_LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Codi";
    return { kind: "general", label, href: pathname };
  }, [pathname]);
  const [override, setOverride] = useState<TutorPage | null>(null);
  // On the Tutor page itself the context stays where the learner came from.
  const [lastPage, setLastPage] = useState<TutorPage>(pathPage);
  const current = override ?? pathPage;
  useEffect(() => {
    if (!onTutorPage) setLastPage(current);
  }, [onTutorPage, current]);
  const page = onTutorPage ? lastPage : current;

  const [open, setOpenState] = useState(false);
  // Empty until the first context is known, so the effect below always picks the chat for it.
  const [active, setActive] = useState<ActiveChat>({ id: "", stored: false, key: "" });
  const [chats, setChats] = useState<AiChatSummary[] | null>(null);
  const code = useRef<TutorCodeBridge | null>(null);
  const [codeVersion, setCodeVersion] = useState(0);
  const [request, setRequest] = useState<
    (TutorOpenRequest & { id: number }) | null
  >(null);

  // Restore the panel per tab, so it stays open while the learner moves between screens and reloads.
  useEffect(() => {
    if (readSession<boolean>(OPEN_KEY)) setOpenState(true);
  }, []);
  const setOpen = useCallback((value: boolean) => {
    setOpenState(value);
    writeSession(OPEN_KEY, value || null);
  }, []);
  useEffect(() => {
    if (!active.stored) return;
    const saved = readSession<Record<string, string>>(ACTIVE_KEY) ?? {};
    writeSession(ACTIVE_KEY, { ...saved, [active.key]: active.id });
  }, [active]);

  // A conversation belongs to one lesson (or to the general screens): another lesson has its own.
  const key = pageKey(page);
  useEffect(() => {
    setActive((previous) => {
      if (previous.key === key) return previous;
      const id = readSession<Record<string, string>>(ACTIVE_KEY)?.[key];
      return id ? { id, stored: true, key } : draft(key);
    });
  }, [key]);
  const forget = (id: string) => {
    const saved = readSession<Record<string, string>>(ACTIVE_KEY) ?? {};
    writeSession(
      ACTIVE_KEY,
      Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== id)),
    );
  };

  const refreshChats = useCallback(async () => {
    // Until the session is known the history is "loading", not "empty".
    if (isPending) return;
    if (!signedIn) {
      setChats([]);
      return;
    }
    try {
      const response = await fetch("/api/ai/chats", { cache: "no-store" });
      if (response.ok) setChats((await response.json()).chats);
    } catch {
      /* the list keeps what it had; the thread itself still works */
    }
  }, [signedIn, isPending]);
  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  const value = useMemo<AiChatState>(
    () => ({
      signedIn,
      open,
      setOpen,
      page,
      setPage: setOverride,
      active,
      startNew: () => {
        forget(active.id);
        setActive(draft(key));
      },
      select: (chat) =>
        setActive({ id: chat.id, stored: true, key: chatKey(chat) }),
      markStored: (id) =>
        setActive((previous) =>
          previous.id === id ? { ...previous, stored: true } : previous,
        ),
      chats,
      refreshChats,
      removeChat: (id) => {
        forget(id);
        setChats((list) => list?.filter((chat) => chat.id !== id) ?? null);
        setActive((previous) => (previous.id === id ? draft(key) : previous));
      },
      code,
      codeVersion,
      registerCode: (bridge) => {
        code.current = bridge;
        setCodeVersion((version) => version + 1);
      },
      request,
      openWith: (next = {}) => {
        setRequest({ ...next, id: Date.now() });
        setOpen(true);
      },
    }),
    [signedIn, open, setOpen, page, active, key, chats, refreshChats, codeVersion, request],
  );

  // `T` opens or closes the Tutor on every screen that has it; never while typing.
  useEffect(() => {
    if (HIDDEN.test(pathname)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "t" && event.key !== "T") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
      )
        return;
      event.preventDefault();
      setOpen(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, open, setOpen]);

  return (
    <AiChatContextValue.Provider value={value}>
      {children}
      {!HIDDEN.test(pathname) && <AiChatPanel />}
    </AiChatContextValue.Provider>
  );
}
