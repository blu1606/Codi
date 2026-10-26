import { SnippetsClient } from "@/app/dashboard/lecturer/snippets/snippets-client";
import { lecturerFeedbackSnippets, lecturerSnippetsEmpty } from "@/demo-fixtures/lecturer/grading";
import type { Screen } from "../screen-types";

const route = { pathname: "/dashboard/lecturer/snippets" };

export const lecturerSnippetsScreen: Screen = {
  id: "S26s",
  title: "Mẫu nhận xét",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/snippets",
  states: {
    list: { label: "Có mẫu", route, render: () => <SnippetsClient initialSnippets={lecturerFeedbackSnippets} /> },
    empty: { label: "Chưa có mẫu", route, render: () => <SnippetsClient initialSnippets={lecturerSnippetsEmpty} /> },
    "save-error": {
      label: "Lưu lỗi",
      route,
      actions: { createFeedbackSnippet: { error: "Không thể lưu mẫu nhận xét. Vui lòng thử lại." } },
      render: () => <SnippetsClient initialSnippets={lecturerFeedbackSnippets} />,
    },
  },
};
