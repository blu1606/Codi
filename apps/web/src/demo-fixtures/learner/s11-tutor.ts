import type { AiChatMessage, AiChatSummary } from "@/lib/ai-chat-contract";
import type { TutorLessonMeta } from "@/lib/ai-tutor-contract";
import { LESSON_COURSE_ID, LESSON_ID } from "./s11-lesson-player";

/** Demo data for the shared Tutor (H3 copilot): the floating panel, the full page and its history. */

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const lessonHref = `/learn/${LESSON_COURSE_ID}/${LESSON_ID}`;

export const TUTOR_CHAT_LESSON = "0d3c1a52-6b9e-4b8e-9d8e-1f2a3b4c5d01";
export const TUTOR_CHAT_GENERAL = "0d3c1a52-6b9e-4b8e-9d8e-1f2a3b4c5d02";
export const TUTOR_CHAT_HINT = "0d3c1a52-6b9e-4b8e-9d8e-1f2a3b4c5d03";
export const TUTOR_CHAT_LECTURER = "0d3c1a52-6b9e-4b8e-9d8e-1f2a3b4c5d04";
export const TUTOR_CHAT_OLD = "0d3c1a52-6b9e-4b8e-9d8e-1f2a3b4c5d05";

export const tutorLessonMeta = (overrides: Partial<TutorLessonMeta> = {}): TutorLessonMeta => ({
  courseId: LESSON_COURSE_ID,
  lessonId: LESSON_ID,
  lessonTitle: "Chọn và thay đổi phần tử DOM",
  isCode: false,
  hintLevel: 0,
  lecturerName: "Trần Quốc Huy",
  conversation: null,
  ...overrides,
});

const lessonChat = (id: string, title: string, hoursAgo: number): AiChatSummary => ({
  id,
  kind: "lesson",
  title,
  contextLabel: "Bài: Chọn và thay đổi phần tử DOM",
  contextHref: lessonHref,
  courseId: LESSON_COURSE_ID,
  lessonId: LESSON_ID,
  updatedAt: ago(hoursAgo),
});
const generalChat = (id: string, title: string, label: string, href: string, hoursAgo: number): AiChatSummary => ({
  id,
  kind: "general",
  title,
  contextLabel: label,
  contextHref: href,
  courseId: null,
  lessonId: null,
  updatedAt: ago(hoursAgo),
});

export const tutorChats: AiChatSummary[] = [
  lessonChat(TUTOR_CHAT_LESSON, "querySelector khác getElementById thế nào?", 1),
  generalChat(TUTOR_CHAT_GENERAL, "Gợi ý khoá học tiếp theo cho mình", "Học tập của tôi", "/dashboard", 3),
  lessonChat(TUTOR_CHAT_HINT, "Cho mình gợi ý 3/3 · Khung cách làm", 26),
  lessonChat(TUTOR_CHAT_LECTURER, "Vì sao textContent xoá mất thẻ con?", 4 * 24),
  generalChat(TUTOR_CHAT_OLD, "Học lập trình mỗi tuần bao nhiêu giờ là đủ?", "Trang chủ", "/", 40 * 24),
];

const user = (id: string, text: string, metadata: AiChatMessage["metadata"] = {}): AiChatMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  metadata,
});

const lessonMessages: AiChatMessage[] = [
  user("m-l1", "querySelector khác getElementById thế nào?"),
  {
    id: "m-l2",
    role: "assistant",
    metadata: { vote: "up" },
    parts: [
      {
        type: "reasoning",
        text: "Học viên đang ở bài DOM, đã thấy querySelector trong video. Cần so sánh cách chọn và giá trị trả về, rồi hỏi ngược một câu để tự kiểm tra.",
        state: "done",
      },
      {
        type: "tool-search_course_material",
        toolCallId: "call-l1",
        state: "output-available",
        input: { query: "querySelector getElementById" },
        output: {
          hits: [
            {
              title: "Chọn và thay đổi phần tử DOM",
              chapter: "Trình duyệt và DOM",
              href: lessonHref,
              excerpt: "querySelector nhận một CSS selector và trả về phần tử đầu tiên khớp…",
            },
          ],
        },
      },
      {
        type: "text",
        text: [
          "Cả hai đều trả về **một phần tử**, khác ở cách bạn mô tả nó:",
          "",
          "- `getElementById(\"menu\")` chỉ tìm theo `id`, không có dấu `#`.",
          "- `querySelector(\"#menu\")` nhận mọi CSS selector, ví dụ `\".item:first-child\"` [Bài: Chọn và thay đổi phần tử DOM](" + lessonHref + ").",
          "",
          "Thử tự kiểm tra: nếu trang có 3 thẻ `.item`, `querySelector(\".item\")` trả về thẻ nào?",
        ].join("\n"),
        state: "done",
      },
    ],
  },
];

const generalMessages: AiChatMessage[] = [
  user("m-g1", "Gợi ý khoá học tiếp theo cho mình"),
  {
    id: "m-g2",
    role: "assistant",
    metadata: {},
    parts: [
      {
        type: "tool-get_my_learning",
        toolCallId: "call-g1",
        state: "output-available",
        input: {},
        output: { courses: [{ title: "JavaScript cơ bản", href: `/learn/${LESSON_COURSE_ID}`, done: 5, total: 12 }] },
      },
      {
        type: "tool-search_courses",
        toolCallId: "call-g2",
        state: "output-available",
        input: { query: "javascript nâng cao react" },
        output: {
          courses: [
            { id: "course-react-001", slug: "react-tu-co-ban", title: "React từ cơ bản", level: "Trung cấp", lessonCount: 24, price: 1290000, rating: 4.7, learners: 812, owned: false },
            { id: "course-ts-001", slug: "typescript-thuc-chien", title: "TypeScript thực chiến", level: "Trung cấp", lessonCount: 18, price: 990000, rating: 4.6, learners: 433, owned: false },
          ],
        },
      },
      {
        type: "tool-compare_courses",
        toolCallId: "call-g3",
        state: "output-available",
        input: { courseIds: ["course-react-001", "course-ts-001"] },
        output: {
          headers: ["Khoá học", "Trình độ", "Số bài", "Học phí", "Đánh giá"],
          rows: [
            ["React từ cơ bản", "Trung cấp", "24", "1.290.000 ₫", "4.7/5"],
            ["TypeScript thực chiến", "Trung cấp", "18", "990.000 ₫", "4.6/5"],
          ],
        },
      },
      {
        type: "text",
        text: "Bạn đang học **JavaScript cơ bản** (5/12 bài). Học xong phần DOM rồi chuyển sang [React từ cơ bản](/courses/react-tu-co-ban) là hợp nhất: bài đầu của React dùng lại đúng kiến thức chọn và đổi phần tử bạn đang học. TypeScript nên để sau khi đã quen React.",
        state: "done",
      },
    ],
  },
];

const hintMessages: AiChatMessage[] = [
  user("m-h1", "Cho mình gợi ý 3/3 · Khung cách làm", { hint: 3 }),
  {
    id: "m-h2",
    role: "assistant",
    metadata: { hint: 3 },
    parts: [
      {
        type: "text",
        text: "**Gợi ý 3/3 · Khung cách làm**\n\n1. In giá trị `items.length` trước vòng lặp để chắc danh sách không rỗng.\n2. Kiểm tra lại selector ở dòng 2 có khớp class trong HTML không.\n3. Chạy lại test và so sánh với kết quả mong đợi.",
        state: "done",
      },
      {
        type: "tool-suggest_code_change",
        toolCallId: "call-h1",
        state: "output-available",
        input: { at: 3, add: ["console.log(items.length);"] },
        output: {
          ok: true,
          diff: { at: 3, add: ["console.log(items.length);"], context: "for (const item of items) {", state: null },
        },
      },
    ],
  },
];

const lecturerMessages: AiChatMessage[] = [
  user("m-c1", "Vì sao textContent xoá mất thẻ con?"),
  {
    id: "m-c2",
    role: "assistant",
    metadata: { vote: "down", voteReason: "Khó hiểu" },
    parts: [
      {
        type: "text",
        text: "Mình không tìm thấy nội dung này trong học phần, nên không trả lời chắc chắn được. Bạn có thể hỏi giảng viên.",
        state: "done",
      },
    ],
  },
];

export const tutorChatDetails: Record<string, { chat: AiChatSummary; messages: AiChatMessage[]; lesson: TutorLessonMeta | null }> = {
  [TUTOR_CHAT_LESSON]: { chat: tutorChats[0]!, messages: lessonMessages, lesson: tutorLessonMeta() },
  [TUTOR_CHAT_GENERAL]: { chat: tutorChats[1]!, messages: generalMessages, lesson: null },
  [TUTOR_CHAT_HINT]: { chat: tutorChats[2]!, messages: hintMessages, lesson: tutorLessonMeta({ isCode: true, hintLevel: 3 }) },
  [TUTOR_CHAT_LECTURER]: {
    chat: tutorChats[3]!,
    messages: lecturerMessages,
    lesson: tutorLessonMeta({
      conversation: { id: 7, replied: true, resolved: false, lastReply: "textContent thay toàn bộ nội dung bên trong, kể cả thẻ con. Muốn giữ thẻ con thì đổi riêng một nút văn bản." },
    }),
  },
  [TUTOR_CHAT_OLD]: {
    chat: tutorChats[4]!,
    messages: [
      user("m-o1", "Học lập trình mỗi tuần bao nhiêu giờ là đủ?"),
      { id: "m-o2", role: "assistant", metadata: {}, parts: [{ type: "text", text: "Khoảng 5–7 giờ mỗi tuần, chia thành các buổi ngắn đều đặn, hiệu quả hơn một buổi dài cuối tuần.", state: "done" }] },
    ],
    lesson: null,
  },
};

/**
 * One streamed answer as UI message stream chunks (SSE `data:` lines): reasoning, a tool step, then text.
 * ui-lab plays them with small delays to show the live states.
 */
export const tutorStreamChunks: object[] = [
  { type: "start", messageId: "m-stream", messageMetadata: { createdAt: ago(0) } },
  { type: "start-step" },
  { type: "reasoning-start", id: "r1" },
  { type: "reasoning-delta", id: "r1", delta: "Học viên hỏi về vòng lặp trên danh sách phần tử. " },
  { type: "reasoning-delta", id: "r1", delta: "Cần tìm đoạn nói về querySelectorAll trong học phần." },
  { type: "reasoning-end", id: "r1" },
  { type: "tool-input-available", toolCallId: "call-s1", toolName: "search_course_material", input: { query: "querySelectorAll vòng lặp" } },
  {
    type: "tool-output-available",
    toolCallId: "call-s1",
    output: { hits: [{ title: "Chọn và thay đổi phần tử DOM", chapter: "Trình duyệt và DOM", href: lessonHref, excerpt: "querySelectorAll trả về NodeList, duyệt bằng for…of…" }] },
  },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  ...[
    "`querySelectorAll` trả về một **NodeList**, ",
    "nên bạn duyệt nó bằng `for…of` ",
    "giống như duyệt mảng ",
    `[Bài: Chọn và thay đổi phần tử DOM](${lessonHref}).\n\n`,
    "Thử đoán: nếu không có phần tử nào khớp, NodeList có bằng `null` không?",
  ].map((delta) => ({ type: "text-delta", id: "t1", delta })),
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish" },
];
