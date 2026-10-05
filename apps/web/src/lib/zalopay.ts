import crypto from "crypto";

const config = {
  app_id: process.env.ZALOPAY_APP_ID || "2553",
  key1: process.env.ZALOPAY_KEY1 || "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",
  key2: process.env.ZALOPAY_KEY2 || "kLtgPl8YESD10B967ZQpefQ6Gv1rcK50",
  endpoint: process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn/v2/create",
};

export async function createZaloPayOrder({
  app_trans_id,
  app_user,
  amount,
  item,
  description,
  embed_data,
}: {
  app_trans_id: string;
  app_user: string;
  amount: number;
  item: string;
  description: string;
  embed_data: string;
}) {
  const order = {
    app_id: config.app_id,
    app_trans_id,
    app_user,
    app_time: Date.now(),
    item,
    embed_data,
    amount,
    description,
    bank_code: "zalopayapp",
    mac: "",
  };

  const data = `${config.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
  order.mac = crypto.createHmac("sha256", config.key1).update(data).digest("hex");

  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(order as any).toString(),
    });

    const result = await res.json();
    return result;
  } catch (error) {
    console.error("ZaloPay Create Order Error:", error);
    throw error;
  }
}

export function verifyZaloPayCallback(dataStr: string, reqMac: string) {
  const mac = crypto.createHmac("sha256", config.key2).update(dataStr).digest("hex");
  return mac === reqMac;
}
