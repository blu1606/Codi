import { ENV } from "@/env.server";

/**
 * Business notifications to the team's Discord channel (DISCORD_WEBHOOK_URL). Unset means off, which is the
 * default outside production. Delivery is best effort: a slow or failing Discord never delays or fails the payment,
 * checkout or cancel request that triggered it, so callers fire and forget (`void notifyDiscord(...)`).
 */

export const DISCORD_COLOR = { sale: 0x16a34a, attention: 0xf59e0b, error: 0xdc2626 } as const;

export type DiscordField = { name: string; value: string; inline?: boolean };
export type DiscordEvent = {
  title: string;
  color: number;
  url?: string;
  description?: string;
  fields?: DiscordField[];
  /** A simulated SePay transfer (demo tools); tagged so nobody mistakes it for real money. */
  simulated?: boolean;
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function toDiscordPayload(event: DiscordEvent, now = new Date()) {
  const title = event.simulated ? `🧪 [Mô phỏng] ${event.title}` : event.title;
  return {
    // Nobody gets pinged by text that came from users (course titles, transfer memos).
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: clip(title, 256),
        url: event.url,
        color: event.color,
        description: event.description ? clip(event.description, 2000) : undefined,
        fields: (event.fields ?? []).slice(0, 10).map((f) => ({ name: clip(f.name, 256), value: clip(f.value || "—", 1024), inline: f.inline })),
        timestamp: now.toISOString(),
      },
    ],
  };
}

export async function notifyDiscord(
  event: DiscordEvent,
  webhookUrl: string | undefined = ENV.DISCORD_WEBHOOK_URL,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetcher(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toDiscordPayload(event)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[Discord] "${event.title}" rejected with HTTP ${res.status}`);
  } catch (error) {
    console.error(`[Discord] "${event.title}" not delivered:`, error instanceof Error ? error.message : error);
  }
}

export const formatVnd = (amount: number) => `${Math.round(amount).toLocaleString("vi-VN")} ₫`;

/** Keeps the first two characters and the domain: enough for the team to recognise a buyer, not to contact them. */
export function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export const adminOrderUrl = (orderId: number) => `${ENV.BETTER_AUTH_URL}/#/admin/orders?range=all&id=${orderId}`;
export const adminReconciliationUrl = () => `${ENV.BETTER_AUTH_URL}/#/admin/orders?reconciliation=1&range=all`;
