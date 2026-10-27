import { jsonBody } from "./lab-support";
import { delay, http } from "msw";
import AuthModal from "@/components/auth/auth-modal";
import type { Screen } from "../screen-types";
import { Scripted, submitForm, typeInto, fixtureHandlers } from "./lab-support";

const signIn = (handler: Parameters<typeof http.post>[1]) => http.post("/api/auth/sign-in/email", handler);
const fillAndSubmit = () => {
  typeInto("#email", "an.learner@codi.vn");
  typeInto("#password", "matkhau123");
  submitForm();
};

const modal = () => <AuthModal open onOpenChange={() => {}} onSuccess={() => {}} courseTitle="React từ cơ bản đến nâng cao" intentReason="Đăng nhập để thêm vào giỏ hàng" />;

export const signInModalScreen: Screen = {
  id: "S03",
  title: "Đăng nhập (hộp thoại)",
  group: "Khách & học viên",
  role: "guest",
  mockupHash: "#/login",
  states: {
    default: { label: "Mặc định", route: { pathname: "/courses/react-co-ban-nang-cao" }, handlers: fixtureHandlers, render: modal },
    error: {
      label: "Sai thông tin",
      route: { pathname: "/courses/react-co-ban-nang-cao" },
      handlers: [
        signIn(() => jsonBody({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, { status: 401 })),
        ...fixtureHandlers,
      ],
      render: () => <Scripted script={fillAndSubmit}>{modal()}</Scripted>,
    },
    loading: {
      label: "Đang đăng nhập",
      route: { pathname: "/courses/react-co-ban-nang-cao" },
      handlers: [signIn(async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: () => <Scripted script={fillAndSubmit}>{modal()}</Scripted>,
    },
  },
};
