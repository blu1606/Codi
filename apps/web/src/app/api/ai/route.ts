import { devToolsMiddleware } from "@ai-sdk/devtools";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
  wrapLanguageModel,
} from "ai";

import { getLlmProvider } from "@/lib/ai";
import { getCourseCatalogPrompt } from "@/lib/data/courses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const maxDuration = 30;

const SYSTEM_PROMPT = `Bạn là Trợ lý AI Cố vấn Đào tạo & Khóa học thông minh của nền tảng Codi (Codi Course Advisor).
Nhiệm vụ của bạn:
1. Lắng nghe nhu cầu, sở thích, định hướng nghề nghiệp, trình độ hiện tại và quỹ thời gian của học viên.
2. Tư vấn lộ trình học tập lập trình rõ ràng, bài bản, từng bước cụ thể và truyền cảm hứng.
3. Giới thiệu và đề xuất các khóa học phù hợp nhất từ danh mục khóa học của Codi (bên dưới). Luôn giải thích lý do tại sao khóa học đó phù hợp với mục tiêu của học viên.
4. Trình bày câu trả lời chuyên nghiệp, dùng định dạng Markdown rõ ràng (tiêu đề, bullet points, in đậm các ý chính). Giữ phong thái thân thiện, nhiệt tình và mang tính giáo dục cao.

--- DANH MỤC KHÓA HỌC CỦA NỀN TẢNG CODI ---
${getCourseCatalogPrompt()}
-------------------------------------------`;

export async function POST(req: Request) {
  // 1. Kiểm tra Rate Limiting (10 requests / 1 phút mỗi IP)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { windowMs: 60 * 1000, max: 10 });

  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return new Response(
      JSON.stringify({
        error: "Bạn đã gửi quá nhiều yêu cầu tư vấn. Vui lòng đợi trong giây lát rồi thử lại.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  try {
    // 2. Xử lý body request
    const body = await req.json();
    const messages: UIMessage[] = body.messages || [];

    // 3. Khởi tạo LLM Provider & Stream câu trả lời
    const model = wrapLanguageModel({
      model: getLlmProvider().getModel(),
      middleware: devToolsMiddleware(),
    });

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (error: any) {
    console.error("AI Course Advisor Error:", error);
    return new Response(
      JSON.stringify({
        error: error?.message || "Đã có lỗi xảy ra khi gọi AI API.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
