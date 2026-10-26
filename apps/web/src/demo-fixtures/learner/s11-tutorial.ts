import type { TutorialView } from "@/lib/tutorial-contract";

/** Steps of the seeded "Hướng dẫn: Viết và chạy JavaScript" tutorial lesson. */
const STEPS = [
  {
    title: "In ra màn hình",
    body: "Dùng `console.log` để in một dòng chữ. Bấm **Chạy** để xem kết quả ở khung bên dưới.",
    code: 'console.log("Xin chào Codi!");\n',
  },
  {
    title: "Biến và phép cộng",
    body: "Khai báo hai biến bằng `const` rồi in tổng của chúng.",
    code: "const a = 2;\nconst b = 3;\nconsole.log(a + b);\n",
  },
  {
    title: "Viết một hàm",
    body: "Viết hàm `chao(ten)` trả về chuỗi `Xin chào, <ten>!` rồi gọi thử.",
    code: "function chao(ten) {\n  // Viết code của bạn ở đây\n}\n\nconsole.log(chao(\"An\"));\n",
  },
  { title: "Lời giải", body: null, code: "" },
];

/** Tutorial view at a given step, as GET …/assessments/:id/tutorial returns it. */
export function tutorialAtStep(step = 0): TutorialView {
  const current = Math.min(Math.max(0, step), STEPS.length - 1);
  const s = STEPS[current];
  const gated = current === STEPS.length - 1;
  return {
    fileName: "main.js",
    language: "javascript",
    available: true,
    current,
    visited: Array.from({ length: current + 1 }, (_, i) => i),
    done: current === STEPS.length - 1,
    steps: STEPS.map((x, i) => ({ title: x.title, isSolution: i === STEPS.length - 1 })),
    title: s.title,
    body: gated ? null : s.body,
    gated,
    code: s.code,
    lastRun: null,
  };
}
