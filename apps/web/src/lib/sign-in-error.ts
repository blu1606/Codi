export interface SignInErrorLike {
  error?: {
    message?: string;
    statusText?: string;
    code?: string;
    status?: number;
  };
}

export function mapSignInError(error: SignInErrorLike): string {
  const rawMessage = error.error?.message || error.error?.statusText || "";
  const errorCode = error.error?.code;

  // Only map specific credential error codes or standard Better Auth invalid credential messages
  const isInvalidCredential =
    errorCode === "INVALID_EMAIL_OR_PASSWORD" ||
    errorCode === "INVALID_PASSWORD" ||
    errorCode === "INVALID_EMAIL" ||
    rawMessage === "Invalid email or password" ||
    rawMessage === "Invalid password" ||
    rawMessage === "Invalid email";

  return isInvalidCredential
    ? "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại."
    : rawMessage || "Đăng nhập thất bại. Vui lòng thử lại.";
}
