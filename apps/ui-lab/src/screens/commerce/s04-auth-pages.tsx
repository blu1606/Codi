import { jsonBody } from "./lab-support";
import { http } from "msw";
import LoginPage from "@/app/login/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import type { Screen } from "../screen-types";
import { Scripted, fixtureHandlers, submitForm, typeInto } from "./lab-support";

const ok = () => jsonBody({ status: true });

export const authPagesScreen: Screen = {
  id: "S04",
  title: "Đăng nhập & đăng ký",
  group: "Khách & học viên",
  role: "guest",
  mockupHash: "#/login",
  states: {
    login: { label: "Đăng nhập", route: { pathname: "/login" }, handlers: fixtureHandlers, render: () => <LoginPage /> },
    register: { label: "Đăng ký", route: { pathname: "/login", search: { tab: "signup" } }, handlers: fixtureHandlers, render: () => <LoginPage /> },
    otp: {
      label: "Nhập OTP",
      route: { pathname: "/login", search: { tab: "signup" } },
      handlers: [http.post("/api/auth/sign-up/email", () => jsonBody({ user: { id: "usr-new", email: "moi@codi.vn" }, token: null })), ...fixtureHandlers],
      render: () => <Scripted script={() => { typeInto("#name", "Nguyễn Văn Mới"); typeInto("#email", "moi@codi.vn"); typeInto("#password", "matkhau123"); submitForm(); }}><LoginPage /></Scripted>,
    },
    forgot: { label: "Quên mật khẩu", route: { pathname: "/forgot-password" }, handlers: fixtureHandlers, render: () => <ForgotPasswordPage /> },
    "forgot-check-email": {
      label: "Kiểm tra email",
      route: { pathname: "/forgot-password" },
      handlers: [http.post("/api/auth/email-otp/send-verification-otp", ok), ...fixtureHandlers],
      render: () => <Scripted script={() => { typeInto("#email", "an.learner@codi.vn"); submitForm(); }}><ForgotPasswordPage /></Scripted>,
    },
    reset: { label: "Đặt lại mật khẩu", route: { pathname: "/reset-password", search: { token: "tok-demo" } }, handlers: fixtureHandlers, render: () => <ResetPasswordPage /> },
    "reset-invalid": { label: "Liên kết không hợp lệ", route: { pathname: "/reset-password" }, handlers: fixtureHandlers, render: () => <ResetPasswordPage /> },
    "reset-error": {
      label: "Token hết hạn",
      route: { pathname: "/reset-password", search: { token: "tok-het-han" } },
      handlers: [http.post("/api/auth/reset-password", () => jsonBody({ code: "INVALID_TOKEN", message: "Token đã hết hạn" }, { status: 400 })), ...fixtureHandlers],
      render: () => <Scripted script={() => { typeInto("#password", "matkhau123"); typeInto("#confirmPassword", "matkhau123"); submitForm(); }}><ResetPasswordPage /></Scripted>,
    },
  },
};
