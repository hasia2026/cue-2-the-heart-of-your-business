// Env-gated transactional email via the Resend REST API — node fetch only,
// no SDK dependency. When RESEND_API_KEY is unset, send() reports
// connected: false and callers degrade honestly instead of pretending.
export type SendResult = { connected: boolean; sent: boolean; error?: string; id?: string };

export function mailerConnected(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "CUE <onboarding@resend.dev>";
}

export async function sendMail(opts: { to: string | string[]; subject: string; text: string; html?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { connected: false, sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: mailFrom(),
        to: opts.to,
        subject: opts.subject,
        // HTML when available; plain text is Resend's required fallback body.
        ...(opts.html ? { html: opts.html } : {}),
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { connected: true, sent: false, error: `Resend ${res.status}: ${detail.slice(0, 200) }` };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { connected: true, sent: true, id: body.id };
  } catch (e) {
    return { connected: true, sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
