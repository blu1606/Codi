import type { LecturerCourseItem, LecturerCounts } from "@/app/dashboard/lecturer/actions";

/**
 * Happy-path lecturer data, typed with the real loader return types. Ids and names follow
 * docs/mockup/js/data.js (usr-lecturer-001, course-react-001). Lab screens and page fallbacks read these.
 */

export const lecturerByStatus: LecturerCounts["byStatus"] = { draft: 1, pending: 1, rejected: 1, published: 2, hidden: 0 };

export const lecturerCourses: LecturerCourseItem[] = [
  {
    id: "course-react-001", slug: "react-du-an-thuc-te", title: "React dự án thực tế",
    description: "Xây dựng ứng dụng React hoàn chỉnh từ đầu.", category: "Frontend", level: "Intermediate",
    status: "published", chaptersCount: 6, lessonsCount: 24, learnersCount: 128,
    createdAt: "2026-06-01T02:00:00.000Z", updatedAt: "2026-10-20T03:00:00.000Z",
  },
  {
    id: "course-node-001", slug: "nodejs-express-rest-api", title: "Node.js & Express xây dựng REST API",
    description: "Thiết kế và xây dựng REST API thực chiến.", category: "Backend", level: "Beginner",
    status: "rejected", rejectReason: "Cần bổ sung bài kiểm tra cho phần xác thực JWT.",
    chaptersCount: 5, lessonsCount: 18, learnersCount: 0,
    createdAt: "2026-09-10T02:00:00.000Z", updatedAt: "2026-10-22T08:30:00.000Z",
  },
  {
    id: "course-ts-001", slug: "typescript-chuyen-sau", title: "TypeScript chuyên sâu",
    description: "Generic, conditional types và thiết kế kiểu an toàn.", category: "Frontend", level: "Advanced",
    status: "pending", chaptersCount: 4, lessonsCount: 12, learnersCount: 0,
    createdAt: "2026-10-05T02:00:00.000Z", updatedAt: "2026-10-24T09:10:00.000Z",
  },
  {
    id: "course-jest-001", slug: "kiem-thu-voi-jest", title: "Kiểm thử JavaScript với Jest",
    description: "Unit test và integration test cho ứng dụng thực tế.", category: "Testing", level: "Intermediate",
    status: "draft", chaptersCount: 2, lessonsCount: 5, learnersCount: 0,
    createdAt: "2026-10-18T02:00:00.000Z", updatedAt: "2026-10-25T04:00:00.000Z",
  },
];

export const lecturerCounts: LecturerCounts = { grading: 3, questions: 2, reviews: 1, byStatus: lecturerByStatus };

export const lecturerRejectedCourseAlert = {
  id: "course-node-001",
  title: "Node.js & Express xây dựng REST API",
  rejectReason: "Cần bổ sung bài kiểm tra cho phần xác thực JWT.",
};


export const lecturerDashboardStats = { counts: lecturerCounts, rejectedCourseAlert: lecturerRejectedCourseAlert };
