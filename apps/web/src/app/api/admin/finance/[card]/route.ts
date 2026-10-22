import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import {
  getAnalyticsWindow,
  getFinanceB1,
  getFinanceB2,
  getFinanceB3,
  getFinanceB4,
  getFinanceB5,
  getFinanceB6,
  getFinanceB7,
  getFinanceB8,
} from "@/lib/admin-analytics-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { card } = await params;
  const url = request.nextUrl;
  const period = url.searchParams.get("period") || "30";
  const compare = url.searchParams.get("compare") !== "false";
  const w = getAnalyticsWindow(period, compare);

  switch (card.toLowerCase()) {
    case "b1":
      return NextResponse.json(getFinanceB1(w));
    case "b2":
      return NextResponse.json(getFinanceB2(w));
    case "b3":
      return NextResponse.json(
        getFinanceB3(
          w,
          (url.searchParams.get("groupBy") as "course" | "category" | "lecturer") || "course"
        )
      );
    case "b4":
      return NextResponse.json(getFinanceB4(w));
    case "b5":
      return NextResponse.json(getFinanceB5(w));
    case "b6":
      return NextResponse.json(getFinanceB6(w));
    case "b7":
      return NextResponse.json(getFinanceB7(w));
    case "b8":
      return NextResponse.json(getFinanceB8());
    default:
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
}
