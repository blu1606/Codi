import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockHeaders = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    },
  },
}));

import { PATCH } from "./route";

function createJsonRequest(body: any, malformed = false): NextRequest {
  if (malformed) {
    return {
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token in JSON")),
    } as unknown as NextRequest;
  }
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe("PATCH /api/user/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers({ "x-custom-test": "val" }));
  });

  it("trả về 401 Unauthorized khi không có phiên đăng nhập", async () => {
    // Arrange
    mockGetSession.mockResolvedValue(null);
    const request = createJsonRequest({ name: "Nguyen Van A" });

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["thiếu trường name", {}],
    ["name là null", { name: null }],
    ["name là số", { name: 12345 }],
    ["name là chuỗi rỗng", { name: "" }],
    ["name chỉ gồm khoảng trắng", { name: "   " }],
  ])("trả về 400 khi payload không hợp lệ: %s", async (_, body) => {
    // Arrange
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "learner@codi.vn" },
    });
    const request = createJsonRequest(body);

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Họ và tên không được để trống" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("cập nhật thành công, gọi Better Auth với name đã trim và trả về 200", async () => {
    // Arrange
    const rawName = "  Tran Thi B  ";
    const trimmedName = "Tran Thi B";
    mockGetSession.mockResolvedValue({
      user: { id: "user-42", email: "tranthib@codi.vn" },
    });
    mockUpdateUser.mockResolvedValue({ success: true });
    const request = createJsonRequest({ name: rawName });

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: "Cập nhật hồ sơ thành công",
      user: {
        id: "user-42",
        name: trimmedName,
        email: "tranthib@codi.vn",
      },
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({
      body: { name: trimmedName },
      headers: expect.anything(),
    });
  });

  it("trả về 500 khi Better Auth API ném lỗi có thông điệp", async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@codi.vn" },
    });
    mockUpdateUser.mockRejectedValue(new Error("Database connection failed"));
    const request = createJsonRequest({ name: "Hop Le" });

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "Database connection failed" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("trả về 500 với fallback message khi lỗi không chứa thuộc tính message", async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@codi.vn" },
    });
    mockUpdateUser.mockRejectedValue({});
    const request = createJsonRequest({ name: "Hop Le" });

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "Đã xảy ra lỗi khi cập nhật hồ sơ" });
    consoleErrorSpy.mockRestore();
  });

  it("trả về 500 khi request JSON bị malformed", async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@codi.vn" },
    });
    const request = createJsonRequest(null, true);

    // Act
    const response = await PATCH(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe("Unexpected token in JSON");
    consoleErrorSpy.mockRestore();
  });
});
