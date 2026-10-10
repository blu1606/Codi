export function getSepayConfig() {
  const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET?.trim();
  const bankCode = process.env.SEPAY_BANK_CODE?.trim();
  const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER?.trim();
  if (!webhookSecret || !bankCode || !accountNumber || !/^[A-Za-z0-9]+$/.test(bankCode) || !/^[0-9]+$/.test(accountNumber)) return null;
  return { webhookSecret, receiver: { bankCode, accountNumber } };
}
