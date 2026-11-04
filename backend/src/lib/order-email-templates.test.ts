import { describe, expect, it } from "vitest";
import {
  getInvoiceEmailHtml,
  getPurchaseConfirmationEmailHtml,
  invoiceSubject,
  purchaseConfirmationSubject,
  type OrderEmailData,
} from "./order-email-templates";

function order(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    appUrl: "https://codi.hoangblue.dev/",
    orderId: 42,
    orderCode: "CODI82577",
    buyerName: "Nguyễn Văn A",
    buyerEmail: "learner@example.com",
    items: [
      { courseId: "course-3", title: "Cấu trúc dữ liệu & Giải thuật", unitPrice: 10000 },
      { courseId: "course-git-001", title: "Git & GitHub", unitPrice: 10000 },
    ],
    subtotal: 20000,
    discountAmount: 5000,
    voucherCode: "GIAM5K",
    totalAmount: 15000,
    receivedAmount: 15000,
    paidAt: new Date("2026-11-03T16:05:00Z"),
    transactionCode: "SEPAY-123",
    ...overrides,
  };
}

describe("purchase confirmation email", () => {
  it("links every purchased course to its learning page", () => {
    const html = getPurchaseConfirmationEmailHtml(order());
    expect(html).toContain('href="https://codi.hoangblue.dev/learn/course-3"');
    expect(html).toContain('href="https://codi.hoangblue.dev/learn/course-git-001"');
    expect(html).toContain("CODI82577");
  });

  it("names the course in the subject for a single-course order and counts otherwise", () => {
    expect(purchaseConfirmationSubject(order({ items: [order().items[0]] }))).toContain("Cấu trúc dữ liệu & Giải thuật");
    expect(purchaseConfirmationSubject(order())).toContain("2 khoá học");
  });

  it("escapes user-controlled names and titles", () => {
    const html = getPurchaseConfirmationEmailHtml(order({
      buyerName: '<script>alert("x")</script>',
      items: [{ courseId: "c1", title: "<img src=x onerror=1>", unitPrice: 1 }],
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("invoice email", () => {
  it("lists items, discount, total, payment time in Vietnam time and the transaction code", () => {
    const html = getInvoiceEmailHtml(order());
    expect(invoiceSubject(order())).toBe("Hoá đơn thanh toán đơn CODI82577 - Codi");
    expect(html).toContain("Git &amp; GitHub");
    expect(html).toContain("Giảm giá (mã GIAM5K)");
    expect(html).toContain("-5.000 ₫");
    expect(html).toContain("15.000 ₫");
    expect(html).toContain("23:05");
    expect(html).toContain("SEPAY-123");
    expect(html).toContain("Chuyển khoản ngân hàng (SePay)");
    expect(html).toContain('href="https://codi.hoangblue.dev/checkout/success?order=42"');
    expect(html).not.toContain("chuyển thừa");
  });

  it("describes a free voucher order without a received amount or transaction code", () => {
    const html = getInvoiceEmailHtml(order({ discountAmount: 20000, totalAmount: 0, receivedAmount: 0, transactionCode: null }));
    expect(html).toContain("Miễn phí qua mã giảm giá");
    expect(html).not.toContain("Đã nhận");
    expect(html).not.toContain("Mã giao dịch");
  });

  it("tells the buyer about an overpayment", () => {
    const html = getInvoiceEmailHtml(order({ receivedAmount: 25000 }));
    expect(html).toContain("chuyển thừa 10.000 ₫");
  });
});
