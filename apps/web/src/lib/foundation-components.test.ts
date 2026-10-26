// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "@codi-1/ui/components/confirm-dialog";
import { ProgressRing } from "@codi-1/ui/components/progress-ring";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
function render(element: Parameters<Root["render"]>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
}
afterEach(() => { act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });
function dialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const props = { open: true, title: "Ẩn khoá học", consequence: "Học viên mới không thể mua.", reversible: "Có thể hiện lại.", onOpenChange: vi.fn(), onConfirm: vi.fn(), ...overrides };
  render(createElement(ConfirmDialog, props));
  return props;
}
function submit() { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }

describe("foundation component behavior", () => {
  it("does not execute a reason-required action even if form submission is forced", async () => {
    const props = dialog({ requireReason: true });
    await act(async () => submit());
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Vui lòng nhập lý do.");
  });
  it("requires the typed confirmation before executing", async () => {
    const props = dialog({ typeToConfirm: "XOÁ" });
    await act(async () => submit());
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
  it("submits only once while an operation is pending, then closes on success", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const props = dialog({ onConfirm });
    await act(async () => { submit(); submit(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => finish());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
  it("keeps the dialog open and shows an inline server error", async () => {
    const props = dialog({ onConfirm: vi.fn().mockRejectedValue(new Error("Không đủ quyền.")) });
    await act(async () => submit());
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Không đủ quyền.");
  });
  it("exposes a bounded numeric progress value to assistive technology", () => {
    render(createElement(ProgressRing, { value: 125, label: "Mục tiêu tuần" }));
    const progress = document.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute("aria-valuenow")).toBe("100");
    expect(progress.getAttribute("aria-label")).toBe("Mục tiêu tuần");
  });
  it("always renders a visible mastery label", () => {
    render(createElement(MasteryChip, { level: 0 }));
    expect(document.body.textContent).toContain("Chưa học");
  });
});
