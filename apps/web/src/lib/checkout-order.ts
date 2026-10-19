export interface CheckoutOrder {
  transactionId: string;
  amount: number;
  receiver: { bankCode: string; accountNumber: string };
  course: { id: string; title: string; category: string };
}

export async function createCheckoutOrder(courseSlug: string, orderCode?: string): Promise<CheckoutOrder> {
  const response = await fetch("/api/payments/create-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseSlug, orderCode }),
    signal: AbortSignal.timeout(15000),
  });
  const rawText = await response.text();
  let data: any = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(response.statusText || "Máy chủ phản hồi không hợp lệ. Vui lòng thử lại.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Không thể tạo thanh toán. Vui lòng thử lại.");
  }
  if (!data.transactionId || !Number.isSafeInteger(data.amount) || data.amount <= 0 || !data.receiver?.bankCode || !data.receiver?.accountNumber || !data.course?.title) {
    throw new Error("Thông tin thanh toán không hợp lệ. Vui lòng thử lại.");
  }
  return data;
}
