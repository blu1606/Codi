export function passwordRecoveryError(error: { code?: string; status?: number }, fallback: string) {
  const messages: Record<string, string> = {
    INVALID_OTP: "Mã xác thực không đúng. Vui lòng kiểm tra lại.",
    OTP_EXPIRED: "Mã xác thực đã hết hạn. Vui lòng gửi lại mã.",
    TOO_MANY_ATTEMPTS: "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.",
    INVALID_RESET_GRANT: "Phiên khôi phục đã hết hạn. Vui lòng xác thực email lại từ Cài đặt.",
    INVALID_TOKEN: "Phiên khôi phục đã hết hạn. Vui lòng xác thực email lại từ Cài đặt.",
  };
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 429) return "Bạn thao tác quá nhanh. Vui lòng chờ một phút rồi thử lại.";
  return fallback;
}
