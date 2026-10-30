import { http, HttpResponse } from "msw";
import AiChatPage from "@/components/ai-chat/ai-chat-page";
import {
  TUTOR_CHAT_GENERAL,
  TUTOR_CHAT_LESSON,
} from "@/demo-fixtures/learner/s11-tutor";
import type { Screen, ScreenState } from "../screen-types";
import { seedTutor, tutorAsk, tutorStream } from "../../shell/tutor-handlers";

const page = (label: string, chat: string | null, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route: { pathname: "/ai", ...(chat ? { search: { c: chat } } : {}) },
  render: () => {
    seedTutor({ open: false });
    return <AiChatPage initialChatId={chat} />;
  },
  ...extra,
});

/** The Tutor page (S17 `/ai`, "Mở toàn trang"): every chat across screens, with the history sidebar. */
export const s11tTutorPageScreen: Screen = {
  id: "S17",
  title: "Tutor · toàn trang và panel",
  group: "Học tập",
  role: "learner",
  // The mockup has no shared Tutor page; the side-by-side view opens its AI advisor page.
  mockupHash: "#/ai",
  states: {
    "new-chat": page("Đoạn chat mới", null),
    "lesson-chat": page("Đoạn chat trong bài (có nguồn)", TUTOR_CHAT_LESSON),
    "general-chat": page("Gợi ý khoá học (thẻ khoá, so sánh)", TUTOR_CHAT_GENERAL),
    "history-empty": page("Chưa có lịch sử", null, {
      handlers: [http.get("/api/ai/chats", () => HttpResponse.json({ chats: [] }))],
    }),
    guest: page("Khách (không lưu lịch sử)", null, { role: "guest" }),
    "panel-general": {
      label: "Panel trên trang chung (Học tập của tôi)",
      route: { pathname: "/dashboard" },
      handlers: [tutorAsk(() => tutorStream())],
      render: () => {
        seedTutor({ chats: { general: TUTOR_CHAT_GENERAL } });
        return <main className="p-6 text-sm text-muted-foreground">Trang Học tập của tôi</main>;
      },
    },
    "panel-guest": {
      label: "Panel của khách (gợi ý chọn khoá)",
      role: "guest",
      route: { pathname: "/courses" },
      render: () => {
        seedTutor();
        return <main className="p-6 text-sm text-muted-foreground">Danh mục khoá học</main>;
      },
    },
  },
};
