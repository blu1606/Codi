import type { CourseReview } from "./course-details";

export interface MockCourseContent {
  slug: string;
  ratingBreakdown: number[];
  reviews: CourseReview[];
  instructorTitle: string;
}

export const MOCK_COURSE_REVIEWS: Record<string, MockCourseContent> = {
  "react-tu-co-ban-den-du-an-thuc-te": {
    slug: "react-tu-co-ban-den-du-an-thuc-te",
    ratingBreakdown: [92, 24, 8, 3, 1],
    instructorTitle: "Giảng viên tại Codi",
    reviews: [
      {
        id: "rv-001",
        userName: "Phạm Thảo Linh",
        stars: 5,
        createdAt: "07/10/2026",
        text: "Dự án cuối khoá rất sát thực tế, lộ trình gợi ý giúp mình bỏ qua phần đã biết.",
        reply: {
          text: "Cảm ơn Linh! Chúc bạn áp dụng tốt vào công việc.",
          createdAt: "07/10/2026",
        },
      },
      {
        id: "rv-002",
        userName: "Trần Minh Vũ",
        stars: 4,
        createdAt: "03/10/2026",
        text: "Nội dung tốt, mong có thêm bài về tối ưu hiệu năng.",
        reply: null,
      },
      {
        id: "rv-003",
        userName: "Đặng Quốc Anh",
        stars: 3,
        createdAt: "01/10/2026",
        text: "Video phần useEffect hơi nhanh.",
        reply: null,
      },
    ],
  },
  "javascript-nen-tang": {
    slug: "javascript-nen-tang",
    ratingBreakdown: [251, 44, 12, 4, 1],
    instructorTitle: "Giảng viên tại Codi",
    reviews: [
      {
        id: "rv-004",
        userName: "Vũ Thị Hương",
        stars: 5,
        createdAt: "30/09/2026",
        text: "Giải thích dễ hiểu, bài tập vừa sức.",
        reply: {
          text: "Cảm ơn bạn đã học cùng Codi!",
          createdAt: "01/10/2026",
        },
      },
      {
        id: "rv-005",
        userName: "Phạm Thảo Linh",
        stars: 5,
        createdAt: "20/09/2026",
        text: "Khoá học rất bổ ích cho người mới bắt đầu.",
        reply: null,
      },
      {
        id: "rv-006",
        userName: "Bùi Minh Tuấn",
        stars: 4,
        createdAt: "09/10/2026",
        text: "Phần bất đồng bộ cần thêm ví dụ thực tế hơn.",
        reply: null,
      },
    ],
  },
  "nodejs-express-rest-api": {
    slug: "nodejs-express-rest-api",
    ratingBreakdown: [58, 20, 6, 2, 1],
    instructorTitle: "Giảng viên tại Codi",
    reviews: [
      {
        id: "rv-008",
        userName: "Đỗ Thanh Tùng",
        stars: 4,
        createdAt: "11/10/2026",
        text: "Phần JWT rất hữu ích và dễ áp dụng vào dự án thực tế.",
        reply: null,
      },
      {
        id: "rv-009",
        userName: "Nguyễn Minh Anh",
        stars: 5,
        createdAt: "08/10/2026",
        text: "Kiến thức backend thực chiến, giải thích cặn kẽ.",
        reply: {
          text: "Cảm ơn Minh Anh! Chúc bạn làm tốt dự án nhé.",
          createdAt: "09/10/2026",
        },
      },
    ],
  },
  "python-phan-tich-du-lieu": {
    slug: "python-phan-tich-du-lieu",
    ratingBreakdown: [40, 15, 6, 2, 1],
    instructorTitle: "Giảng viên tại Codi",
    reviews: [
      {
        id: "rv-010",
        userName: "Ngô Bảo Ngọc",
        stars: 5,
        createdAt: "05/10/2026",
        text: "Khóa học hướng dẫn pandas rất trực quan, dễ áp dụng vào công việc.",
        reply: null,
      },
      {
        id: "rv-011",
        userName: "Lý Hải Đăng",
        stars: 4,
        createdAt: "02/10/2026",
        text: "Rất hay, mong cô bổ sung thêm phần seaborn.",
        reply: {
          text: "Cảm ơn Đăng, cô sẽ cập nhật thêm trong phần mở rộng nhé.",
          createdAt: "03/10/2026",
        },
      },
    ],
  },
  "git-github-cho-nguoi-moi": {
    slug: "git-github-cho-nguoi-moi",
    ratingBreakdown: [370, 30, 7, 2, 1],
    instructorTitle: "Giảng viên tại Codi",
    reviews: [
      {
        id: "rv-007",
        userName: "Trần Minh Vũ",
        stars: 5,
        createdAt: "03/09/2026",
        text: "Ngắn gọn, đủ dùng.",
        reply: null,
      },
      {
        id: "rv-012",
        userName: "Đặng Quốc Anh",
        stars: 5,
        createdAt: "15/09/2026",
        text: "Rất dễ hiểu, sau khoá này mình đã tự tin tạo PR trên GitHub.",
        reply: {
          text: "Chúc mừng bạn! Cố gắng phát huy nhé.",
          createdAt: "16/09/2026",
        },
      },
    ],
  },
};
