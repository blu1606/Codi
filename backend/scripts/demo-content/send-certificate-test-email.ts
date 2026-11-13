// Sends the real "you earned a certificate" email of an existing certificate to any address, to check how it looks in
// a mail client. It does not change the certificate (email_sent_at stays as it is). Needs RESEND_API_KEY.
//   npx tsx --env-file=.env scripts/demo-content/send-certificate-test-email.ts <CODI-XXXX-XXXX> <to@example.com>
import { eq } from "drizzle-orm";
import { createMailer } from "@codi-1/auth";
import { courseCertificates } from "@codi-1/db/schema/certificates";
import { db } from "@/services";
import { ENV } from "@/env.server";
import { certificateEmailHtml } from "@/lib/certificate-service";
import { normalizeCertificateCode } from "@/lib/certificate-contract";

const [codeArg, to] = process.argv.slice(2);
const code = normalizeCertificateCode(codeArg);
if (!code || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("usage: <CODI-XXXX-XXXX> <to@example.com>");
const [cert] = await db.select().from(courseCertificates).where(eq(courseCertificates.code, code));
if (!cert) throw new Error(`certificate ${code} not found`);
const mailer = createMailer({ RESEND_API_KEY: ENV.RESEND_API_KEY, EMAIL_FROM: ENV.EMAIL_FROM });
if (!mailer) throw new Error("RESEND_API_KEY is not set here, so no email can be sent.");
await mailer.send({
  to,
  subject: `🎓 Chứng chỉ hoàn thành "${cert.courseTitle}"`,
  html: certificateEmailHtml({ appUrl: ENV.BETTER_AUTH_URL, recipientName: cert.recipientName, courseTitle: cert.courseTitle, code }),
});
console.log(`sent ${code} to ${to} (links point to ${ENV.BETTER_AUTH_URL})`);
process.exit(0);
