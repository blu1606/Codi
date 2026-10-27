import AiChatPage from "@/components/ai-chat/ai-chat-page";

export const metadata = { title: "Tutor · Codi" };

/** The Tutor's full page: the same chats as the floating panel, with the whole history (guests: no history). */
export default async function AIPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <AiChatPage initialChatId={c && /^[0-9a-f-]{36}$/i.test(c) ? c : null} />;
}
