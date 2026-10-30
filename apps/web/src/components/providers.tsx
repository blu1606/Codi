"use client";

import { Toaster } from "@codi-1/ui/components/sonner";

import { DemoFallbackProvider } from "@/demo-fixtures/demo-fallback-provider";
import { AiChatProvider } from "./ai-chat/ai-chat-provider";
import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AiChatProvider>{children}</AiChatProvider>
      <Toaster richColors />
      <DemoFallbackProvider />
    </ThemeProvider>
  );
}
