import { PublicationReviewClient } from "@/app/dashboard/admin/publication/publication-review-client";
import { PublicationPreviewClient } from "@/app/dashboard/admin/publication/publication-preview-client";
import {
  adminPublicationApproved,
  adminPublicationBlocked,
  adminPublicationChanges,
  adminPublicationDetail,
  adminPublicationEmpty,
  adminPublicationEmptyCourse,
  adminPublicationHistory,
  adminPublicationPending,
} from "@/demo-fixtures/lecturer/admin-publication";
import type { Screen } from "../screen-types";

const TS = "course-ts-001";
const NODE = "course-node-001";
const pendingRoute = { pathname: "/dashboard/admin/publication", search: { tab: "pending", id: TS } };
const changesRoute = { pathname: "/dashboard/admin/publication", search: { tab: "changes", id: NODE } };

const noop = () => {};

/** Review screen for one course; the detail's key follows the page, so each state mounts fresh. */
function review(queue: Parameters<typeof PublicationReviewClient>[0]["queue"], selectedCourseId: string | undefined, detail: Parameters<typeof PublicationReviewClient>[0]["detail"]) {
  return <PublicationReviewClient key={`${selectedCourseId ?? "empty"}_${detail?.round?.id ?? "0"}`} queue={queue} selectedCourseId={selectedCourseId} detail={detail} />;
}

export const adminPublicationScreen: Screen = {
  id: "S32",
  title: "Duyệt xuất bản",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/publication",
  states: {
    pending: { label: "Chờ duyệt", route: pendingRoute, render: () => review(adminPublicationPending, TS, adminPublicationDetail) },
    "pending-blocked": {
      label: "Chờ duyệt: bị chặn",
      route: pendingRoute,
      render: () => review(adminPublicationPending, TS, adminPublicationBlocked),
    },
    "pending-empty": {
      label: "Hàng đợi trống",
      route: { pathname: "/dashboard/admin/publication", search: { tab: "pending" } },
      render: () => review(adminPublicationEmpty("pending"), undefined, null),
    },
    changes: { label: "Cần sửa / từ chối", route: changesRoute, render: () => review(adminPublicationChanges, NODE, { ...adminPublicationHistory, course: { ...adminPublicationHistory.course, id: NODE, title: "Node.js & Express xây dựng REST API" } }) },
    "changes-empty": {
      label: "Cần sửa: trống",
      route: { pathname: "/dashboard/admin/publication", search: { tab: "changes" } },
      render: () => review(adminPublicationEmpty("changes"), undefined, null),
    },
    approved: {
      label: "Đã duyệt",
      route: { pathname: "/dashboard/admin/publication", search: { tab: "approved" } },
      render: () => review(adminPublicationApproved, "course-react-001", { ...adminPublicationDetail, course: { ...adminPublicationDetail.course, id: "course-react-001", title: "React dự án thực tế" } }),
    },
    "approved-empty": {
      label: "Đã duyệt: trống",
      route: { pathname: "/dashboard/admin/publication", search: { tab: "approved" } },
      render: () => review(adminPublicationEmpty("approved"), undefined, null),
    },
    history: { label: "Lịch sử vòng", route: pendingRoute, render: () => review(adminPublicationPending, TS, adminPublicationHistory) },
    "approve-error": {
      label: "Duyệt lỗi",
      route: pendingRoute,
      actions: { approvePublication: { error: "Không thể duyệt khoá học. Vui lòng thử lại." } },
      render: () => review(adminPublicationPending, TS, adminPublicationDetail),
    },
    "reject-error": {
      label: "Từ chối lỗi",
      route: pendingRoute,
      actions: { rejectPublication: { error: "Không thể từ chối khoá học. Vui lòng thử lại." } },
      render: () => review(adminPublicationPending, TS, adminPublicationDetail),
    },
    "changes-error": {
      label: "Yêu cầu sửa lỗi",
      route: pendingRoute,
      actions: { requestChanges: { error: "Không thể gửi yêu cầu sửa. Vui lòng thử lại." } },
      render: () => review(adminPublicationPending, TS, adminPublicationDetail),
    },
    "criterion-error": {
      label: "Lưu tiêu chí lỗi",
      route: pendingRoute,
      actions: { saveCriterionVerdict: { error: "Không thể lưu kết quả tiêu chí." } },
      render: () => review(adminPublicationPending, TS, adminPublicationDetail),
    },
    preview: {
      label: "Xem trước như học viên (S32b)",
      route: pendingRoute,
      render: () => <PublicationPreviewClient course={adminPublicationDetail.course} onClose={noop} />,
    },
    "preview-empty": {
      label: "Xem trước: khoá chưa có bài",
      route: pendingRoute,
      render: () => <PublicationPreviewClient course={adminPublicationEmptyCourse} onClose={noop} />,
    },
  },
};
