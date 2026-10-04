// ─────────────────────────────────────────────────────────────
// Email. Two modes, chosen by env:
//   • CONSOLE (default) — "sends" by server-log + audit. In dev the
//     action response also surfaces the link/credentials so the
//     flow is usable without any email provider.
//   • RESEND — when RESEND_API_KEY is set, mail goes out through
//     Resend's REST API (no SDK needed). Swap for Postmark/SES by
//     adding another branch; call sites don't change.
// ─────────────────────────────────────────────────────────────

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional headline used in the simple HTML wrapper. */
  heading?: string;
};

export function mailMode(): "CONSOLE" | "RESEND" {
  return process.env.RESEND_API_KEY && process.env.MAIL_FROM ? "RESEND" : "CONSOLE";
}

function htmlWrap(msg: MailMessage): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#1e293b;margin:0 0 12px">${msg.heading ?? msg.subject}</h2>
  <div style="color:#475569;font-size:14px;line-height:1.6;white-space:pre-wrap">${msg.text}</div>
  <p style="color:#94a3b8;font-size:11px;margin-top:24px">CUE — The Heart of Your Business</p>
</div>`;
}

/** Send (or log) an email. Never throws — delivery problems are logged. */
export async function sendMail(msg: MailMessage): Promise<{ mode: "CONSOLE" | "RESEND"; delivered: boolean }> {
  const mode = mailMode();

  if (mode === "RESEND") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: htmlWrap(msg),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[mailer] Resend ${res.status}: ${body.slice(0, 200)}`);
        return { mode, delivered: false };
      }
      return { mode, delivered: true };
    } catch (e) {
      console.error("[mailer] send failed:", e instanceof Error ? e.message : e);
      return { mode, delivered: false };
    }
  }

  // CONSOLE mode — visible in server logs and dev consoles.
  console.log(`[mailer:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  return { mode, delivered: false };
}
