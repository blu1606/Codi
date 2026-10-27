// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PathAdjustOffer } from "./path-adjust-offer";
import type { AdjustmentOffer } from "@/lib/learning-path-contract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function render(props: Partial<Parameters<typeof PathAdjustOffer>[0]>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const base = {
    offer: null,
    completing: false,
    applying: null,
    applied: null,
    error: null,
    onChoose: vi.fn(),
    onDismiss: vi.fn(),
    onViewPath: vi.fn(),
  };
  await act(async () => {
    root!.render(createElement(PathAdjustOffer, { ...base, ...props }));
  });
  return { ...base, ...props };
}

const offer: AdjustmentOffer = {
  afterLessonId: "lesson-1",
  insight: "Codi thấy bạn đã nắm vững Hàm.",
  options: [
    { type: "skip-mastered", label: "Bỏ qua các bài đã nắm vững", description: "Đánh dấu 1 bài có thể bỏ qua." },
    { type: "keep", label: "Giữ nguyên lộ trình", description: "Thứ tự các bài còn lại không đổi." },
  ],
};

describe("completion offer card", () => {
  it("shows the completed header immediately, without a blocking spinner, while the offer is pending", async () => {
    await render({ completing: true });
    expect(document.body.textContent).toContain("Đã hoàn thành bài học");
    expect(document.body.textContent).toContain("Codi đang xem lại lộ trình của bạn…");
    expect(document.querySelector('[role="region"]')).not.toBeNull();
  });

  it("offers only the server's options, each as a button, and reports the chosen one", async () => {
    const props = await render({ offer });
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent?.includes("Bỏ qua") || b.textContent?.includes("Giữ nguyên"));
    expect(buttons).toHaveLength(2);
    await act(async () => buttons[0]!.click());
    expect(props.onChoose).toHaveBeenCalledWith("skip-mastered");
  });

  it("disables options while one is applying and shows what changed with a link back to the path", async () => {
    await render({ offer, applying: "skip-mastered" });
    expect(document.body.textContent).toContain("Đang áp dụng…");
    const applyingButton = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Đang áp dụng"));
    expect(applyingButton?.disabled).toBe(true);
    await act(async () => root!.unmount());
    const { onViewPath } = await render({ applied: { summary: "Bài Hàm được đưa lên trước." } });
    expect(document.body.textContent).toContain("Đã cập nhật lộ trình: Bài Hàm được đưa lên trước.");
    const viewPath = [...document.querySelectorAll("button")].find((b) => b.textContent === "Xem lộ trình");
    expect(viewPath).toBeDefined();
    await act(async () => viewPath!.click());
    expect(onViewPath).toHaveBeenCalledTimes(1);
  });
});
