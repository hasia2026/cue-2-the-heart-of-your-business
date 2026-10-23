# Resend sending-domain verification — hasi.tech

Created via the Resend API on 2026-10-23 (domain id `9dfd432d-944b-4e06-b66f-109a29b5f1ea`, region `us-east-1`, status `not_started`, sending capability enabled).
Source JSON: `.resend-domain-dns.json` (kept out of git).

Until these DNS records are added **and Resend verifies** the domain, pilot-request notifications keep sending from the shared `onboarding@resend.dev` sender, which only delivers to the account owner's own address (shannon102501@gmail.com). After verification you can switch `MAIL_FROM` to `CUE <pilot-alerts@hasi.tech>` and route to `pilots@hasi.tech` and any other recipient.

## DNS records to add at your registrar (hasi.tech zone)

| # | Type | Host / Name | Value | Priority |
|---|------|-------------|-------|----------|
| 1 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXLZWnQ+j3939CMEO/MCW3Fle2jbXt8T8w6VAzKSrW+N10zx7BgaeBPaPXRueatVHZ4zWef6aNkOD3CJkNEzm3ZpOlmtH7n4o1iSFnh+P2adtAqwNrdMaasW/1MEKw74QE5uR7mw2nZ66waeGCMWUziTxIVYuvmBoME/awpbh+BwIDAQAB` | — |
| 2 | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| 3 | TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| 4 | CNAME | `rsend` | `send.forge.rmta.net` | — |

TTL: Auto is fine everywhere. Typical propagation: minutes to a few hours.

## Verify

- Dashboard: https://resend.com/domains → hasi.tech → **Verify DNS Records**
- Or via API (poll until records show `succeeded`), then flip both switches:
  - `.env` / `.env.example` → `MAIL_FROM=CUE <pilot-alerts@hasi.tech>`
  - `.env` / `.env.example` / Vercel env → `PILOT_REQUEST_EMAIL=shannon102501@gmail.com,pilots@hasi.tech` (comma-separated list is supported by the lead notifier)

## Keep private
- `.resend-domain-dns.json` and `.resend-domain-id.txt` are local artifacts (values are public DNS records, but the raw API response is not for git). Add to `.gitignore` if not already covered.
