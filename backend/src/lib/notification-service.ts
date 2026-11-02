import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { notifications } from "@codi-1/db/schema/interaction";

export class NotificationNotFoundError extends Error {}

/** Only allow app-relative links. Notification text is rendered as React text. */
export function notificationLink(link: string | null | undefined): string | null {
  if (!link) return null;
  if (!link.startsWith("/") || link.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(link)) {
    throw new Error("Thông báo phải liên kết đến một trang trong ứng dụng.");
  }
  return link;
}

// A transaction can be passed here so an emitting module can notify atomically.
export function createNotificationService(database: Pick<Database, "select" | "insert" | "update">) {
  return {
    async notify(userId: string, title: string, body?: string | null, link?: string | null) {
      if (!userId || !title.trim() || title.trim().length > 200 || (body?.length ?? 0) > 4000) {
        throw new Error("Nội dung thông báo không hợp lệ.");
      }
      const [notification] = await database.insert(notifications).values({
        userId, title: title.trim(), body: body?.trim() || null, link: notificationLink(link),
      }).returning();
      return notification!;
    },
    async list(userId: string) {
      const items = await database.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50);
      const [unread] = await database.select({ value: count() }).from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      return { items, unreadCount: unread?.value ?? 0 };
    },
    async markRead(userId: string, id: number) {
      const [item] = await database.update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(and(eq(notifications.userId, userId), eq(notifications.id, id))).returning();
      if (!item) throw new NotificationNotFoundError("Không tìm thấy thông báo.");
      return item;
    },
    async markAllRead(userId: string) {
      await database.update(notifications).set({ readAt: new Date() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    },
  };
}
