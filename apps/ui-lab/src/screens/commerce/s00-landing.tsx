import Home from "@/app/page";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

export const landingScreen: Screen = {
  id: "S00",
  title: "Trang chủ",
  group: "Khách & học viên",
  role: "guest",
  mockupHash: "#/",
  states: {
    default: { label: "Mặc định", route: { pathname: "/" }, handlers: fixtureHandlers, render: () => <Home /> },
  },
};
