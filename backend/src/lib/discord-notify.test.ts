import { describe, expect, it, vi } from "vitest";
import { maskEmail, notifyDiscord, toDiscordPayload } from "./discord-notify";
import { orderPaidDiscordEvent } from "./order-emails";
import type { OrderEmailData } from "./order-email-templates";

const WEBHOOK = "https://discord.example/webhook";
const ok = () => vi.fn(async () => new Response(null, { status: 204 }));

function paidOrder(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    appUrl: "https://codi.example",
    orderId: 42,
    orderCode: "CODI12345",
    buyerName: "Nguyễn Văn A",
    buyerEmail: "nguyenvana@gmail.com",
    items: [{ courseId: "c1", title: "React cơ bản", unitPrice: 499000 }],
    subtotal: 499000,
    discountAmount: 0,
    voucherCode: null,
    totalAmount: 499000,
    receivedAmount: 499000,
    paidAt: new Date("2026-11-04T03:00:00Z"),
    transactionCode: "FT123",
    ...overrides,
  };
}

describe("notifyDiscord", () => {
  it("does nothing when no webhook is configured", async () => {
    const fetcher = ok();
    await notifyDiscord({ title: "x", color: 1 }, undefined, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts one embed and never pings anyone", async () => {
    const fetcher = ok();
    await notifyDiscord({ title: "Đơn mới", color: 1, fields: [{ name: "a", value: "@everyone" }] }, WEBHOOK, fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe(WEBHOOK);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe("Đơn mới");
  });

  it("swallows network errors and HTTP failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyDiscord({ title: "x", color: 1 }, WEBHOOK, vi.fn(async () => { throw new Error("offline"); }))).resolves.toBeUndefined();
    await expect(notifyDiscord({ title: "x", color: 1 }, WEBHOOK, vi.fn(async () => new Response(null, { status: 429 })))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("toDiscordPayload", () => {
  it("tags simulated transfers and clips oversized text", () => {
    const payload = toDiscordPayload({ title: "Đơn", color: 1, simulated: true, fields: [{ name: "n", value: "x".repeat(2000) }] });
    expect(payload.embeds[0].title).toBe("🧪 [Mô phỏng] Đơn");
    expect(payload.embeds[0].fields[0].value).toHaveLength(1024);
  });
});

describe("maskEmail", () => {
  it("keeps two characters and the domain", () => {
    expect(maskEmail("nguyenvana@gmail.com")).toBe("ng***@gmail.com");
    expect(maskEmail("a@b.vn")).toBe("a***@b.vn");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("orderPaidDiscordEvent", () => {
  it("summarises a paid order without the buyer's full email", () => {
    const event = orderPaidDiscordEvent(paidOrder());
    const text = JSON.stringify(event);
    expect(event.title).toContain("CODI12345");
    expect(event.url).toContain("/#/admin/orders?range=all&id=42");
    expect(text).toContain("React cơ bản");
    expect(text).not.toContain("nguyenvana@gmail.com");
    expect(text).not.toContain("Chuyển thừa");
  });

  it("flags an overpayment that must be refunded", () => {
    const event = orderPaidDiscordEvent(paidOrder({ receivedAmount: 549000 }));
    expect(JSON.stringify(event.fields)).toContain("Chuyển thừa");
  });

  it("labels free orders", () => {
    const event = orderPaidDiscordEvent(paidOrder({ totalAmount: 0, receivedAmount: 0, transactionCode: null }));
    expect(JSON.stringify(event.fields)).toContain("Miễn phí");
  });
});
