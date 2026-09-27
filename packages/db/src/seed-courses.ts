import "varlock/auto-load";
import { createDb } from "./index";
import { courses } from "./schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const data = [
  ["course-1", "frontend-react-nextjs", "Lập trình Web Frontend cơ bản đến nâng cao (React & Next.js)", "Frontend", "Beginner", "10 tuần (40 giờ học)", "Làm chủ HTML/CSS/Tailwind, JavaScript, React và Next.js."],
  ["course-2", "backend-nodejs-typescript", "Lập trình Backend chuyên sâu với Node.js, TypeScript & PostgreSQL", "Backend", "Intermediate", "8 tuần (36 giờ học)", "Xây dựng REST và GraphQL API chuẩn production."],
  ["course-3", "dsa-interview-prep", "Cấu trúc dữ liệu & Giải thuật ứng dụng cho phỏng vấn", "Computer Science", "Intermediate", "6 tuần (30 giờ học)", "Rèn luyện tư duy giải thuật và kỹ thuật phỏng vấn."],
  ["course-4", "ai-engineering", "Nhập môn AI Engineering & Xây dựng AI Agent thực chiến", "Data & AI", "Intermediate", "8 tuần (32 giờ học)", "Tích hợp LLM và xây dựng AI Agent."],
  ["course-5", "react-native-expo", "Lập trình ứng dụng di động đa nền tảng với React Native & Expo", "Mobile", "Beginner", "8 tuần (32 giờ học)", "Phát triển ứng dụng iOS và Android."],
].map(([id, slug, title, category, level, duration, description]) => ({ id, slug, title, category, level, duration, description, price: 0 }));

await db.insert(courses).values(data).onConflictDoNothing();
console.log(`Seeded ${data.length} courses`);
