"use client";

import { createContext, useContext } from "react";
import type { TutorContext } from "@/lib/ai-tutor-contract";

// What the lesson's code editor lends the tutor: the context it reads and the actions an answer can take.
export type TutorCodeBridge = {
  /** Exercise instructions or the current tutorial step, read as the screen's pre-context. */
  task(): { label: string; text: string } | null;
  getCode(): string;
  setCode(code: string): void;
  selectLine(line: number): void;
  runTests(): void;
  failingTest(testId?: number): NonNullable<TutorContext["failingTest"]> | null;
  runError(): string | null;
};
export type TutorOpenRequest = {
  selection?: string;
  testId?: number;
  ask?: string;
};
export type TutorBridge = {
  open(request?: TutorOpenRequest): void;
  registerCode(code: TutorCodeBridge | null): void;
};

/** "Xem dòng N": selects that line in a code textarea and scrolls it into view. */
export function selectEditorLine(
  editor: HTMLTextAreaElement | null,
  line: number,
) {
  if (!editor) return;
  const lines = editor.value.split("\n");
  const index = Math.min(Math.max(line, 1), lines.length) - 1;
  const start = lines
    .slice(0, index)
    .reduce((sum, text) => sum + text.length + 1, 0);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, start + lines[index]!.length);
  const height = parseFloat(getComputedStyle(editor).lineHeight) || 24;
  editor.scrollTop = Math.max(0, index * height - editor.clientHeight / 2);
  editor.scrollIntoView({ block: "center", behavior: "smooth" });
}

export const TutorBridgeContext = createContext<TutorBridge | null>(null);
/** Null outside a lesson player, so lesson components keep working on their own. */
export const useTutor = () => useContext(TutorBridgeContext);
