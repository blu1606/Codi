import { NextResponse } from "next/server";
import { verifyZaloPayCallback } from "@/lib/zalopay";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dataStr = body.data;
    const reqMac = body.mac;

    const isValid = verifyZaloPayCallback(dataStr, reqMac);

    if (!isValid) {
      return NextResponse.json({ return_code: -1, return_message: "mac not equal" });
    }

    // Process payment success...
    // const dataJson = JSON.parse(dataStr);
    // console.log("Payment success for order:", dataJson.app_trans_id);

    return NextResponse.json({ return_code: 1, return_message: "success" });
  } catch (error: any) {
    return NextResponse.json({ return_code: 0, return_message: error.message });
  }
}
