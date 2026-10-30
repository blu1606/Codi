// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: session.user ? { user: session.user } : null, isPending: false }) },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/courses/react-basics" }));
vi.mock("./ai-chat-panel", () => ({ default: () => null }));

import { AiChatProvider, useAiChat } from "./ai-chat-provider";

type Ai = ReturnType<typeof useAiChat>;
const CHAT_KEY = "codi:tutor-chats";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;
let latest: Ai;

function Probe() {
  latest = useAiChat();
  return null;
}
const tree = () => createElement(AiChatProvider, null, createElement(Probe));
const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// What the chat list endpoint returns for each learner.
function serveChats(byUser: Record<string, { id: string }[]>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (!String(url).endsWith("/api/ai/chats")) return new Response("{}", { status: 404 });
    const owner = session.user?.id ?? "";
    const chats = (byUser[owner] ?? []).map((chat) => ({
      ...chat,
      kind: "general",
      title: "Đoạn chat",
      contextLabel: "Codi",
      contextHref: null,
      courseId: null,
      lessonId: null,
      updatedAt: new Date().toISOString(),
    }));
    return new Response(JSON.stringify({ chats }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  session.user = null;
});

describe("Tutor chat state per learner (P1)", () => {
  it("drops the previous learner's open chat and history on sign-out and on an owner change", async () => {
    session.user = { id: "learner-a" };
    serveChats({ "learner-a": [{ id: "chat-a" }], "learner-b": [{ id: "chat-b" }] });
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ general: "chat-a" }));
    await act(async () => root.render(tree()));
    await flush();
    expect(latest.active).toEqual({ id: "chat-a", stored: true, key: "general" });
    expect(latest.chats?.map((chat) => chat.id)).toEqual(["chat-a"]);

    session.user = null;
    await act(async () => root.render(tree()));
    await flush();
    expect(latest.active.id).not.toBe("chat-a");
    expect(latest.active.stored).toBe(false);
    expect(sessionStorage.getItem(CHAT_KEY)).toBeNull();

    session.user = { id: "learner-b" };
    await act(async () => root.render(tree()));
    await flush();
    expect(latest.chats?.map((chat) => chat.id)).toEqual(["chat-b"]);
    expect(latest.active.id).not.toBe("chat-a");
  });

  it("keeps a restored chat on the first load, before the owner is known to have changed", async () => {
    session.user = { id: "learner-a" };
    serveChats({ "learner-a": [{ id: "chat-a" }] });
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ general: "chat-a" }));
    await act(async () => root.render(tree()));
    await flush();
    expect(latest.active.id).toBe("chat-a");
  });
});

describe("contextual request (P2)", () => {
  it("is handed to exactly one thread, so a remount never sends it again", async () => {
    session.user = null;
    await act(async () => root.render(tree()));
    act(() => latest.openWith({ ask: "Vì sao test này chưa đạt?" }));
    expect(latest.open).toBe(true);

    const first = latest.takeRequest();
    expect(first?.ask).toBe("Vì sao test này chưa đạt?");
    expect(latest.takeRequest()).toBeNull();
  });

  it("a page prompt is queued without opening the panel", async () => {
    session.user = null;
    await act(async () => root.render(tree()));
    act(() => latest.openWith({ ask: "Khoá này có phù hợp với tôi không?" }, { panel: false }));
    expect(latest.open).toBe(false);
    expect(latest.takeRequest()?.ask).toBe("Khoá này có phù hợp với tôi không?");
  });

  it("reopening the panel from the page toolbar does not bring back a taken question", async () => {
    session.user = null;
    await act(async () => root.render(tree()));
    act(() => latest.openWith({ ask: "Vì sao test này chưa đạt?" }));
    act(() => latest.takeRequest());
    act(() => latest.setOpen(false));
    act(() => latest.setOpen(true));
    expect(latest.open).toBe(true);
    expect(latest.request).toBeNull();
    expect(latest.takeRequest()).toBeNull();

    act(() => latest.openWith({ ask: "Bài này dạy gì?" }));
    expect(latest.takeRequest()?.ask).toBe("Bài này dạy gì?");
  });
});
