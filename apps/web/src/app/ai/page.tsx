"use client";

import { useChat } from "@ai-sdk/react";
import { Bubble, BubbleContent } from "@codi-1/ui/components/bubble";
import { Button } from "@codi-1/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@codi-1/ui/components/input-group";
import {
  Message,
  MessageContent as MessageBody,
  MessageHeader,
} from "@codi-1/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@codi-1/ui/components/message-scroller";
import { Tooltip, TooltipContent, TooltipTrigger } from "@codi-1/ui/components/tooltip";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, Loader2, MessageCircleDashedIcon, RotateCwIcon } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Streamdown } from "streamdown";

const SUGGESTED_PROMPTS = [
  "Tôi là người mới bắt đầu, nên học khóa nào trước?",
  "Tư vấn lộ trình trở thành Fullstack Web Developer",
  "Khóa học ôn luyện Cấu trúc dữ liệu & Giải thuật cho OJT",
  "Lộ trình học AI Engineer & phát triển AI Agent",
];

export default function AIPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai",
    }),
  });
  const isSending = status === "submitted" || status === "streaming";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    sendMessage({ text });
    setInput("");
  };

  const handleSelectPrompt = (promptText: string) => {
    if (isSending) return;
    sendMessage({ text: promptText });
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const resetConversation = () => {
    setInput("");
    setMessages([]);
  };

  return (
    <MessageScrollerProvider>
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="shrink-0 border-b px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-sm font-medium">Codi AI Course Advisor</h1>
              <p className="text-xs/relaxed text-muted-foreground">Tư vấn định hướng lộ trình & khoá học lập trình cá nhân hoá</p>
            </div>
            <div className="shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Reset conversation"
                      onClick={resetConversation}
                      disabled={isSending}
                    />
                  }
                >
                  <RotateCwIcon />
                </TooltipTrigger>
                <TooltipContent>Reset</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          {messages.length === 0 && !isSending ? (
            <Empty className="mx-auto h-full max-w-3xl px-4 flex flex-col justify-center">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleDashedIcon />
                </EmptyMedia>
                <EmptyTitle>Chào bạn! Codi có thể giúp gì cho bạn?</EmptyTitle>
                <EmptyDescription>
                  Hãy chia sẻ mục tiêu học tập, định hướng nghề nghiệp hoặc chọn gợi ý bên dưới để nhận tư vấn lộ trình và khóa học phù hợp nhất.
                </EmptyDescription>
              </EmptyHeader>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSelectPrompt(prompt)}
                    className="text-left text-xs p-3 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>
            </Empty>
          ) : (
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent
                  aria-busy={isSending}
                  className="mx-auto w-full max-w-3xl px-4 py-6"
                >
                  {messages.map((message) => {
                    const isUser = message.role === "user";

                    return (
                      <MessageScrollerItem key={message.id} scrollAnchor={isUser}>
                        <Message align={isUser ? "end" : "start"}>
                          <MessageBody>
                            <MessageHeader>{isUser ? "You" : "AI Assistant"}</MessageHeader>
                            <Bubble
                              align={isUser ? "end" : "start"}
                              variant={isUser ? "default" : "secondary"}
                            >
                              <BubbleContent>
                                {message.parts?.map((part, index) => {
                                  if (part.type === "text") {
                                    return (
                                      <Streamdown
                                        key={index}
                                        isAnimating={
                                          status === "streaming" && message.role === "assistant"
                                        }
                                      >
                                        {part.text}
                                      </Streamdown>
                                    );
                                  }
                                  return null;
                                })}
                              </BubbleContent>
                            </Bubble>
                          </MessageBody>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })}
                  {status === "submitted" && (
                    <MessageScrollerItem>
                      <Message align="start">
                        <MessageBody>
                          <Bubble variant="secondary">
                            <BubbleContent className="flex items-center gap-2">
                              <Loader2 className="size-3.5 animate-spin" />
                              <span className="shimmer">Thinking...</span>
                            </BubbleContent>
                          </Bubble>
                        </MessageBody>
                      </Message>
                    </MessageScrollerItem>
                  )}
                  <MessageScrollerItem scrollAnchor />
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          )}
        </main>
        <footer className="shrink-0 border-t px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <form onSubmit={handleSubmit} className="w-full">
              <InputGroup>
                <InputGroupTextarea
                  name="prompt"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="Type your message..."
                  className="max-h-32 min-h-14"
                  rows={1}
                  autoComplete="off"
                  autoFocus
                  disabled={isSending}
                />
                <InputGroupAddon align="block-end" className="pt-1">
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={isSending || !input.trim()}
                    className="ml-auto"
                  >
                    {isSending ? <Loader2 className="animate-spin" /> : <ArrowUpIcon />}
                    <span className="sr-only">Send</span>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </footer>
      </div>
    </MessageScrollerProvider>
  );
}
