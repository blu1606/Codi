export interface Course {
  id: string;
  title: string;
  slug: string;
  category: "Frontend" | "Backend" | "Fullstack" | "Data & AI" | "Mobile" | "Computer Science";
  level: "Beginner" | "Intermediate" | "Advanced";
  duration: string;
  description: string;
  targetAudience: string;
  prerequisites: string;
  topics: string[];
}

export const SEED_COURSES: Course[] = [
  {
    id: "course-1",
    title: "Lập trình Web Frontend cơ bản đến nâng cao (React & Next.js)",
    slug: "frontend-react-nextjs",
    category: "Frontend",
    level: "Beginner",
    duration: "10 tuần (40 giờ học)",
    description: "Làm chủ HTML/CSS/Tailwind, JavaScript hiện đại (ES6+), React 19 và xây dựng ứng dụng với Next.js App Router.",
    targetAudience: "Người mới bắt đầu, sinh viên muốn theo đuổi hướng Frontend Developer",
    prerequisites: "Không yêu cầu kiến thức lập trình trước đó",
    topics: [
      "HTML5 & Semantic Web",
      "Tailwind CSS v4 & Responsive Layout",
      "JavaScript ES6+ & Async/Await",
      "React 19 Hooks & Component Architecture",
      "Next.js App Router & Server Components",
      "Quản lý State & Gọi API",
      "Deploy & Tối ưu trên Vercel"
    ],
  },
  {
    id: "course-2",
    title: "Lập trình Backend chuyên sâu với Node.js, TypeScript & PostgreSQL",
    slug: "backend-nodejs-typescript",
    category: "Backend",
    level: "Intermediate",
    duration: "8 tuần (36 giờ học)",
    description: "Xây dựng hệ thống REST & GraphQL API chuẩn production, xác thực an toàn với Better-Auth/JWT, cơ sở dữ liệu PostgreSQL và Docker.",
    targetAudience: "Sinh viên đã có nền tảng JavaScript, muốn chuyên sâu Backend hoặc Fullstack",
    prerequisites: "Đã nắm vững JavaScript cơ bản",
    topics: [
      "TypeScript nâng cao cho Backend",
      "Kiến trúc REST API & Hono/Express",
      "Thiết kế CSDL quan hệ với PostgreSQL & Drizzle ORM",
      "Xác thực phân quyền (RBAC, JWT, Better-Auth)",
      "Caching với Redis & Giới hạn Rate Limiting",
      "Docker hóa ứng dụng & Triển khai Cloud"
    ],
  },
  {
    id: "course-3",
    title: "Cấu trúc dữ liệu & Giải thuật ứng dụng cho phỏng vấn (DSA)",
    slug: "dsa-interview-prep",
    category: "Computer Science",
    level: "Intermediate",
    duration: "6 tuần (30 giờ học)",
    description: "Rèn luyện tư duy giải thuật từ mảng, chuỗi, stack, queue đến cây, đồ thị, quy hoạch động và tự tin giải đề LeetCode.",
    targetAudience: "Sinh viên CNTT chuẩn bị đi thực tập (OJT) hoặc thi tuyển lập trình viên",
    prerequisites: "Biết cú pháp 1 ngôn ngữ lập trình (C++, Java, hoặc Python)",
    topics: [
      "Độ phức tạp thời gian & không gian (Big-O)",
      "Kỹ thuật Two Pointers & Sliding Window",
      "Tìm kiếm nhị phân & Đệ quy",
      "Cấu trúc cây (Binary Tree, BST)",
      "Đồ thị (BFS, DFS, Dijkstra)",
      "Quy hoạch động (Dynamic Programming)",
      "Kỹ năng live-coding phỏng vấn kỹ thuật"
    ],
  },
  {
    id: "course-4",
    title: "Nhập môn AI Engineering & Xây dựng AI Agent thực chiến",
    slug: "ai-engineer-foundations",
    category: "Data & AI",
    level: "Intermediate",
    duration: "8 tuần (32 giờ học)",
    description: "Làm chủ việc tích hợp LLM (Gemini, OpenAI), kỹ thuật Prompt Engineering nâng cao, RAG (Retrieval-Augmented Generation) và phát triển AI Agents.",
    targetAudience: "Lập trình viên muốn đón đầu xu hướng AI Engineering",
    prerequisites: "Biết lập trình cơ bản (Python hoặc TypeScript)",
    topics: [
      "Nguyên lý LLM, Token & Temperature",
      "Prompt Engineering thực chiến & Few-shot",
      "Function Calling & Tool Use của AI",
      "Vector Database & Embeddings",
      "Xây dựng hệ thống RAG hỏi đáp tài liệu",
      "AI SDK & Stream Text UI",
      "Multi-agent Orchestration & Tự động hóa tác vụ"
    ],
  },
  {
    id: "course-5",
    title: "Lập trình ứng dụng di động đa nền tảng với React Native & Expo",
    slug: "mobile-react-native",
    category: "Mobile",
    level: "Beginner",
    duration: "8 tuần (32 giờ học)",
    description: "Phát triển ứng dụng iOS và Android hiệu năng cao từ một codebase duy nhất với Expo và React Native.",
    targetAudience: "Đã biết React hoặc lập trình web muốn phát triển ứng dụng di động",
    prerequisites: "Nắm vững React cơ bản",
    topics: [
      "Kiến trúc Expo Router & File-based Routing",
      "Component Native & Layout Flexbox trên Mobile",
      "Xử lý cử chỉ Gesture & Hiệu ứng Animation",
      "Lưu trữ dữ liệu Offline-first",
      "Tích hợp Camera, Định vị & Push Notifications",
      "Đóng gói APK/AAB & Xuất bản App Store/Google Play"
    ],
  },
];

export function getCourseCatalogPrompt(): string {
  return SEED_COURSES.map(
    (c, idx) =>
      `${idx + 1}. **${c.title}** (${c.level} | ${c.duration})\n` +
      `   - Phân loại: ${c.category}\n` +
      `   - Mô tả: ${c.description}\n` +
      `   - Đối tượng phù hợp: ${c.targetAudience}\n` +
      `   - Điều kiện tiên quyết: ${c.prerequisites}\n` +
      `   - Các chủ đề chính: ${c.topics.join(", ")}`
  ).join("\n\n");
}
