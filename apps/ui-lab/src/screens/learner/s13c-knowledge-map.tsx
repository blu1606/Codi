import { delay, http, HttpResponse } from "msw";
import KnowledgeMap from "@/components/knowledge-map";
import {
  knowledgeMapAllUnlearned,
  knowledgeMapDefault,
  knowledgeMapHidden,
} from "@/demo-fixtures/learner/s13c-knowledge-map";
import type { KnowledgeMapView } from "@/lib/learning-path-contract";
import type { Screen, ScreenState } from "../screen-types";

const endpoint = "/api/insights/knowledge-map";

const mapState = (label: string, body: KnowledgeMapView, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route: { pathname: "/insights/knowledge-map" },
  handlers: [http.get(endpoint, () => HttpResponse.json(body))],
  render: () => <KnowledgeMap initialCourseId="course-js-001" />,
  ...extra,
});

export const s13cKnowledgeMapScreen: Screen = {
  id: "S13c",
  title: "Bản đồ kiến thức",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/insights/knowledge-map",
  states: {
    default: mapState("Có mức thành thạo", knowledgeMapDefault, { mockupScenario: { kmap: "ok" } }),
    "all-unlearned": mapState("Tất cả chưa học", knowledgeMapAllUnlearned),
    hidden: mapState("Chưa xác nhận bản đồ", knowledgeMapHidden, { mockupScenario: { kmap: "fail" } }),
    loading: {
      label: "Đang tải",
      route: { pathname: "/insights/knowledge-map" },
      handlers: [http.get(endpoint, async () => { await delay("infinite"); return HttpResponse.json({}); })],
      render: () => <KnowledgeMap initialCourseId="course-js-001" />,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: "/insights/knowledge-map" },
      handlers: [http.get(endpoint, () => HttpResponse.json({ error: "Không thể tải bản đồ." }, { status: 500 }))],
      render: () => <KnowledgeMap initialCourseId="course-js-001" />,
    },
  },
};
