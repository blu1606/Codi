import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TutorLauncher } from "./tutor-launcher";

const props = {
  endpoint: "/api/learn/c/lessons/l/tutor",
  viewerName: "Nguyễn Minh Anh",
  onOpenChange: vi.fn(),
  onAsk: vi.fn(),
};

describe("tutor launcher popup", () => {
  it("shows only the round launcher while closed", () => {
    const html = renderToStaticMarkup(createElement(TutorLauncher, { ...props, open: false }));
    expect(html).toContain('aria-label="Mở trợ lý AI"');
    expect(html).not.toContain("Bạn có thể hỏi");
  });

  it("opens the popup with greeting, starters, composer and the rules link", () => {
    const html = renderToStaticMarkup(createElement(TutorLauncher, { ...props, open: true }));
    expect(html).toContain("Trợ lý AI");
    expect(html).toContain("Chào Anh");
    expect(html).toContain("Bạn có thể hỏi");
    expect(html).toContain("Tóm tắt ý chính của bài");
    expect(html).toContain("Hỏi trợ lý về bài học…");
    expect(html).toContain("Lưu ý khi dùng trợ lý AI");
    expect(html).toContain('aria-label="Mở rộng thành thanh bên"');
  });

  it("omits the greeting chip when the learner has no name", () => {
    const html = renderToStaticMarkup(createElement(TutorLauncher, { ...props, viewerName: null, open: true }));
    expect(html).not.toContain("Chào ");
  });
});
