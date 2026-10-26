// Resend webhook receiver — bounce / warning forwarder.
// Configure in the Resend dashboard: endpoint = POST /api/webhooks/resend,
// events = email.bounced, email.delivery_delayed, email.complained. Every
// rejected / undelivered pilot-request or hot-signal alert email lands here
// and shows up on /monitor (Monitor → errors), so a bounced owner alert is
// visible in-app instead of silently lost.
//
// Auth: Resend signs webhooks with Svix (svix-id / svix-timestamp /
// svix-signature headers, whsec_ secret). RESEND_WEBHOOK_SECRET must be set —
// unsigned calls are refused, because this endpoint accepts attacker-chosen
// content and it must never be an open write path.
import { NextRequest, NextResponse } from "next/server";
import { recordError } from "@/lib/monitor";
import { timingSafeEqual, createHmac } from "crypto";

export const runtime = "nodejs";

const HANDLE_EVENTS = new Set(["email.bounced", "email.complained", "email.delivery_delayed"]);

function verifySvix(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Replay guard: 5-minute window, exactly as Svix recommends.
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // whsec_<base64> — the prefix is decoration; the key is the base64 payload.
  const key = secret.replace(/^whsec_/, "");
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(key, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", keyBytes).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const provided = signatureHeader
    .split(/\s+/)
    .map((v) => (v.startsWith("v1,") ? v.slice(3) : null))
    .filter((v): v is string => v !== null);
  if (!provided.length) return false;
  return provided.some(
    (p) => p.length === expected.length && timingSafeEqual(Buffer.from(p), Buffer.from(expected)),
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Resend webhook not configured — set RESEND_WEBHOOK_SECRET" },
      { status: 503 },
    );
  }

  const raw = await req.text();
  if (!verifySvix(raw, req.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { type?: string; data?: Record<string, unknown> } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const type = body?.type ?? "";
  const data = body?.data ?? {};
  if (HANDLE_EVENTS.has(type)) {
    const to = Array.isArray(data.to) ? data.to.join(", ") : String(data.to ?? "unknown");
    const subject = typeof data.subject === "string" ? data.subject : "(no subject)";
    const bounceReason =
      data.bounce && typeof data.bounce === "object"
        ? String((data.bounce as Record<string, unknown>).type ?? "")
        : "";
    // Deduped by the monitor's fingerprint; recurring bounces aggregate.
    await recordError({
      message: `Resend ${type}${bounceReason ? ` (${bounceReason})` : ""}: "${subject}" → ${to}`,
      digest: typeof data.email_id === "string" ? data.email_id : null,
      path: "/api/webhooks/resend",
      method: "POST",
      routePath: "/api/webhooks/resend",
      routeType: "route",
      source: "SERVER",
    });
  }
  // Known-but-boring events (email.sent, email.delivered, …) and anything
  // newer Resend adds: accept politely, store nothing.
  return NextResponse.json({ ok: true });
}
