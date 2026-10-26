import type { TutorMessage, TutorThreadSummary, TutorView } from "@/lib/ai-tutor-contract";
import { LESSON_ID } from "./s11-lesson-player";

/** Demo data for the in-lesson tutor (S11a) and the full Tutor page (S11t). */

const at = "2026-10-26T03:00:00.000Z";
const message = (id: number, role: TutorMessage["role"], text: string, extra: Partial<TutorMessage> = {}): TutorMessage => ({
  id,
  role,
  text,
  lines: [],
  diff: null,
  stopped: false,
  vote: null,
  reason: null,
  at,
  ...extra,
});

const lecturerName = "Trần Quốc Huy";

const answered: TutorMessage[] = [
  message(1, "user", "Tóm tắt ý chính của bài"),
  message(2, "ai", "Ý chính của bài **Chọn và thay đổi phần tử DOM**: dùng `querySelector` để tìm phần tử đầu tiên khớp một CSS selector, rồi đổi nội dung hoặc thuộc tính của nó.\n\nĐể chắc là bạn đã nắm bài, thử:\n- Nói lại bằng lời của bạn điều bài muốn bạn làm được\n- Ghi ra một chỗ bạn còn chưa chắc rồi hỏi mình cụ thể chỗ đó"),
  message(3, "user", "Vì sao nó trả về null?"),
  message(4, "ai", "`querySelector` trả về `null` khi không có phần tử nào khớp selector. Kiểm tra lại id trong HTML, hoặc đặt script sau phần HTML chứa phần tử đó.\n\nThử tự trả lời trước: selector trong code có khớp đúng với thuộc tính `id` trong trang không?"),
];

const hintLevel2: TutorMessage[] = [
  message(1, "user", "Vì sao code của mình chưa chạy đúng?"),
  message(2, "ai", "Code đang trả về sai ở test **Cộng hai số**. Mình không viết sẵn lời giải; hãy tính tay một cặp input trước."),
  message(3, "user", "Cho mình gợi ý 1/3"),
  message(4, "ai", "**Gợi ý 1/3 · Hướng nghĩ**\n\nĐọc lại yêu cầu và tự hỏi: hàm cần trả về kiểu dữ liệu gì? Viết ra 2–3 cặp input → output trước khi sửa code."),
  message(5, "user", "Cho mình gợi ý 2/3"),
  message(6, "ai", "**Gợi ý 2/3 · Chỗ cần xem lại**\n\nGiá trị sai nhiều khả năng hình thành ở **dòng 3**. So sánh giá trị ở đó với kết quả bạn tính tay.", { lines: [3] }),
];

const diffMessage = (state: "applied" | "skipped" | null): TutorMessage =>
  message(8, "ai", "**Gợi ý 3/3 · Khung cách làm**\n\nThêm một dòng in giá trị ngay trước **dòng 3**, chạy lại và đối chiếu với kết quả mong đợi. Phần sửa logic vẫn do bạn tự viết.", {
    lines: [3],
    diff: { at: 3, add: ["  console.log('Kiểm tra trước dòng 3:', a + b);"], context: "  return a + b;", state },
  });

const hintLevel3 = (state: "applied" | "skipped" | null): TutorMessage[] => [
  ...hintLevel2,
  message(7, "user", "Cho mình gợi ý 3/3"),
  diffMessage(state),
];

const view = (overrides: Partial<TutorView>): TutorView => ({
  lessonTitle: "Chọn và thay đổi phần tử DOM",
  isCode: false,
  hintLevel: 0,
  lecturerName,
  messages: [],
  conversation: null,
  ...overrides,
});

/** Non-code lesson with one answered exchange (the default thread). */
export const tutorAnswered = view({ messages: answered });
/** No thread yet: the contextual starters show. */
export const tutorEmpty = view({});
/** Same empty thread on a code lesson, where the editor's context chips are offered. */
export const tutorCodeEmpty = view({ isCode: true });
/** Code lesson with the hint ladder at 2/3, line reference included. */
export const tutorHintLevel2 = view({ isCode: true, hintLevel: 2, messages: hintLevel2 });
/** Hint 3/3 with a 1-line suggestion the learner has not applied yet. */
export const tutorDiffPending = view({ isCode: true, hintLevel: 3, messages: hintLevel3(null) });
/** The same suggestion after "Áp dụng": the editor has it and "Hoàn tác" is offered. */
export const tutorDiffApplied = view({ isCode: true, hintLevel: 3, messages: hintLevel3("applied") });
/** The last turn failed; the question stays in the thread for "Thử lại". */
export const tutorError = view({
  messages: [
    ...answered,
    message(5, "user", "Vì sao vòng lặp không dừng?"),
    message(6, "error", "Vì sao vòng lặp không dừng?"),
  ],
});
/** Rate limited: the question stays visible with the warning. */
export const tutorRateLimited = view({
  messages: [
    ...answered,
    message(5, "user", "Vì sao vòng lặp không dừng?"),
    message(6, "limit", ""),
  ],
});
/** A private conversation with the lecturer exists and has a reply. */
export const tutorEscalated = view({
  messages: answered,
  conversation: { id: 7, replied: true, resolved: false, lastReply: "Em kiểm tra lại điều kiện dừng của vòng lặp nhé." },
});

/** Threads of the seeded learner in this course, newest first. */
export const tutorThreadsDefault: TutorThreadSummary[] = [
  { lessonId: LESSON_ID, lessonTitle: "Chọn và thay đổi phần tử DOM", firstQuestion: "Tóm tắt ý chính của bài", lastAt: "2026-10-26T03:00:00.000Z", messageCount: 4 },
  { lessonId: "lesson-js-004", lessonTitle: "Mảng và vòng lặp", firstQuestion: "Vì sao vòng lặp for không dừng?", lastAt: "2026-10-25T10:00:00.000Z", messageCount: 6 },
  { lessonId: "lesson-js-002", lessonTitle: "Hàm và tham số", firstQuestion: "return khác console.log ở điểm nào?", lastAt: "2026-09-18T04:00:00.000Z", messageCount: 2 },
];
export const tutorThreadsEmpty: TutorThreadSummary[] = [];
