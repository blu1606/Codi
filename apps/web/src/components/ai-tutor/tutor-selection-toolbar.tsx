"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@codi-1/ui/components/button";
import { TUTOR_CONTEXT_LIMITS } from "@/lib/ai-tutor-contract";
import { useTutor } from "./tutor-bridge";

type Selection = { text: string; code: boolean; left: number; top: number };

/** S11a': selecting lesson text or code shows a small toolbar that opens the tutor with that selection. */
export default function TutorSelectionToolbar({
  root,
}: {
  root: RefObject<HTMLElement | null>;
}) {
  const tutor = useTutor();
  const [selection, setSelection] = useState<Selection | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = (event?: MouseEvent) => {
      const area = root.current;
      if (!area) return;
      const active = document.activeElement;
      let text = "";
      let rect: { left: number; top: number } | null = null;
      let code = false;
      if (
        active instanceof HTMLTextAreaElement &&
        active.dataset.tutorCode !== undefined &&
        area.contains(active) &&
        active.selectionEnd > active.selectionStart
      ) {
        text = active.value.slice(active.selectionStart, active.selectionEnd);
        code = true;
        const box = active.getBoundingClientRect();
        rect = event?.clientX
          ? { left: event.clientX, top: event.clientY - 12 }
          : { left: box.left + 80, top: box.top };
      } else {
        const current = window.getSelection();
        const node = current?.rangeCount ? current.anchorNode : null;
        const host = node instanceof Element ? node : node?.parentElement;
        if (
          current &&
          host &&
          area.contains(host) &&
          !host.closest("input, textarea, button, [role=dialog]")
        ) {
          text = current.toString();
          const box = current.getRangeAt(0).getBoundingClientRect();
          rect = { left: box.left + box.width / 2, top: box.top };
        }
      }
      text = text.trim();
      setSelection(
        text.length >= 3 && rect
          ? {
              text: text.slice(0, TUTOR_CONTEXT_LIMITS.selection),
              code,
              ...rect,
            }
          : null,
      );
    };
    const up = (event: MouseEvent | TouchEvent) => {
      if (bar.current?.contains(event.target as Node)) return;
      window.setTimeout(
        () => read(event instanceof MouseEvent ? event : undefined),
        0,
      );
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
      else if (event.shiftKey) read();
    };
    const hide = () => setSelection(null);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchend", up);
    document.addEventListener("keyup", key);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchend", up);
      document.removeEventListener("keyup", key);
      window.removeEventListener("scroll", hide, true);
    };
  }, [root]);

  if (!tutor || !selection) return null;
  const actions = selection.code
    ? [
        ["Giải thích đoạn này", "Giải thích giúp mình đoạn code này."],
        ["Vì sao lỗi?", "Vì sao đoạn code này bị lỗi hoặc cho kết quả sai?"],
      ]
    : [
        ["Giải thích", "Giải thích giúp mình đoạn này."],
        ["Cho ví dụ", "Cho mình một ví dụ khác về đoạn này."],
        ["Hỏi thêm", null],
      ];
  const width = selection.code ? 260 : 270;
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Hỏi AI về đoạn đã chọn"
      className="fixed z-50 flex gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop"
      style={{
        left: Math.max(
          8,
          Math.min(window.innerWidth - width - 8, selection.left - width / 2),
        ),
        top: Math.max(8, selection.top - 52),
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {actions.map(([label, ask], index) => (
        <Button
          key={label}
          size="sm"
          variant={index === 0 ? "default" : "ghost"}
          onClick={() => {
            const text = selection.text;
            setSelection(null);
            tutor.open({ selection: text, ...(ask ? { ask } : {}) });
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
