import { describe, expect, it } from "vitest";
import { mapSignInError } from "@/lib/sign-in-error";

describe("sign-in error mapping helper", () => {
  it("translates invalid credential code to friendly Vietnamese copy", () => {
    expect(
      mapSignInError({
        error: {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
          status: 401,
        },
      }),
    ).toBe("Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.");
  });

  it("translates raw Better Auth invalid message when code is omitted", () => {
    expect(
      mapSignInError({
        error: {
          message: "Invalid email or password",
          status: 401,
        },
      }),
    ).toBe("Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.");
  });

  it("preserves exact deactivated account message on 401 without transforming to credential error", () => {
    expect(
      mapSignInError({
        error: {
          message: "Tài khoản đã bị vô hiệu hoá.",
          status: 401,
        },
      }),
    ).toBe("Tài khoản đã bị vô hiệu hoá.");
  });

  it("preserves specific server errors and fallbacks on empty message", () => {
    expect(
      mapSignInError({
        error: {
          message: "Hệ thống đang bảo trì",
          status: 503,
        },
      }),
    ).toBe("Hệ thống đang bảo trì");

    expect(
      mapSignInError({
        error: {
          status: 500,
        },
      }),
    ).toBe("Đăng nhập thất bại. Vui lòng thử lại.");
  });
});
