/**
 * Demo data for the lesson panels that have no server contract yet:
 * S11a in-lesson AI tutor, S11b lesson Q&A, S11h lecturer conversation.
 * The current lesson player cannot render them (see the ui-lab notes), so these are
 * kept loosely typed until the contracts exist.
 * TODO(type): replace with the real contract types once the AI tutor, Q&A and
 * lecturer-conversation endpoints are built.
 */

export type DemoTutorMessage = {
  role: "learner" | "tutor";
  text: string;
  /** Code-native answer hint, e.g. "dòng 12" or "00:04:10". */
  anchor?: string;
};

export const tutorThreadDefault: DemoTutorMessage[] = [
  { role: "learner", text: "Vì sao querySelector trả về null ở dòng 3?" },
  { role: "tutor", text: "Selector `#tieu-de` không khớp phần tử nào khi script chạy. Kiểm tra script có đặt sau thẻ HTML không.", anchor: "dòng 3" },
];

export type DemoQuestion = {
  id: number;
  text: string;
  status: "posted" | "answered";
  answer: { byLecturer: boolean; text: string } | null;
};

export const lessonQuestionsDefault: DemoQuestion[] = [
  { id: 1, text: "Khi nào nên dùng closest() thay vì parentElement?", status: "answered", answer: { byLecturer: true, text: "closest() tìm tổ tiên khớp selector; parentElement chỉ lấy cha trực tiếp." } },
  { id: 2, text: "Có cần xoá listener khi phần tử bị gỡ khỏi DOM không?", status: "posted", answer: null },
];

export type DemoConversationMessage = { from: "learner" | "lecturer"; text: string; at: string };

export const lecturerConversationDefault: { status: "draft" | "sent" | "replied" | "resolved"; messages: DemoConversationMessage[] } = {
  status: "replied",
  messages: [
    { from: "learner", text: "Em đã thử đoạn code này nhưng nút không đổi màu.", at: "2026-10-24T20:10:00.000Z" },
    { from: "lecturer", text: "Em kiểm tra lại event đã gắn vào đúng phần tử chưa nhé.", at: "2026-10-25T08:30:00.000Z" },
  ],
};
