import "server-only";

import { Resend } from "resend";

// Transactional email via Resend.
//
// Why Resend: simple API, 3k free/month, modern (Vercel-aligned), 1-line
// integration. Don't need full ESP features (that's Klaviyo's job for the
// merchant's customers).
//
// Configure RESEND_API_KEY + FROM_EMAIL in env. If unset, sendEmail() is
// a no-op that logs — lets local dev work without an email account.

let _client: Resend | null = null;

function getResend(): Resend | null {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] (no-op, RESEND_API_KEY unset) -> ${input.to}: ${input.subject}`);
    return { ok: false, reason: "RESEND_API_KEY not set" };
  }
  const from = process.env.FROM_EMAIL?.trim() ?? "The Operator <hello@blackvault.studio>";
  try {
    const r = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, ""),
      replyTo: input.replyTo
    });
    if (r.error) {
      console.warn(`[email] resend error: ${r.error.message}`);
      return { ok: false, reason: r.error.message };
    }
    return { ok: true, id: r.data?.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ── Templates ─────────────────────────────────────────────────────────────

export function welcomeEmailHtml(input: {
  brandName: string;
  brandSlug: string;
  tenantId: string;
  bearerToken: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `Welcome to Project Elsa — ${input.brandName} is being built`;
  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F0E0C;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:12px;letter-spacing:0.2em;color:#A67843;margin:0 0 16px;">PROJECT ELSA</p>
    <h1 style="font-size:28px;font-weight:700;margin:0 0 16px;">Welcome aboard.</h1>
    <p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 24px;">
      Hey there — your brand <strong>${input.brandName}</strong> is officially in the queue.
      Your subscription is active and your hosted operator is provisioning now.
    </p>

    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin:24px 0;">
      <p style="font-size:11px;letter-spacing:0.1em;color:#666;margin:0 0 8px;">TENANT ID</p>
      <p style="font-family:'SF Mono',Menlo,monospace;font-size:14px;margin:0 0 16px;">${input.tenantId}</p>

      <p style="font-size:11px;letter-spacing:0.1em;color:#666;margin:16px 0 8px;">BRAND HANDLE</p>
      <p style="font-family:'SF Mono',Menlo,monospace;font-size:14px;margin:0 0 16px;">${input.brandSlug}</p>

      <p style="font-size:11px;letter-spacing:0.1em;color:#A67843;margin:16px 0 8px;">YOUR BEARER TOKEN — SAVE IT NOW</p>
      <p style="font-family:'SF Mono',Menlo,monospace;font-size:12px;word-break:break-all;background:#f4f1ec;padding:12px;border-radius:6px;margin:0;">${input.bearerToken}</p>
      <p style="font-size:13px;color:#666;margin:12px 0 0;">
        This token authenticates you to your operator agent. Store it in your password manager.
        We don't keep a copy you can retrieve — if you lose it, you'll need to rotate.
      </p>
    </div>

    <h2 style="font-size:18px;font-weight:700;margin:32px 0 16px;">Next steps</h2>
    <ol style="font-size:15px;line-height:1.7;color:#333;padding-left:20px;margin:0 0 24px;">
      <li>Reply to this email with your Shopify trial URL + Printful account email</li>
      <li>If you have a logo/wordmark, attach it (PNG/SVG with transparency)</li>
      <li>Your store will be live within 48 hours of receiving those</li>
    </ol>

    <a href="${input.dashboardUrl}" style="display:inline-block;background:#0F0E0C;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Open your dashboard →</a>

    <hr style="border:none;border-top:1px solid #e5e5e5;margin:40px 0 24px;">
    <p style="font-size:13px;color:#888;margin:0;">
      The Operator — a Black Vault product. Built by an indie founder who lost time he can't get back.<br>
      Made so others don't have to. Project ELSA · In memory of Elsa, 09/26/25.
    </p>
    <p style="font-size:12px;color:#aaa;margin:8px 0 0;">
      Support: <a href="mailto:support@blackvault.studio" style="color:#888;">support@blackvault.studio</a> · Reply to this email any time.
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export function bearerRotatedEmailHtml(input: { brandName: string; newToken: string }): { subject: string; html: string } {
  const subject = `Your ${input.brandName} bearer token was rotated`;
  const html = `
<html><body style="font-family:-apple-system,sans-serif;color:#0F0E0C;background:#fafafa;padding:40px;">
  <div style="max-width:560px;margin:0 auto;">
    <h1>Your bearer token was rotated</h1>
    <p>If you didn't initiate this, contact support immediately.</p>
    <p>Your new token (save it):</p>
    <pre style="background:#f4f1ec;padding:12px;border-radius:6px;font-size:12px;">${input.newToken}</pre>
  </div>
</body></html>`;
  return { subject, html };
}
