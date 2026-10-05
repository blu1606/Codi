import { NextResponse } from "next/server";
import { createZaloPayOrder } from "@/lib/zalopay";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Generate a unique app_trans_id: YYMMDD_xxxxxx
    const transID = Math.floor(Math.random() * 1000000);
    const date = new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const app_trans_id = `${yy}${mm}${dd}_${transID}`;

    const orderResult = await createZaloPayOrder({
      app_trans_id,
      app_user: body.app_user || "CodiUser",
      amount: body.amount || 10000,
      item: JSON.stringify(body.item || []),
      description: body.description || `Codi - Thanh toan don hang #${transID}`,
      embed_data: JSON.stringify(body.embed_data || {}),
    });

    return NextResponse.json(orderResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
