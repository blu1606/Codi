import "server-only";
import { and, count, gte, lt } from "drizzle-orm";
import { courses, orders, user, type Database } from "@codi-1/db";
import { analyticsWindow, type AdminMetric, type CountData } from "./analytics-contract";

// These are creation counts across all statuses, not active-user or paid-order metrics.
export async function getAdminCount(
  db: Database, metric: AdminMetric, period: string, now = new Date(),
): Promise<CountData> {
  const window = analyticsWindow(period, now);
  const table = { users: user, courses, orders }[metric];
  const [row] = await db.select({ value: count() }).from(table).where(and(
    gte(table.createdAt, new Date(window.start)),
    lt(table.createdAt, new Date(window.end)),
  ));
  return { value: Number(row?.value ?? 0), window };
}
