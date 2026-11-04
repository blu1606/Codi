/**
 * Purchase confirmation and invoice emails sent once an order becomes paid.
 * Inline styles and table layout, matching the auth OTP emails, for mail-client compatibility.
 */

export const SELLER_NAME = "CONG TY CODI EDU";

export interface OrderEmailItem {
  courseId: string;
  title: string;
  unitPrice: number;
}

export interface OrderEmailData {
  appUrl: string;
  orderId: number;
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  items: OrderEmailItem[];
  subtotal: number;
  discountAmount: number;
  voucherCode: string | null;
  totalAmount: number;
  receivedAmount: number;
  paidAt: Date;
  /** Provider transaction id of the settling transfer; null for a free (voucher) order. */
  transactionCode: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function appLink(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

function layout(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Codi</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
${body}
            </td>
          </tr>
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

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 8px;">${escapeHtml(label)}</a>`;
}

export function purchaseConfirmationSubject(data: OrderEmailData): string {
  return data.items.length === 1
    ? `Bạn đã sở hữu khoá học "${data.items[0].title}"`
    : `Bạn đã sở hữu ${data.items.length} khoá học mới trên Codi`;
}

export function getPurchaseConfirmationEmailHtml(data: OrderEmailData): string {
  const courseRows = data.items.map((item) => `
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                  <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #0f172a;">${escapeHtml(item.title)}</p>
                  ${button(appLink(data.appUrl, `/learn/${encodeURIComponent(item.courseId)}`), "Vào học ngay")}
                </td>
              </tr>`).join("");

  return layout(purchaseConfirmationSubject(data), `
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">Xin chào <strong>${escapeHtml(data.buyerName)}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thanh toán cho đơn <strong>${escapeHtml(data.orderCode)}</strong> đã được xác nhận. Các khoá học dưới đây đã được thêm vào tài khoản của bạn và bạn có thể bắt đầu học ngay:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${courseRows}
              </table>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Bạn cũng có thể xem toàn bộ khoá học của mình tại <a href="${escapeHtml(appLink(data.appUrl, "/dashboard"))}" style="color: #2563eb;">trang tổng quan</a>. Hoá đơn của đơn hàng được gửi trong một email riêng.
              </p>
              <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                  Nếu bạn không thực hiện giao dịch này, vui lòng trả lời email này để được hỗ trợ.
                </p>
              </div>`);
}

export function invoiceSubject(data: OrderEmailData): string {
  return `Hoá đơn thanh toán đơn ${data.orderCode} - Codi`;
}

export function getInvoiceEmailHtml(data: OrderEmailData): string {
  const cell = "padding: 10px 0; font-size: 14px; border-bottom: 1px solid #f1f5f9;";
  const itemRows = data.items.map((item, index) => `
                <tr>
                  <td style="${cell} color: #64748b; width: 28px; vertical-align: top;">${index + 1}</td>
                  <td style="${cell} color: #0f172a;">${escapeHtml(item.title)}</td>
                  <td style="${cell} color: #0f172a; text-align: right; white-space: nowrap; vertical-align: top;">${formatVnd(item.unitPrice)}</td>
                </tr>`).join("");

  const summaryRow = (label: string, value: string, strong = false) => `
                <tr>
                  <td style="padding: 6px 0; font-size: ${strong ? 15 : 14}px; color: ${strong ? "#0f172a" : "#475569"};${strong ? " font-weight: 700;" : ""}">${label}</td>
                  <td style="padding: 6px 0; font-size: ${strong ? 15 : 14}px; color: #0f172a; text-align: right; white-space: nowrap;${strong ? " font-weight: 700;" : ""}">${value}</td>
                </tr>`;

  const discountLabel = data.voucherCode ? `Giảm giá (mã ${escapeHtml(data.voucherCode)})` : "Giảm giá";
  const paymentMethod = data.totalAmount === 0 ? "Miễn phí qua mã giảm giá" : "Chuyển khoản ngân hàng (SePay)";

  const infoRow = (label: string, value: string) => `
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b; width: 42%;">${label}</td>
                  <td style="padding: 4px 0; font-size: 13px; color: #0f172a;">${value}</td>
                </tr>`;

  return layout(invoiceSubject(data), `
              <p style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #0f172a;">Hoá đơn thanh toán</p>
              <p style="margin: 0 0 20px; font-size: 13px; color: #64748b;">Số hoá đơn: <strong style="color: #0f172a;">${escapeHtml(data.orderCode)}</strong></p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                ${infoRow("Đơn vị bán", SELLER_NAME)}
                ${infoRow("Khách hàng", escapeHtml(data.buyerName))}
                ${infoRow("Email", escapeHtml(data.buyerEmail))}
                ${infoRow("Thời gian thanh toán", formatDateTime(data.paidAt))}
                ${infoRow("Phương thức", paymentMethod)}
                ${data.transactionCode ? infoRow("Mã giao dịch", escapeHtml(data.transactionCode)) : ""}
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0;">#</td>
                  <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0;">Khoá học</td>
                  <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: right; border-bottom: 2px solid #e2e8f0;">Đơn giá</td>
                </tr>${itemRows}
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 12px;">
                ${summaryRow("Tạm tính", formatVnd(data.subtotal))}
                ${data.discountAmount > 0 ? summaryRow(discountLabel, `-${formatVnd(data.discountAmount)}`) : ""}
                ${summaryRow("Tổng thanh toán", formatVnd(data.totalAmount), true)}
                ${data.totalAmount > 0 ? summaryRow("Đã nhận", formatVnd(data.receivedAmount)) : ""}
              </table>

              ${data.receivedAmount > data.totalAmount && data.totalAmount > 0 ? `
              <div style="background-color: #fff7ed; border: 1px solid #fed7aa; padding: 12px 16px; border-radius: 8px; margin: 20px 0 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #c2410c;">
                  Bạn đã chuyển thừa ${formatVnd(data.receivedAmount - data.totalAmount)}. Bộ phận hỗ trợ sẽ liên hệ để hoàn lại phần chênh lệch.
                </p>
              </div>` : ""}

              <div style="margin-top: 24px; text-align: center;">
                ${button(appLink(data.appUrl, `/checkout/success?order=${data.orderId}`), "Xem đơn hàng")}
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                  Đây là biên nhận thanh toán điện tử của Codi, không thay thế hoá đơn giá trị gia tăng (VAT). Vui lòng giữ email này để đối chiếu khi cần hỗ trợ.
                </p>
              </div>`);
}
