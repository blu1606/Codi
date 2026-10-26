import { jsonBody } from "./lab-support";
import { http, delay } from "msw";
import { AiAdvisorView } from "@/components/ai/ai-advisor-view";
import {
  advisorAnswer, advisorComparison, advisorInitGuest, advisorInitNoIntake, advisorInitWithIntake, advisorNoMatch, advisorOwnerships,
} from "@/demo-fixtures/commerce/s17-ai-advisor";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

const init = (body: unknown) => http.get("/api/ai", () => jsonBody(body));
const ask = (body: unknown, status = 200) => http.post("/api/ai", () => jsonBody(body, { status }));
const ask429 = http.post("/api/ai", () => jsonBody({ error: "Bạn đã hỏi quá nhanh." }, { status: 429 }));
const ask500 = http.post("/api/ai", () => jsonBody({ error: "Lỗi" }, { status: 500 }));
const askForever = http.post("/api/ai", async () => { await delay("infinite"); return jsonBody({}); });
const ownerships = http.post("/api/courses/ownership", () => jsonBody(advisorOwnerships));
const route = { pathname: "/ai" };
const view = (prompt?: string) => <AiAdvisorView initialTopic={undefined} initialPrompt={prompt} />;

export const aiAdvisorScreen: Screen = {
  id: "S17",
  title: "Tư vấn AI",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/ai",
  states: {
    guest: { label: "Khách", role: "guest", route, handlers: [init(advisorInitGuest()), ...fixtureHandlers], render: () => view() },
    intake: { label: "Hỏi thông tin", route, handlers: [init(advisorInitNoIntake()), ...fixtureHandlers], render: () => view() },
    "signed-in": { label: "Đã đăng nhập", route, handlers: [init(advisorInitWithIntake()), ...fixtureHandlers], render: () => view() },
    answering: {
      label: "Đang trả lời",
      route,
      handlers: [init(advisorInitWithIntake()), askForever, ...fixtureHandlers],
      mockupScenario: { aiAssistant: "thinking" },
      render: () => view("Gợi ý khoá học frontend"),
    },
    answer: {
      label: "Có gợi ý khoá học",
      route,
      handlers: [init(advisorInitWithIntake()), ownerships, ask(advisorAnswer), ...fixtureHandlers],
      render: () => view("Gợi ý khoá học frontend"),
    },
    comparison: {
      label: "Bảng so sánh",
      route,
      handlers: [init(advisorInitWithIntake()), ownerships, ask(advisorComparison), ...fixtureHandlers],
      render: () => view("So sánh React và Node.js"),
    },
    "no-match": {
      label: "Không khớp",
      route,
      handlers: [init(advisorInitWithIntake()), ownerships, ask(advisorNoMatch), ...fixtureHandlers],
      render: () => view("Khoá học lập trình game 3D"),
    },
    "rate-limited": {
      label: "Quá giới hạn",
      route,
      handlers: [init(advisorInitWithIntake()), ask429, ...fixtureHandlers],
      mockupScenario: { aiAssistant: "ratelimit" },
      render: () => view("Gợi ý khoá học frontend"),
    },
    error: {
      label: "Lỗi",
      route,
      handlers: [init(advisorInitWithIntake()), ask500, ...fixtureHandlers],
      mockupScenario: { aiAssistant: "error" },
      render: () => view("Gợi ý khoá học frontend"),
    },
  },
};
