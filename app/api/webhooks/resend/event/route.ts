import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

// Resend transactional event webhook. Resend posts events when emails are:
//   - delivered, opened, clicked, bounced, complained, failed
//
// Critical case: if our welcome email (with the bearer token) bounces or
// fails, the customer paid us and got nothing. We alert the founder + log
// for manual recovery (rotate token, resend to alt email).
//
// Setup in Resend:
//   Dashboard → Webhooks → Add endpoint:
//     URL: https://blackvault.studio/api/webhooks/resend/event
//   Events: email.bounced, email.complained, email.delivery_delayed,
//           email.delivered, email.failed
//   Copy the signing secret → RESEND_WEBHOOK_SECRET in env.
//
// Resend uses Svix-style signing — header is `svix-signature` with format
// "v1,<base64-hmac>". We verify timing-safely.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENTS_PATH = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "resend-events.jsonl");
})();

function ensureDir() {
  const dir = path.dirname(EVENTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return !process.env.VERCEL;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Svix secret format: "whsec_<base64>" — strip prefix
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(key, "base64");
  } catch {
    return false;
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBytes).update(signedPayload).digest("base64");

  // Header can contain multiple signatures: "v1,<sig> v1,<sig>"
  const parts = svixSignature.split(" ");
  for (const p of parts) {
    const [version, sig] = p.split(",");
    if (version !== "v1" || !sig) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64"))) {
        return true;
      }
    } catch {}
  }
  return false;
}

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce_type?: string;
    bounce_subtype?: string;
  };
};

export async function POST(req: Request) {
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";
  const body = await req.text();

  if (!verifySvixSignature(body, svixId, svixTimestamp, svixSignature)) {
    audit({
      action: "auth.failed",
      actor: "resend-webhook",
      target: "/api/webhooks/resend/event",
      ok: false,
      detail: { reason: "invalid_signature" }
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  ensureDir();
  fs.appendFileSync(
    EVENTS_PATH,
    JSON.stringify({ receivedAt: new Date().toISOString(), ...event }) + "\n"
  );

  // Critical-failure alert: bounced or failed welcome emails mean a tenant
  // didn't get their bearer token. Founder needs to know.
  const isFailure =
    event.type === "email.bounced" || event.type === "email.failed" || event.type === "email.complained";
  const isWelcomeEmail = event.data?.subject?.toLowerCase().includes("welcome") ?? false;

  if (isFailure && isWelcomeEmail) {
    const alertEmail = process.env.FOUNDER_ALERT_EMAIL?.trim();
    if (alertEmail) {
      const subject = `🚨 Welcome email ${event.type} — manual recovery needed`;
      const html = `
<div style="font-family:-apple-system,sans-serif;color:#0F0E0C">
  <h2 style="color:#8B0000">Welcome email failed to deliver</h2>
  <p>A paying tenant didn't receive their bearer token.</p>
  <p>
    Event: <strong>${event.type}</strong><br/>
    To: ${event.data?.to?.join(", ") ?? "unknown"}<br/>
    Subject: ${event.data?.subject ?? "unknown"}<br/>
    ${event.data?.bounce_type ? `Bounce: ${event.data.bounce_type} / ${event.data.bounce_subtype ?? ""}<br/>` : ""}
    Email ID: ${event.data?.email_id ?? "—"}
  </p>
  <p>
    Recovery steps:<br/>
    1. Find the tenant in /admin/incidents<br/>
    2. Verify their actual deliverable email address<br/>
    3. Rotate their bearer token via lib/tenancy.rotateBearer<br/>
    4. Send the new token via direct support email
  </p>
</div>`;
      sendEmail({ to: alertEmail, subject, html }).catch(() => {});
    }
    audit({
      action: "admin.action",
      actor: "resend-webhook",
      target: event.data?.to?.[0] ?? "unknown",
      ok: false,
      detail: { type: event.type, subject: event.data?.subject }
    });
  }

  return NextResponse.json({ ok: true });
}
