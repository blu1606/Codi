import { describe, expect, it } from "vitest";
import { notificationPath } from "./notification-link";

describe("notificationPath", () => {
  it("maps the stored lecturer course-review link to the course editor publish tab", () => {
    expect(notificationPath("/dashboard/lecturer/courses/c-1/publish")).toBe("/teach/courses/c-1/publish");
  });

  it("maps the lecturer home link and keeps the query string of admin links", () => {
    expect(notificationPath("/dashboard/lecturer")).toBe("/teach");
    expect(notificationPath("/dashboard/admin/publication?tab=pending&id=c-1")).toBe("/admin/publication?tab=pending&id=c-1");
  });

  it("keeps app routes that are already valid", () => {
    expect(notificationPath("/teach/courses/c-1/publish")).toBe("/teach/courses/c-1/publish");
    expect(notificationPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects links that are not app-relative paths", () => {
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath("")).toBeNull();
    expect(notificationPath("https://evil.example/teach")).toBeNull();
    expect(notificationPath("//evil.example/teach")).toBeNull();
    expect(notificationPath("/teach/a b")).toBeNull();
    expect(notificationPath("/teach\\x")).toBeNull();
  });
});
