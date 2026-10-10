import { NextResponse } from "next/server";
import { db } from "@/services";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
import { eq } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [tx] = await db.select().from(studentTransactions).where(eq(studentTransactions.id, id)).limit(1);

    if (!tx) {
      return NextResponse.json({ status: "not_found" });
    }

    return NextResponse.json({ status: tx.status });
  } catch (error) {
    console.error("Check transaction error:", error);
    return NextResponse.json({ error: "Failed to check" }, { status: 500 });
  }
}
