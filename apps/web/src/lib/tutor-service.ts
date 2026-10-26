import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { aiInteractionLogs } from "@codi-1/db";
import {
  generateHint,
  generateSocraticAnswer,
  type TutorCommand,
  type TutorContext,
  type TutorMessage,
  type TutorThreadView,
} from "./tutor-contract";

const LOG_MAX = 40;
const memoryThreads = new Map<string, TutorMessage[]>();
const userRateLimits = new Map<string, number[]>();

function threadKey(userId: string, lessonId: string): string {
  return `${userId}:${lessonId}`;
}

export function checkTutorRateLimit(
  userId: string,
  windowMs = 60_000,
  maxRequests = 15,
): boolean {
  const now = Date.now();
  const timestamps = (userRateLimits.get(userId) || []).filter(
    (t) => now - t < windowMs,
  );
  if (timestamps.length >= maxRequests) {
    return false; // Rate limited
  }
  timestamps.push(now);
  userRateLimits.set(userId, timestamps);
  return true;
}

export function getMemoryThread(
  userId: string,
  lessonId: string,
): TutorMessage[] {
  const key = threadKey(userId, lessonId);
  return memoryThreads.get(key) || [];
}

export function setMemoryThread(
  userId: string,
  lessonId: string,
  messages: TutorMessage[],
) {
  const key = threadKey(userId, lessonId);
  if (messages.length > LOG_MAX) {
    messages = messages.slice(-LOG_MAX);
  }
  memoryThreads.set(key, messages);
}

export function clearMemoryThread(userId: string, lessonId: string) {
  const key = threadKey(userId, lessonId);
  memoryThreads.delete(key);
}

export async function executeTutorTurn(
  store: Database | null,
  userId: string,
  courseId: string,
  lessonId: string,
  cmd: TutorCommand,
): Promise<TutorThreadView> {
  const thread = [...getMemoryThread(userId, lessonId)];

  if (cmd.type === "clear") {
    clearMemoryThread(userId, lessonId);
    return {
      lessonId,
      messages: [],
      hintLevel: 0,
      availablePrompts: getPrompts(false),
    };
  }

  if (cmd.type === "vote") {
    const msg = thread.find((m) => m.id === cmd.messageId);
    if (msg) {
      msg.vote = cmd.vote;
      msg.reason = cmd.reason || null;
      setMemoryThread(userId, lessonId, thread);
    }
    return {
      lessonId,
      messages: thread,
      hintLevel: getCurrentHintLevel(thread),
      availablePrompts: getPrompts(false),
    };
  }

  // Rate limit check
  if (!checkTutorRateLimit(userId)) {
    const limitMsg: TutorMessage = {
      id: `tut-limit-${Date.now()}`,
      role: "limit",
      text: "Bạn đã hỏi quá nhiều trong thời gian ngắn",
      at: new Date().toISOString(),
    };
    thread.push(limitMsg);
    setMemoryThread(userId, lessonId, thread);
    return {
      lessonId,
      messages: thread,
      hintLevel: getCurrentHintLevel(thread),
      availablePrompts: getPrompts(false),
    };
  }

  if (cmd.type === "ask") {
    const userMsg: TutorMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: cmd.text,
      at: new Date().toISOString(),
    };
    thread.push(userMsg);

    const ctx = cmd.context || {};
    const removed = new Set(cmd.removedChips || []);
    const { text, lines } = generateSocraticAnswer(ctx, cmd.text, removed);

    const aiMsg: TutorMessage = {
      id: `tut-${Date.now()}`,
      role: "ai",
      text,
      lines: lines.length ? lines : undefined,
      at: new Date().toISOString(),
    };
    thread.push(aiMsg);
    setMemoryThread(userId, lessonId, thread);

    // Audit log
    if (store) {
      try {
        await store.insert(aiInteractionLogs).values({
          userId,
          courseId,
          lessonId,
          requestType: "ask_assistant",
          userPrompt: cmd.text,
          aiResponse: text,
          isSuccess: true,
        });
      } catch {
        // Non-blocking
      }
    }

    return {
      lessonId,
      messages: thread,
      hintLevel: getCurrentHintLevel(thread),
      availablePrompts: getPrompts(ctx.isCodeLesson),
    };
  }

  if (cmd.type === "hint") {
    const currentLevel = getCurrentHintLevel(thread);
    const nextLevel = Math.min(Math.max((cmd.level ?? currentLevel + 1), 1), 3);
    const ctx = cmd.context || {};

    const userMsg: TutorMessage = {
      id: `user-hint-${Date.now()}`,
      role: "user",
      text: `Cho mình gợi ý ${nextLevel}/3`,
      at: new Date().toISOString(),
    };
    thread.push(userMsg);

    const hint = generateHint(ctx, nextLevel);
    const aiMsg: TutorMessage = {
      id: `tut-hint-${Date.now()}`,
      role: "ai",
      text: hint.text,
      lines: hint.lines,
      diff: hint.diff,
      at: new Date().toISOString(),
    };
    thread.push(aiMsg);
    setMemoryThread(userId, lessonId, thread);

    if (store) {
      try {
        await store.insert(aiInteractionLogs).values({
          userId,
          courseId,
          lessonId,
          requestType: "ask_assistant",
          userPrompt: `Cho mình gợi ý ${nextLevel}/3`,
          aiResponse: hint.text,
          hintLevel: nextLevel,
          isSuccess: true,
        });
      } catch {
        // Non-blocking
      }
    }

    return {
      lessonId,
      messages: thread,
      hintLevel: nextLevel,
      availablePrompts: getPrompts(ctx.isCodeLesson),
    };
  }

  return {
    lessonId,
    messages: thread,
    hintLevel: getCurrentHintLevel(thread),
    availablePrompts: getPrompts(false),
  };
}

function getCurrentHintLevel(messages: TutorMessage[]): number {
  let level = 0;
  for (const m of messages) {
    if (m.text.includes("Gợi ý 3/3")) level = Math.max(level, 3);
    else if (m.text.includes("Gợi ý 2/3")) level = Math.max(level, 2);
    else if (m.text.includes("Gợi ý 1/3")) level = Math.max(level, 1);
  }
  return level;
}

export function getPrompts(isCodeLesson?: boolean): string[] {
  return isCodeLesson
    ? [
        "Vì sao code của mình chưa chạy đúng?",
        "Giải thích lại yêu cầu của bài",
        "Lỗi hay gặp ở bài này là gì?",
      ]
    : [
        "Tóm tắt ý chính của bài",
        "Cho mình một ví dụ khác",
        "Lỗi hay gặp ở bài này là gì?",
      ];
}
