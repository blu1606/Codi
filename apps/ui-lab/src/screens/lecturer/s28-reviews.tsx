import { ReviewsClient } from "@/app/dashboard/lecturer/reviews/reviews-client";
import {
  lecturerReviewsAll,
  lecturerReviewsEmptyAll,
  lecturerReviewsEmptyUnreplied,
  lecturerReviewsUnreplied,
} from "@/demo-fixtures/lecturer/reviews";
import type { Screen } from "../screen-types";

const route = { pathname: "/dashboard/lecturer/reviews" };
const unrepliedRoute = { pathname: "/dashboard/lecturer/reviews", search: { filter: "unreplied" } };

export const lecturerReviewsScreen: Screen = {
  id: "S28",
  title: "Đánh giá khoá học",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/reviews",
  states: {
    all: { label: "Tất cả", route, render: () => <ReviewsClient initialData={lecturerReviewsAll} /> },
    unreplied: { label: "Chưa phản hồi", route: unrepliedRoute, render: () => <ReviewsClient initialData={lecturerReviewsUnreplied} /> },
    "all-empty": { label: "Chưa có đánh giá", route, render: () => <ReviewsClient initialData={lecturerReviewsEmptyAll} /> },
    "unreplied-empty": {
      label: "Đã phản hồi hết",
      route: unrepliedRoute,
      render: () => <ReviewsClient initialData={lecturerReviewsEmptyUnreplied} />,
    },
    "reply-error": {
      label: "Phản hồi lỗi",
      route,
      actions: { replyToCourseReview: { error: "Không thể gửi phản hồi. Vui lòng thử lại." } },
      render: () => <ReviewsClient initialData={lecturerReviewsAll} />,
    },
    "delete-reply-error": {
      label: "Xoá phản hồi lỗi",
      route,
      actions: { deleteCourseReviewReply: { error: "Không thể xoá phản hồi. Vui lòng thử lại." } },
      render: () => <ReviewsClient initialData={lecturerReviewsAll} />,
    },
  },
};
