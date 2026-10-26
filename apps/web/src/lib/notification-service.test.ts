import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { createNotificationService, notificationLink, NotificationNotFoundError } from "./notification-service";

function fixture(rows: unknown[] = [{ id: 1 }]) {
  const builder = {
    from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(rows),
    values: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve([{ value: 3 }])),
  };
  const database = { select: vi.fn(() => builder), insert: vi.fn(() => builder), update: vi.fn(() => builder) };
  return { builder, database, service: createNotificationService(database as unknown as Database) };
}

describe("notification service", () => {
  it("creates unread in-app notifications with normalized text", async () => {
    const { service, builder } = fixture();
    await service.notify("u1", " Lộ trình đã được cập nhật ", " Bài tiếp theo ", "/learn/c1");
    expect(builder.values).toHaveBeenCalledWith({ userId: "u1", title: "Lộ trình đã được cập nhật", body: "Bài tiếp theo", link: "/learn/c1" });
  });
  it.each(["https://attacker.test", "//attacker.test", "/\\attacker.test", "/\nattacker.test", "javascript:alert(1)"])("rejects an unsafe notification destination %j", (link) => {
    expect(() => notificationLink(link)).toThrow();
  });
  it("supports notices without a destination", () => expect(notificationLink(null)).toBeNull());
  it("rejects blank notification text before writing", async () => {
    const { service, database } = fixture();
    await expect(service.notify("u1", "  ")).rejects.toThrow();
    expect(database.insert).not.toHaveBeenCalled();
  });
  it("scopes both inbox rows and the unread badge count to their owner", async () => {
    const { service, builder } = fixture();
    const result = await service.list("u1");
    expect(result.unreadCount).toBe(3);
    const conditions = builder.where.mock.calls.map(([condition]) => new PgDialect().sqlToQuery(condition as SQL));
    expect(conditions).toHaveLength(2);
    expect(conditions.every((query) => query.params.includes("u1"))).toBe(true);
    expect(conditions[1]!.sql).toContain('"read_at" is null');
  });
  it("protects single-read writes with both owner and notification id and preserves the first read timestamp", async () => {
    const { service, builder } = fixture();
    await service.markRead("u1", 9);
    const query = new PgDialect().sqlToQuery(builder.where.mock.calls[0]![0] as SQL);
    expect(query.params).toEqual(["u1", 9]);
    const expression = builder.set.mock.calls[0]![0].readAt;
    expect(new PgDialect().sqlToQuery(expression).sql).toContain("coalesce");
  });
  it("does not reveal whether a foreign notification exists", async () => {
    const { service } = fixture([]);
    await expect(service.markRead("u1", 9)).rejects.toBeInstanceOf(NotificationNotFoundError);
  });
  it("marks only the owner's unread notifications", async () => {
    const { service, builder } = fixture();
    await service.markAllRead("u1");
    const query = new PgDialect().sqlToQuery(builder.where.mock.calls[0]![0] as SQL);
    expect(query.params).toEqual(["u1"]);
    expect(query.sql).toContain('"read_at" is null');
  });
});
