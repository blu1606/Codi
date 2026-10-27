import type { LecturerReviewsDataDto, ReviewItemDto } from "@/app/dashboard/lecturer/reviews/actions";

/** Course reviews inbox (S28), shaped like getLecturerReviewsData. */

const reviews: ReviewItemDto[] = [
  {
    id: 301, courseId: "course-react-001", courseTitle: "React dự án thực tế",
    learnerId: "usr-learner-001", learnerName: "Nguyễn Minh An", learnerAvatar: null,
    rating: 5, text: "Bài giảng rõ ràng, phần hooks rất dễ hiểu.",
    lecturerReply: null, repliedAt: null, createdAt: "2026-10-24T10:00:00.000Z",
  },
  {
    id: 302, courseId: "course-react-001", courseTitle: "React dự án thực tế",
    learnerId: "usr-learner-002", learnerName: "Phạm Thu Hà", learnerAvatar: null,
    rating: 3, text: "Phần Context hơi nhanh, mong có thêm ví dụ.",
    lecturerReply: "Cảm ơn bạn. Mình sẽ bổ sung ví dụ cho bài Context trong bản cập nhật tới.",
    repliedAt: "2026-10-25T02:00:00.000Z", createdAt: "2026-10-23T08:00:00.000Z",
  },
  {
    id: 303, courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
    learnerId: "usr-learner-003", learnerName: "Lê Đức Anh", learnerAvatar: null,
    rating: 4, text: null,
    lecturerReply: null, repliedAt: null, createdAt: "2026-10-22T12:30:00.000Z",
  },
];

const base: LecturerReviewsDataDto = {
  filter: "all",
  counts: { all: reviews.length, unreplied: reviews.filter((r) => !r.lecturerReply).length },
  reviews,
};

export const lecturerReviewsAll: LecturerReviewsDataDto = base;

export const lecturerReviewsUnreplied: LecturerReviewsDataDto = {
  ...base,
  filter: "unreplied",
  reviews: reviews.filter((r) => !r.lecturerReply),
};

export const lecturerReviewsEmptyAll: LecturerReviewsDataDto = {
  filter: "all",
  counts: { all: 0, unreplied: 0 },
  reviews: [],
};

export const lecturerReviewsEmptyUnreplied: LecturerReviewsDataDto = {
  filter: "unreplied",
  counts: { all: reviews.length, unreplied: 0 },
  reviews: [],
};
