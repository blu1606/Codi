"use client";

import { toast } from "sonner";

/** Call after a reversible self-action succeeds; the caller supplies its real inverse. */
export function undoToast(message: string, undo: () => void | Promise<void>) {
  let pending = false;
  return toast(message, { duration: 10000, action: {
    label: "Hoàn tác",
    onClick: async () => {
      if (pending) return;
      pending = true;
      try { await undo(); toast.success("Đã hoàn tác."); }
      catch { toast.error("Không thể hoàn tác. Vui lòng thử lại."); }
    },
  } });
}
