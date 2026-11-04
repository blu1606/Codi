import { Resend } from "resend";

export type MailMessage = { to: string; subject: string; html: string };
export type Mailer = { send(message: MailMessage): Promise<void> };

export const DEFAULT_EMAIL_FROM = "Codi <noreply@hoangblue.dev>";

/** Resend-backed mailer; null when no API key is configured (local runs log instead of mailing). */
export function createMailer(env: { RESEND_API_KEY?: string; EMAIL_FROM?: string }): Mailer | null {
  const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const resend = new Resend(apiKey);
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
  return {
    async send({ to, subject, html }) {
      const result = await resend.emails.send({ from, to, subject, html });
      if (result.error) throw new Error(`Email delivery failed: ${result.error.message}`);
    },
  };
}
