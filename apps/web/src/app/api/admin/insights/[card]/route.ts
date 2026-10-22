import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import {
  getAnalyticsWindow,
  getInsightsA1,
  getInsightsA2,
  getInsightsA3,
  getInsightsA4,
  getInsightsA5,
  getInsightsA6,
  getInsightsA7,
  getInsightsA8,
  getInsightsA9,
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
    case "a1":
      return NextResponse.json(getInsightsA1(w));
    case "a2":
      return NextResponse.json(getInsightsA2(w));
    case "a3":
      return NextResponse.json(getInsightsA3(w));
    case "a4":
      return NextResponse.json(getInsightsA4(w));
    case "a5":
      return NextResponse.json(getInsightsA5((url.searchParams.get("sort") as "rate" | "n") || "rate"));
    case "a6":
      return NextResponse.json(getInsightsA6(w));
    case "a7":
      return NextResponse.json(getInsightsA7());
    case "a8":
      return NextResponse.json(getInsightsA8());
    case "a9":
      return NextResponse.json(getInsightsA9(w));
    default:
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
}
