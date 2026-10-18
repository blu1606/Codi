import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext (Open Redirect Prevention)", () => {
  it("defaults to /dashboard for empty, null, or undefined values", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("   ")).toBe("/dashboard");
  });

  it("respects custom fallback when provided", () => {
    expect(safeNext(null, "/")).toBe("/");
    expect(safeNext("https://evil.com", "/courses")).toBe("/courses");
  });

  it("allows valid relative paths", () => {
    expect(safeNext("/courses")).toBe("/courses");
    expect(safeNext("/courses/frontend-react-nextjs")).toBe("/courses/frontend-react-nextjs");
    expect(safeNext("/cart?discount=10")).toBe("/cart?discount=10");
    expect(safeNext("/dashboard#settings")).toBe("/dashboard#settings");
  });

  it("rejects absolute URLs and external domains", () => {
    expect(safeNext("https://example.com")).toBe("/dashboard");
    expect(safeNext("http://malicious.site/phish")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("data:text/html,<html>")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs (//)", () => {
    expect(safeNext("//example.com")).toBe("/dashboard");
    expect(safeNext("///example.com")).toBe("/dashboard");
  });

  it("rejects backslash-based evasion (/\\ or \\)", () => {
    expect(safeNext("/\\example.com")).toBe("/dashboard");
    expect(safeNext("\\example.com")).toBe("/dashboard");
    expect(safeNext("/test\\evil.com")).toBe("/dashboard");
  });

  it("rejects control characters, tabs, newlines, and unprintable characters", () => {
    expect(safeNext("/\texample.com")).toBe("/dashboard");
    expect(safeNext("/\nexample.com")).toBe("/dashboard");
    expect(safeNext("/\rexample.com")).toBe("/dashboard");
    expect(safeNext("/\u0000evil.com")).toBe("/dashboard");
    expect(safeNext("/%09/evil.com")).toBe("/%09/evil.com");
  });
});
