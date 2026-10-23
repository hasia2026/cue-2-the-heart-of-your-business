// Web Push "whisper" — the real-time lead alert layer. Sends through every
// registered browser subscription (lead_push_subscriptions) using the VAPID
// keys in env. Free, first-party, no per-message cost — unlike SMS. Desktop
// Chrome/Edge and Android Chrome deliver instantly; iOS Safari requires the
// site added to the Home Screen first (PWA rule), surfaced in the UI copy.
//
// With VAPID keys unset this degrades honestly: subscriptions can still be
// registered, but sends no-op with a logged reason, and email remains the
// alert path of record.
export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

type PushResult = { ok: boolean; sent: number; pruned: number; detail?: string };

export async function pushPilotAlert(title: string, body: string, url?: string): Promise<PushResult> {
  if (!pushConfigured()) return { ok: false, sent: 0, pruned: 0, detail: "VAPID keys not set (push unavailable — email is the alert of record)" };
  const webpush = (await import("web-push")).default;
  const { sql } = await import("@/lib/db");

  const subs = await sql`
    select endpoint, keys from lead_push_subscriptions`;
  if (!subs.length) return { ok: false, sent: 0, pruned: 0, detail: "no device subscriptions registered yet" };

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  let pruned = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } },
        payload,
        { vapidDetails: { subject: process.env.VAPID_SUBJECT ?? "mailto:shannon102501@gmail.com", publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! }, TTL: 3600 },
      );
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410 = subscription expired or revoked — remove it permanently.
      if (status === 404 || status === 410) {
        await sql`delete from lead_push_subscriptions where endpoint = ${sub.endpoint}`;
        pruned += 1;
      } else {
        console.warn(`push to ${sub.endpoint.slice(0, 40)}… failed:`, e instanceof Error ? e.message : String(e));
      }
    }
  }
  return { ok: sent > 0, sent, pruned };
}
