import "varlock/auto-load";
import { createDb } from "./index";
import { courses, courseDetails, courseChapters, courseLessons, user } from "./schema";
import { eq } from "drizzle-orm";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });

const lecturers = [
  { id: "usr-lecturer-001", name: "Trần Quốc Huy", email: "quochuy@codi.vn" },
  { id: "usr-lecturer-002", name: "Lê Thu Hà", email: "thuha@codi.vn" },
];

for (const lec of lecturers) {
  await db.insert(user).values({
    id: lec.id,
    name: lec.name,
    email: lec.email,
    emailVerified: true,
  }).onConflictDoUpdate({
    target: user.id,
    set: { name: lec.name, email: lec.email },
  });
}

const publishedCourses = [
  {
    id: "course-react-001",
    slug: "react-tu-co-ban-den-du-an-thuc-te",
    title: "React từ cơ bản đến dự án thực tế",
    category: "Frontend",
    level: "Intermediate",
    duration: "4 giờ 30 phút",
    description: "Xây dựng giao diện web hiện đại với React: component, state, hooks, gọi API và định tuyến – kết thúc bằng một dự án hoàn chỉnh.",
    price: 1290000,
    instructorId: "usr-lecturer-001",
    rating: 4.7,
    reviewCount: 128,
    status: "published" as const,
    learningOutcomes: [
      "Hiểu cách React render giao diện từ state",
      "Tách giao diện thành component tái sử dụng",
      "Quản lý state và xử lý form với hooks",
      "Gọi API, xử lý trạng thái tải và lỗi",
      "Xây dựng ứng dụng nhiều trang với React Router",
      "Hoàn thành một dự án quản lý công việc",
    ],
    requirements: [
      "Nắm vững JavaScript cơ bản (biến, hàm, mảng, đối tượng)",
      "Biết HTML/CSS cơ bản",
      "Máy tính cài Node.js 18 trở lên",
    ],
    chapters: [
      {
        title: "Chương 1: Nền tảng React",
        lessons: [
          { title: "Giới thiệu React và cài đặt môi trường", durationSeconds: 720 },
          { title: "JSX hoạt động thế nào", durationSeconds: 900 },
          { title: "Component đầu tiên của bạn", durationSeconds: 1080 },
        ],
      },
      {
        title: "Chương 2: Props, State và sự kiện",
        lessons: [
          { title: "Truyền dữ liệu bằng Props", durationSeconds: 1200 },
          { title: "State với useState", durationSeconds: 1320 },
          { title: "Xử lý sự kiện và form", durationSeconds: 960 },
          { title: "Thử thách: Reducer quản lý danh sách công việc", durationSeconds: 1500 },
        ],
      },
      {
        title: "Chương 3: Danh sách và hiệu ứng",
        lessons: [
          { title: "Render danh sách và key", durationSeconds: 840 },
          { title: "useEffect và vòng đời component", durationSeconds: 1440 },
          { title: "Gọi API với fetch", durationSeconds: 1560 },
        ],
      },
      {
        title: "Chương 4: Ứng dụng nhiều trang",
        lessons: [
          { title: "React Router cơ bản", durationSeconds: 1200 },
          { title: "Context API chia sẻ state", durationSeconds: 1080 },
          { title: "Dự án: Ứng dụng quản lý công việc", durationSeconds: 2400 },
        ],
      },
    ],
  },
  {
    id: "course-js-001",
    slug: "javascript-nen-tang",
    title: "JavaScript nền tảng",
    category: "Frontend",
    level: "Beginner",
    duration: "3 giờ 40 phút",
    description: "Nắm chắc JavaScript hiện đại: biến, hàm, mảng, đối tượng, DOM và lập trình bất đồng bộ — nền móng cho mọi framework.",
    price: 590000,
    instructorId: "usr-lecturer-001",
    rating: 4.8,
    reviewCount: 312,
    status: "published" as const,
    learningOutcomes: [
      "Viết JavaScript hiện đại (ES6+)",
      "Xử lý dữ liệu với mảng và đối tượng",
      "Thao tác DOM và sự kiện",
      "Làm việc với Promise và async/await",
    ],
    requirements: [
      "Không cần kinh nghiệm lập trình trước",
      "Biết HTML cơ bản là một lợi thế",
    ],
    chapters: [
      {
        title: "Chương 1: Làm quen JavaScript",
        lessons: [
          { title: "Biến, hằng và kiểu dữ liệu", durationSeconds: 960 },
          { title: "Hàm và phạm vi", durationSeconds: 1200 },
        ],
      },
      {
        title: "Chương 2: Dữ liệu có cấu trúc",
        lessons: [
          { title: "Làm việc với mảng", durationSeconds: 1080 },
          { title: "Đối tượng và destructuring", durationSeconds: 1020 },
        ],
      },
      {
        title: "Chương 3: Luyện tập lập trình",
        lessons: [
          { title: "Hướng dẫn: Viết và chạy JavaScript", durationSeconds: 1200 },
          { title: "Thử thách: Thống kê đơn hàng", durationSeconds: 1500 },
        ],
      },
      {
        title: "Chương 4: Trình duyệt và DOM",
        lessons: [
          { title: "Chọn và thay đổi phần tử DOM", durationSeconds: 1140 },
          { title: "Sự kiện và event delegation", durationSeconds: 900 },
        ],
      },
      {
        title: "Chương 5: Bất đồng bộ",
        lessons: [
          { title: "Promise là gì", durationSeconds: 1260 },
          { title: "async/await và xử lý lỗi", durationSeconds: 1140 },
          { title: "Dự án nhỏ: Ứng dụng thời tiết", durationSeconds: 1800 },
        ],
      },
    ],
  },
  {
    id: "course-node-001",
    slug: "nodejs-express-rest-api",
    title: "Node.js & Express xây dựng REST API",
    category: "Backend",
    level: "Intermediate",
    duration: "1 giờ 44 phút",
    description: "Thiết kế và xây dựng REST API với Node.js, Express, xác thực JWT và PostgreSQL.",
    price: 990000,
    instructorId: "usr-lecturer-002",
    rating: 4.6,
    reviewCount: 87,
    status: "published" as const,
    learningOutcomes: [
      "Xây dựng REST API chuẩn",
      "Xác thực với JWT",
      "Kết nối PostgreSQL",
    ],
    requirements: ["JavaScript cơ bản"],
    chapters: [
      {
        title: "Chương 1: Khởi đầu với Node.js",
        lessons: [
          { title: "Node.js và npm", durationSeconds: 900 },
          { title: "Express và routing", durationSeconds: 1320 },
        ],
      },
      {
        title: "Chương 2: API và dữ liệu",
        lessons: [
          { title: "Thiết kế REST API", durationSeconds: 1080 },
          { title: "Kết nối PostgreSQL", durationSeconds: 1500 },
          { title: "Xác thực JWT", durationSeconds: 1440 },
        ],
      },
    ],
  },
  {
    id: "course-python-001",
    slug: "python-phan-tich-du-lieu",
    title: "Python cho phân tích dữ liệu",
    category: "Dữ liệu",
    level: "Beginner",
    duration: "1 giờ 44 phút",
    description: "Làm sạch, phân tích và trực quan hoá dữ liệu với Python, pandas và matplotlib.",
    price: 890000,
    instructorId: "usr-lecturer-002",
    rating: 4.5,
    reviewCount: 64,
    status: "published" as const,
    learningOutcomes: [
      "Đọc và làm sạch dữ liệu",
      "Phân tích với pandas",
      "Vẽ biểu đồ với matplotlib",
    ],
    requirements: ["Không cần kinh nghiệm"],
    chapters: [
      {
        title: "Chương 1: Python cơ bản",
        lessons: [
          { title: "Cú pháp Python", durationSeconds: 1080 },
          { title: "Cấu trúc dữ liệu", durationSeconds: 960 },
        ],
      },
      {
        title: "Chương 2: pandas & Trực quan hoá",
        lessons: [
          { title: "DataFrame", durationSeconds: 1440 },
          { title: "Làm sạch dữ liệu", durationSeconds: 1560 },
          { title: "Trực quan hoá", durationSeconds: 1200 },
        ],
      },
    ],
  },
  {
    id: "course-git-001",
    slug: "git-github-cho-nguoi-moi",
    title: "Git & GitHub cho người mới",
    category: "Công cụ",
    level: "Beginner",
    duration: "42 phút",
    description: "Quản lý phiên bản mã nguồn với Git và cộng tác trên GitHub qua pull request.",
    price: 0,
    instructorId: "usr-lecturer-002",
    rating: 4.9,
    reviewCount: 410,
    status: "published" as const,
    learningOutcomes: [
      "Dùng Git hằng ngày",
      "Làm việc với nhánh",
      "Tạo pull request",
    ],
    requirements: ["Không yêu cầu"],
    chapters: [
      {
        title: "Chương 1: Git cơ bản",
        lessons: [
          { title: "Commit đầu tiên", durationSeconds: 720 },
          { title: "Nhánh và merge", durationSeconds: 960 },
        ],
      },
      {
        title: "Chương 2: GitHub",
        lessons: [
          { title: "Pull request", durationSeconds: 840 },
        ],
      },
    ],
  },
];

for (const c of publishedCourses) {
  const { learningOutcomes, requirements, chapters, ...courseRow } = c;

  await db.insert(courses).values(courseRow).onConflictDoUpdate({
    target: courses.id,
    set: {
      slug: courseRow.slug,
      title: courseRow.title,
      category: courseRow.category,
      level: courseRow.level,
      duration: courseRow.duration,
      description: courseRow.description,
      price: courseRow.price,
      instructorId: courseRow.instructorId,
      rating: courseRow.rating,
      reviewCount: courseRow.reviewCount,
      status: courseRow.status,
    },
  });

  await db.insert(courseDetails).values({
    courseId: c.id,
    learningOutcomes,
    requirements,
  }).onConflictDoUpdate({
    target: courseDetails.courseId,
    set: {
      learningOutcomes,
      requirements,
    },
  });

  // Clean old chapters & lessons for this course to ensure clean insert
  await db.delete(courseChapters).where(eq(courseChapters.courseId, c.id));

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    if (!ch) continue;
    const [insertedChapter] = await db.insert(courseChapters).values({
      courseId: c.id,
      title: ch.title,
      position: ci,
      isPublished: true,
    }).returning({ id: courseChapters.id });

    if (insertedChapter) {
      for (let li = 0; li < ch.lessons.length; li++) {
        const les = ch.lessons[li];
        if (!les) continue;
        await db.insert(courseLessons).values({
          chapterId: insertedChapter.id,
          title: les.title,
          durationSeconds: les.durationSeconds,
          position: li,
          isPublished: true,
        });
      }
    }
  }
}

console.log("Successfully seeded 5 mockup courses with full chapters and lessons!");
