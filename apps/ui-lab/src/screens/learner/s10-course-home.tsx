import { delay, http, HttpResponse } from "msw";
import CourseHome from "@/app/learn/[courseId]/course-home";
import {
  COURSE_HOME_COURSE_ID,
  coursePathCompleted,
  coursePathDefault,
  coursePathFailed,
  coursePathGenerating,
  coursePathNone,
  coursePathReady,
  coursePathSoftLocked,
  coursePathUpdated,
} from "@/demo-fixtures/learner/s10-course-home";
import type { CoursePathView } from "@/lib/learning-path-contract";
import type { Screen, ScreenState } from "../screen-types";

const endpoint = `/api/learn/${COURSE_HOME_COURSE_ID}/path`;

const pathHandler = (body: CoursePathView) => http.post(endpoint, () => HttpResponse.json(body));

const pathState = (label: string, body: CoursePathView, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route: { pathname: `/learn/${COURSE_HOME_COURSE_ID}` },
  handlers: [pathHandler(body)],
  render: () => <CourseHome courseId={COURSE_HOME_COURSE_ID} dismissalScope="lab:learner" />,
  ...extra,
});

export const s10CourseHomeScreen: Screen = {
  id: "S10",
  title: "Lộ trình học (trang khoá học)",
  group: "Học tập",
  role: "learner",
  mockupHash: `#/learn/${COURSE_HOME_COURSE_ID}`,
  states: {
    "default-order": pathState("Thứ tự mặc định", coursePathDefault, { mockupScenario: { pathAI: "ok" } }),
    none: pathState("Chưa thiết lập", coursePathNone),
    generating: pathState("Đang xếp lộ trình", coursePathGenerating),
    ready: pathState("Lộ trình cá nhân hoá", coursePathReady),
    updated: pathState("Vừa cập nhật", coursePathUpdated),
    "soft-locked": pathState("Chưa đủ tiên quyết (có cảnh báo)", coursePathSoftLocked),
    failed: pathState("AI chưa sẵn sàng", coursePathFailed, { mockupScenario: { pathAI: "fail" } }),
    completed: pathState("Hoàn thành khoá (S11f)", coursePathCompleted),
    "map-view": pathState("Bản đồ lộ trình (chế độ xem Bản đồ)", coursePathReady, {
      render: () => <CourseHome courseId={COURSE_HOME_COURSE_ID} dismissalScope="lab:learner" initialPathView="map" />,
    }),
    loading: pathState("Đang tải", coursePathReady, {
      handlers: [http.post(endpoint, async () => { await delay("infinite"); return HttpResponse.json({}); })],
    }),
    error: pathState("Lỗi tải", coursePathReady, {
      handlers: [http.post(endpoint, () => HttpResponse.json({ error: "Không thể tải lộ trình." }, { status: 500 }))],
    }),
  },
};
