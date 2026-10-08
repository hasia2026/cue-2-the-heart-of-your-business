// WhatsApp Cloud API (Meta) — the only free, first-party WhatsApp channel.
// Everything is env-gated: with no credentials the app degrades honestly
// (integration shows AVAILABLE, webhook refuses, nothing pretends to be live).
//
// Required env vars:
//   WHATSAPP_TOKEN            — system-user access token from Meta App Dashboard
//   WHATSAPP_PHONE_NUMBER_ID  — the sender phone number id
//   WHATSAPP_VERIFY_TOKEN     — any random string you also enter in Meta's webhook config
//   WHATSAPP_ORG_ID           — which CUE organization inbound messages serve (optional)
import { isLocale, type Locale } from "./i18n";

export function whatsappConnected(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function whatsappConfiguredForInbound(): boolean {
  return whatsappConnected() && Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_ORG_ID);
}

const API_VERSION = "v21.0";

export async function sendWhatsAppText(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  if (!whatsappConnected()) return { sent: false, error: "WhatsApp is not connected (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: body.slice(0, 4096) },
        }),
      },
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { sent: false, error: `WhatsApp API ${res.status}: ${detail}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export type InboundMessage = { from: string; text: string; id: string | null };

/** Flatten Meta's webhook payload to plain inbound user text messages. */
export function parseWebhookPayload(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { from?: string; id?: string; text?: { body?: string } };
        const text = typeof msg?.text?.body === "string" ? msg.text.body.trim() : "";
        if (msg?.from && text) {
          out.push({ from: msg.from, text: text.slice(0, 500), id: typeof msg.id === "string" ? msg.id : null });
        }
      }
    }
  }
  return out;
}

// Best-effort de-dupe for Meta redeliveries (per-isolate, so also keep the 24h
// safety window on the Meta side short in the webhook config).
const seen = new Set<string>();
export function alreadySeen(id: string | null): boolean {
  if (!id) return false;
  if (seen.has(id)) return true;
  if (seen.size > 500) seen.clear();
  seen.add(id);
  return false;
}

/** Lightweight script detection — honest default is English. */
export function detectLocaleFromText(text: string): Locale {
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u1EA0-\u1EFF]/.test(text)) return "vi";
  return isLocale(text) ? text : "en";
}

export function resolveInboundOrg(): string | null {
  const orgId = process.env.WHATSAPP_ORG_ID?.trim();
  return orgId || null;
}
