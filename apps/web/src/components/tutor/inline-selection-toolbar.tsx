"use client";

import { useEffect, useState } from "react";
import { Button } from "@codi-1/ui/components/button";
import { Sparkles } from "lucide-react";

export function InlineSelectionToolbar() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    function hide() {
      setVisible(false);
      setSelectedText("");
    }

    function checkSelection(e?: MouseEvent | null) {
      const activeEl = document.activeElement;
      let text = "";
      let rect: { left: number; top: number; width?: number } | null = null;

      // Case 1: selection in code editor textarea
      if (
        activeEl instanceof HTMLTextAreaElement &&
        activeEl.classList.contains("cp-textarea") &&
        activeEl.selectionEnd > activeEl.selectionStart
      ) {
        text = activeEl.value.slice(
          activeEl.selectionStart,
          activeEl.selectionEnd,
        );
        const r = activeEl.getBoundingClientRect();
        rect =
          e && e.clientX
            ? { left: e.clientX, top: e.clientY - 12 }
            : { left: r.left + 40, top: r.top };
      } else {
        // Case 2: standard text selection in content
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          hide();
          return;
        }
        const node = sel.anchorNode;
        const host =
          node && (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement);
        if (
          host &&
          host.closest("#app-main, main") &&
          !host.closest(".overlay, .tutor-seltool, input, textarea, button")
        ) {
          text = sel.toString();
          const r = sel.getRangeAt(0).getBoundingClientRect();
          rect = { left: r.left + r.width / 2, top: r.top };
        }
      }

      const trimmed = text.trim();
      if (trimmed.length < 3 || !rect) {
        hide();
        return;
      }

      setSelectedText(trimmed.slice(0, 1200));
      const w = 180;
      const left = Math.max(
        8,
        Math.min(window.innerWidth - w - 8, rect.left - w / 2),
      );
      const top = Math.max(8, rect.top - 48);
      setPos({ left, top });
      setVisible(true);
    }

    function onMouseUp(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".tutor-seltool")) return;
      setTimeout(() => checkSelection(e), 20);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Escape") hide();
      else if (e.shiftKey) checkSelection(null);
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", hide, true);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!visible) return null;

  const handleAction = (explainOnly: boolean) => {
    const text = selectedText;
    setVisible(false);
    setSelectedText("");
    window.dispatchEvent(
      new CustomEvent("codi:tutor-open", {
        detail: {
          selection: text,
          ask: explainOnly ? "Giải thích giúp mình đoạn này." : undefined,
        },
      }),
    );
  };

  return (
    <div
      role="toolbar"
      aria-label="Hỏi AI về đoạn đã chọn"
      className="tutor-seltool fixed z-50 flex items-center gap-1.5 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        size="sm"
        variant="default"
        className="h-7 text-xs font-medium"
        onClick={() => handleAction(true)}
      >
        <Sparkles className="mr-1 size-3.5" />
        Giải thích
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 text-xs font-medium"
        onClick={() => handleAction(false)}
      >
        Hỏi AI
      </Button>
    </div>
  );
}
