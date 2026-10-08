# Email Deliverability: Resend Domain Setup + Warm-Up Schedule

*Cold outreach lives or dies on deliverability. This gets you from sandbox mode to a verified sender that lands in inboxes.*

---

## Step 1 — Verify your sending domain (15 min + DNS wait)

1. Go to **resend.com/domains** → **Add Domain** → enter the domain you'll send from (e.g., `hasi.tech` — using a root domain lets you send from `dana@hasi.tech` *and* `noreply@hasi.tech`).
2. Resend shows DNS records. Add them at your DNS provider (wherever the domain's nameservers live — Cloudflare, Namecheap, etc.):
   - **SPF** — TXT record on the root (`v=spf1 include:resend.com ~all` style, exact value shown by Resend).
   - **DKIM** — TXT record(s) on the `resend._domainkey` subdomain (copy exactly — long strings).
   - **DMARC** — TXT on `_dmarc` (e.g., `v=DMARC1; p=none; rua=mailto:dana@hasi.tech` to start; tighten to `p=quarantine` later).
3. Click **Verify**. Usually minutes; can take 24–48h. Resend shows "Verified" when done.
4. Update `.env`:

   ```
   MAIL_FROM=CUE <dana@hasi.tech>     # personal-looking sender for outreach
   ```

   and restart. Password-reset emails and any outbound send now work to *anyone*, not just your own address. (The sandbox restriction message in the app disappears automatically.)

## Step 2 — Sub-domains for cold outreach (optional but recommended)

Cold volume on your root domain can hurt transactional deliverability (password resets must always arrive).
Create `send.hasi.tech` as a **separate domain in Resend** for cold outreach, and keep password resets on the root. One bad domain reputation doesn't poison the other.

## Step 3 — Warm-up schedule (first 3 weeks)

New (sub)domains with sudden volume get spam-filtered. Ramp like this:

| Week | Daily cold emails | Notes |
|---|---|---|
| 1 | 5–10/day | Hand-written, highly personalized (script A1/A2). All to warm-ish targets if possible. |
| 2 | 15–20/day | Add replies from your pilot conversations; keep personalization > 50%. |
| 3 | 25–40/day | The playbook's "20/week" target is now safe. |

Rules that matter more than volume:

- **Every email individually written** — no identical bodies at scale. Spam filters fingerprint duplicates.
- **Plain text, no images, one link max** (your /score or /book page). Signatures with tracking pixels are a red flag.
- **Reply to every response within hours** — engagement teaches filters you're legitimate.
- **Never purchase a list.** One spam-trap hit can burn the domain permanently.
- Monitor the **bounce rate** in Resend's dashboard; keep it under 3%. Above 5%, pause and clean.

## Step 4 — Ongoing hygiene

- Send Tue–Thu, 8–10am recipient local time. Weekend cold email reads as spam.
- Include a plain one-line opt-out: *"Not relevant? Tell me and I'll stop."*
- After ~90 days of good behavior, tighten DMARC to `p=quarantine` and add `pct=100`.
- Keep the Resend **suppression list** clean — hard bounces must never be retried.

## Where this fits

- Password resets: already wired via [mailer.ts](src/lib/mailer.ts) — just needs the verified `MAIL_FROM`.
- Outreach scripts: [OUTREACH-SCRIPTS.md](OUTREACH-SCRIPTS.md) — send from your own mail client, not a blast tool.
- WhatsApp follow-ups: wired separately (see .env.example WhatsApp section) — same warm-up logic applies to that channel once live.
