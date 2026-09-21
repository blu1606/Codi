/**
 * Email Templates for Codi Authentication
 * Designed with modern responsive inline styling for high email client compatibility.
 * Optimized with OTP codes to avoid spam filters and improve delivery rate.
 */

interface OTPEmailProps {
  name?: string;
  otp: string;
}

export function getVerificationOTPEmailHtml({ name, otp }: OTPEmailProps): string {
  const greeting = name ? `Xin chào <strong>${name}</strong>,` : "Xin chào bạn,";

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác thực tài khoản Codi</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="500" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Codi</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">${greeting}</p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                Để kích hoạt tài khoản Codi của bạn, vui lòng nhập mã xác thực gồm 6 chữ số dưới đây:
              </p>
              
              <!-- OTP Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 16px 36px; text-align: center;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #1e40af;">
                  ⏱️ <strong>Lưu ý:</strong> Mã xác thực này chỉ có hiệu lực trong vòng <strong>2 phút</strong>.
                </p>
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                  Nếu bạn không yêu cầu mã này, vui lòng bỏ qua thư này. Không chia sẻ mã xác thực cho bất kỳ ai để bảo vệ tài khoản.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Codi Platform. Bảo lưu mọi quyền.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getResetPasswordOTPEmailHtml({ name, otp }: OTPEmailProps): string {
  const greeting = name ? `Xin chào <strong>${name}</strong>,` : "Xin chào bạn,";

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã đặt lại mật khẩu Codi</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="500" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Codi</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">${greeting}</p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng sử dụng mã OTP dưới đây để hoàn tất:
              </p>
              
              <!-- OTP Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #fef2f2; border: 2px dashed #fca5a5; border-radius: 10px; padding: 16px 36px; text-align: center;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #dc2626;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #c2410c;">
                  ⏱️ <strong>Lưu ý:</strong> Mã OTP đặt lại mật khẩu chỉ có hiệu lực trong vòng <strong>2 phút</strong>.
                </p>
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                  Nếu bạn không yêu cầu đặt lại mật khẩu, tài khoản của bạn vẫn được bảo vệ an toàn và bạn có thể bỏ qua email này.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Codi Platform. Bảo lưu mọi quyền.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
