import { jsonBody } from "./lab-support";
import { http } from "msw";
import { inboxEmpty, inboxUnread } from "@/demo-fixtures/commerce/s40-notifications";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

// The header and bell are part of the app layout, so each state changes the session or inbox they read.
const note = () => <p className="p-6 text-sm text-muted-foreground">Thanh điều hướng và chuông thông báo nằm trên khung trang.</p>;
const inbox = (body: unknown) => http.get("/api/notifications", () => jsonBody(body));

export const headerScreen: Screen = {
  id: "S40",
  title: "Header & thông báo",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/",
  states: {
    "inbox-unread": { label: "Có thông báo mới", route: { pathname: "/" }, handlers: [inbox(inboxUnread), ...fixtureHandlers], render: note },
    "inbox-empty": { label: "Không có thông báo", route: { pathname: "/" }, handlers: [inbox(inboxEmpty), ...fixtureHandlers], render: note },
    "inbox-error": { label: "Lỗi thông báo", route: { pathname: "/" }, handlers: [http.get("/api/notifications", () => jsonBody({ error: "Lỗi" }, { status: 500 })), ...fixtureHandlers], render: note },
    "nav-guest": { label: "Menu khách", role: "guest", route: { pathname: "/" }, handlers: fixtureHandlers, render: note },
    "nav-learner": { label: "Menu học viên", role: "learner", route: { pathname: "/" }, handlers: [inbox(inboxUnread), ...fixtureHandlers], render: note },
    "nav-lecturer": { label: "Menu giảng viên", role: "lecturer", route: { pathname: "/" }, handlers: fixtureHandlers, render: note },
    "nav-admin": { label: "Menu quản trị", role: "admin", route: { pathname: "/" }, handlers: fixtureHandlers, render: note },
  },
};
