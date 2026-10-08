/**
 * Email Service — transactional email via nodemailer SMTP.
 *
 * In development (or when SMTP is not configured) emails are logged to
 * the console so the OTP is still usable without a mail server.
 *
 * Configure via environment:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Works with any standard SMTP provider: Gmail, SendGrid, Mailgun, etc.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "../_core/env";
import logger from "../logger";

let _transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (_transport) return _transport;
  if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass) return null;

  _transport = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpSecure,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
  });
  return _transport;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const transport = getTransport();

  if (!transport) {
    // Dev fallback — log so verification OTP is still visible without a mail server
    logger.info(
      { to: opts.to, subject: opts.subject, body: opts.text ?? opts.html.replace(/<[^>]+>/g, " ") },
      "[EmailService][DEV] Email not sent (SMTP unconfigured)",
    );
    return;
  }

  try {
    await transport.sendMail({
      from: `"YOO Rideshare" <${ENV.smtpFrom}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
  } catch (err) {
    logger.error({ err }, "[EmailService] Failed to send email");
    throw err;
  }
}

// ── Template: Student Verification OTP ────────────────────────────────────────

export async function sendStudentVerificationEmail(
  to: string,
  otp: string,
  universityName: string,
): Promise<void> {
  const subject = "Your YOO student verification code";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>YOO Student Verification</title>
</head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4FF;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(59,94,245,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#3B5EF5 0%,#6B82F8 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:32px;font-weight:900;color:#FFFFFF;letter-spacing:-0.5px;">YOO</div>
            <div style="font-size:13px;color:#C7D2FE;margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">Student Verification</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1E293B;">Verify your university email</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6;">
              We received a request to verify your student status at <strong>${universityName}</strong>.
              Enter the code below in the app to complete verification.
            </p>

            <!-- OTP Block -->
            <div style="background:#F0F4FF;border:2px solid #C7D2FE;border-radius:12px;padding:28px 20px;text-align:center;margin-bottom:24px;">
              <div style="font-size:11px;font-weight:700;color:#6366F1;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Verification Code</div>
              <div style="font-size:48px;font-weight:900;color:#3B5EF5;letter-spacing:14px;font-variant-numeric:tabular-nums;">${otp}</div>
              <div style="font-size:12px;color:#94A3B8;margin-top:10px;">Expires in 5 minutes</div>
            </div>

            <!-- Security notices -->
            <div style="background:#FEF3C7;border-left:3px solid #F59E0B;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;">Security notice</p>
              <p style="margin:4px 0 0;font-size:12px;color:#B45309;line-height:1.5;">
                YOO will never ask for this code via phone or chat. If you did not request this, ignore this email — your account is safe.
              </p>
            </div>

            <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6;">
              This code is single-use and valid for 5 minutes. After entering the code,
              your account will display a <strong>Verified Student</strong> badge and
              you'll unlock student-exclusive ride benefits.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;padding:20px 40px;border-top:1px solid #E2E8F0;">
            <p style="margin:0;font-size:11px;color:#94A3B8;text-align:center;line-height:1.6;">
              YOO Rideshare · Student Trust &amp; Safety<br/>
              This is an automated message — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text =
    `YOO Student Verification\n\n` +
    `Your verification code for ${universityName}: ${otp}\n\n` +
    `This code expires in 5 minutes and is single-use.\n\n` +
    `If you did not request this, please ignore this email.\n\n` +
    `— YOO Rideshare`;

  await sendEmail({ to, subject, html, text });
}
