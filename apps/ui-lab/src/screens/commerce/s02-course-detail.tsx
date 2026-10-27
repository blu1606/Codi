import { jsonBody } from "./lab-support";
import { delay, http, type HttpHandler } from "msw";
import CourseDetailView from "@/components/courses/course-detail-view";
import { courseDetail, courseDetailWithoutCurriculum, ownershipFor } from "@/demo-fixtures/commerce/s02-course-detail";
import type { CourseOwnership } from "@/lib/course-ownership";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

const SLUG = "react-co-ban-nang-cao";
const detailRoute = `/api/courses/${SLUG}`;

/** Ownership answer for the detail page's POST /api/courses/ownership. */
const ownership = (state: CourseOwnership, pendingOrderId?: string) =>
  http.post("/api/courses/ownership", () => jsonBody({ ownership: ownershipFor("c-react", state, pendingOrderId) }));

const detail = (body = courseDetail(SLUG)) => http.get(detailRoute, () => jsonBody(body));

const page = (handlers: HttpHandler[], label: string) => ({
  label,
  route: { pathname: `/courses/${SLUG}` },
  handlers,
  render: () => <CourseDetailView slug={SLUG} />,
});

export const courseDetailScreen: Screen = {
  id: "S02",
  title: "Chi tiết khoá học",
  group: "Khách & học viên",
  role: "learner",
  // The mockup seeds its own catalogue; use one of its slugs.
  mockupHash: "#/courses/react-du-an-thuc-te",
  states: {
    default: page([ownership("not-owned"), ...fixtureHandlers], "Chưa sở hữu"),
    guest: { label: "Khách chưa đăng nhập", role: "guest", route: { pathname: `/courses/${SLUG}` }, handlers: [detail(), ...fixtureHandlers], render: () => <CourseDetailView slug={SLUG} /> },
    "in-cart": page([ownership("in-cart"), ...fixtureHandlers], "Trong giỏ"),
    owned: page([ownership("owned"), ...fixtureHandlers], "Đã sở hữu"),
    "pending-payment": page([ownership("pending-payment", "42"), ...fixtureHandlers], "Chờ thanh toán"),
    free: {
      label: "Miễn phí",
      route: { pathname: `/courses/${SLUG}` },
      handlers: [detail({ ...courseDetail(SLUG), course: { ...courseDetail(SLUG).course, price: 0 } }), ownership("free"), ...fixtureHandlers],
      render: () => <CourseDetailView slug={SLUG} />,
    },
    loading: {
      label: "Đang tải",
      route: { pathname: `/courses/${SLUG}` },
      handlers: [http.get(detailRoute, async () => { await delay("infinite"); return jsonBody({}); })],
      render: () => <CourseDetailView slug={SLUG} />,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: `/courses/${SLUG}` },
      handlers: [http.get(detailRoute, () => jsonBody({ error: "Lỗi máy chủ" }, { status: 500 }))],
      render: () => <CourseDetailView slug={SLUG} />,
    },
    "empty-curriculum": {
      label: "Chưa có nội dung",
      route: { pathname: `/courses/${SLUG}` },
      handlers: [detail(courseDetailWithoutCurriculum(SLUG)), ownership("not-owned"), ...fixtureHandlers],
      render: () => <CourseDetailView slug={SLUG} />,
    },
  },
};
