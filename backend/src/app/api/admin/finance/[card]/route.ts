import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { FINANCE_UNAVAILABLE } from "@/lib/analytics-contract";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ status: "unavailable", message: FINANCE_UNAVAILABLE }, { status: 404 });
}
