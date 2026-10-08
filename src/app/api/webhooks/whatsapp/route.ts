import { NextResponse } from "next/server";
import { ambassadorAnswer } from "@/lib/ambassador";
import {
  whatsappConnected,
  whatsappConfiguredForInbound,
  sendWhatsAppText,
  parseWebhookPayload,
  alreadySeen,
  detectLocaleFromText,
  resolveInboundOrg,
} from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";

// Meta webhook verification: GET with hub.mode=subscribe & hub.verify_token.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  // Honest refusal — no challenge is echoed to unverified callers.
  return NextResponse.json({ error: "WhatsApp webhook not verified. Set WHATSAPP_VERIFY_TOKEN and match it in Meta's dashboard." }, { status: 403 });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (!whatsappConfiguredForInbound()) {
    // 200 so Meta stops retrying; the body states plainly why nothing was handled.
    const reason = !whatsappConnected()
      ? "WhatsApp is not connected on this server (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)."
      : "Inbound not configured (WHATSAPP_VERIFY_TOKEN / WHATSAPP_ORG_ID missing).";
    return NextResponse.json({ ok: false, handled: 0, reason });
  }

  const orgId = resolveInboundOrg()!;
  const messages = parseWebhookPayload(payload).filter((m) => !alreadySeen(m.id));
  let handled = 0;

  for (const msg of messages) {
    const locale = detectLocaleFromText(msg.text);
    const { answer } = await ambassadorAnswer(orgId, msg.text, locale);
    const result = await sendWhatsAppText(msg.from, answer);
    handled += result.sent ? 1 : 0;
    await logAudit({
      organizationId: orgId,
      actorType: "AI",
      action: result.sent ? "WHATSAPP_REPLIED" : "WHATSAPP_DELIVERY_FAILED",
      targetType: "whatsapp_message",
      targetId: msg.from,
      detail: result.sent ? `Replied to ${msg.from}` : result.error,
      metadata: { inbound: msg.text.slice(0, 200), locale },
    });
  }

  return NextResponse.json({ ok: true, handled });
}
