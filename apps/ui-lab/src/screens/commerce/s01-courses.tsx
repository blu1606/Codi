import { jsonBody } from "./lab-support";
import { delay, http } from "msw";
import CoursesPage from "@/app/courses/page";

import type { Screen } from "../screen-types";
import { Scripted, fixtureHandlers, seedQuery, typeInto } from "./lab-support";

export const coursesScreen: Screen = {
  id: "S01",
  title: "Danh mục khoá học",
  group: "Khách & học viên",
  role: "guest",
  mockupHash: "#/courses",
  states: {
    default: {
      label: "Kết quả",
      route: { pathname: "/courses" },
      handlers: fixtureHandlers,
      render: () => <CoursesPage />,
    },
    loading: {
      label: "Đang tải",
      route: { pathname: "/courses" },
      handlers: [http.get("/api/courses", async () => { await delay("infinite"); return jsonBody({}); })],
      render: () => <CoursesPage />,
    },
    typeahead: {
      label: "Gợi ý tìm kiếm",
      route: { pathname: "/courses" },
      handlers: fixtureHandlers,
      render: () => <Scripted script={() => typeInto('input[role="combobox"]', "react")}><CoursesPage /></Scripted>,
    },
    "no-results": {
      label: "Không có kết quả",
      route: { pathname: "/courses" },
      handlers: fixtureHandlers,
      render: () => <Scripted script={() => typeInto('input[role="combobox"]', "zzz không có")}><CoursesPage /></Scripted>,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: "/courses" },
      handlers: [http.get("/api/courses", () => jsonBody({ error: "Lỗi máy chủ" }, { status: 500 }))],
      render: () => <CoursesPage />,
    },
    filtered: {
      label: "Đã lọc",
      route: { pathname: "/courses" },
      handlers: fixtureHandlers,
      render: () => { seedQuery({ cat: "Backend", level: "Beginner" })(); return <CoursesPage />; },
    },
    sorted: {
      label: "Đã sắp xếp",
      route: { pathname: "/courses" },
      handlers: fixtureHandlers,
      render: () => { seedQuery({ sort: "newest" })(); return <CoursesPage />; },
    },
  },
};
