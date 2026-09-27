import "varlock/auto-load";
import { createDb } from "./index";
import { courses } from "./schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const data = [
  { id: "course-1", slug: "frontend-react-nextjs", title: "Lập trình Web Frontend cơ bản đến nâng cao (React & Next.js)", category: "Frontend", level: "Beginner", duration: "10 tuần (40 giờ học)", description: "Làm chủ HTML/CSS/Tailwind, JavaScript, React và Next.js.", price: 0 },
  { id: "course-2", slug: "backend-nodejs-typescript", title: "Lập trình Backend chuyên sâu với Node.js, TypeScript & PostgreSQL", category: "Backend", level: "Intermediate", duration: "8 tuần (36 giờ học)", description: "Xây dựng REST và GraphQL API chuẩn production.", price: 0 },
  { id: "course-3", slug: "dsa-interview-prep", title: "Cấu trúc dữ liệu & Giải thuật ứng dụng cho phỏng vấn", category: "Computer Science", level: "Intermediate", duration: "6 tuần (30 giờ học)", description: "Rèn luyện tư duy giải thuật và kỹ thuật phỏng vấn.", price: 0 },
  { id: "course-4", slug: "ai-engineering", title: "Nhập môn AI Engineering & Xây dựng AI Agent thực chiến", category: "Data & AI", level: "Intermediate", duration: "8 tuần (32 giờ học)", description: "Tích hợp LLM và xây dựng AI Agent.", price: 0 },
  { id: "course-5", slug: "react-native-expo", title: "Lập trình ứng dụng di động đa nền tảng với React Native & Expo", category: "Mobile", level: "Beginner", duration: "8 tuần (32 giờ học)", description: "Phát triển ứng dụng iOS và Android.", price: 0 },
];

await db.insert(courses).values(data).onConflictDoNothing();
console.log(`Seeded ${data.length} courses`);
