import AiChatPage from "@/components/ai-chat/ai-chat-page";
import { AI_CHAT_QUESTION_MAX } from "@/lib/ai-chat-contract";

export const metadata = { title: "Tutor · Codi" };

/**
 * The Tutor's full page: the same chats as the floating panel, with the whole history (guests: no history).
 * `?prompt=` is a question from another screen (a course or catalogue CTA), asked once in a new chat.
 */
export default async function AIPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; prompt?: string }>;
}) {
  const { c, prompt } = await searchParams;
  const question = prompt?.trim().slice(0, AI_CHAT_QUESTION_MAX) || null;
  return (
    <AiChatPage
      initialChatId={c && /^[0-9a-f-]{36}$/i.test(c) ? c : null}
      prompt={question}
    />
  );
}
