import AccountSettings from "@/components/settings/account-settings";
import { ProfileView } from "@/app/profile/profile-view";
import { accountRoles, accountSessions, accountUser } from "@/demo-fixtures/commerce/s04b-account";
import { http } from "msw";
import type { Screen } from "../screen-types";
import { fixtureHandlers, jsonBody } from "./lab-support";

export const settingsScreen: Screen = {
  id: "S04b",
  title: "Cài đặt tài khoản",
  group: "Khách & học viên",
  role: "learner",
  layout: "bare",
  mockupHash: "#/settings",
  states: {
    default: { label: "Mặc định", route: { pathname: "/settings" }, handlers: [http.get("/api/auth/list-sessions", () => jsonBody(accountSessions)), ...fixtureHandlers], render: () => <AccountSettings user={accountUser} /> },
  },
};

export const profileScreen: Screen = {
  id: "S04b-profile",
  title: "Hồ sơ cá nhân",
  group: "Khách & học viên",
  role: "learner",
  mockupHash: "#/profile",
  states: {
    default: { label: "Mặc định", route: { pathname: "/profile" }, handlers: fixtureHandlers, render: () => <ProfileView user={accountUser} roles={accountRoles} /> },
  },
};
