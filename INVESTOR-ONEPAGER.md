# CUE — The Heart of Your Business
**AI Business Operating System · Investor Brief · October 2026**

---

## The Problem

Small and growing businesses lose **1–3% of revenue every month** to invisible operational
leaks: completed work never invoiced, leads never contacted, aging inventory without pricing
action, deals dying in handoffs, receivables nobody notices.

These aren't effort problems — they're **visibility problems**. The data to catch every one
already exists in the business's own records. Nothing is watching it.

The software market's answer is more dashboards (that describe the past) or AI chatbots
(that make things up). Neither closes the loop from *detection → evidence → human decision →
executed outcome*.

## The Solution

**CUE scans a business's actual records, finds the leaking dollars, shows the evidence,
and turns an owner's approval into executed workflows.**

```
Capture → Understand → Enhance → Execute → Expand
   └──────────── every step evidence-first, human-approved ────────────┘
```

**Differentiators (each is shipped code, not roadmap):**
- **Evidence-first intelligence** — every insight carries a query-backed evidence trail,
  reasoning, and confidence. The UI shows *why*, not just *what*. No fabricated AI claims.
- **Human-in-the-loop by design** — CUE prepares, the owner approves (Approve / Reject /
  Modify / Defer), and every decision lands in an immutable audit trail.
- **Outcome accounting** — the end-of-pilot report is generated from the audit trail itself:
  leaks found → decisions made → dollars recovered. The product proves its own ROI.
- **Industry Packs on one core** — the same engine adapts to verticals via pack schemas +
  detectors. **Auto Dealership ships first** (vehicles, deals, service orders, leads);
  Home Services, Hospitality, Salon next.

## Product State (today, deployed)

- Production Next.js 15 app on Supabase Postgres + Vercel — 34-table multi-tenant schema,
  org-level isolation, audit logging, first-party auth (scrypt + HMAC sessions)
- **5 revenue-leak detectors live**: unbilled completed work · stale lead follow-up ·
  aging inventory · finance-bottleneck deals · overdue receivables
- Explainable Business Health score (7 dimensions, Score → Evidence → Reasoning → Confidence)
- Grounded AI assistant (answers only from the business's own records; says "I don't know")
- Workflows engine: approved recommendation → task list naming the actual affected records
- Multilingual: English · Español · **Tiếng Việt** · **العربية (full RTL)**
- Public lead funnel: Revenue Leak Score (5-question diagnostic with email capture)
- Demo org seeded end-to-end: Northgate Auto Group ($4.9k unbilled, $460k stale leads,
  $66k aging inventory — detected with evidence, approvable, executable)

## Business Model

Anchor: **a fraction of recovered revenue**, priced flat.

| Tier | Price | Target |
|---|---|---|
| Pilot (30 days, 1 store) | $0–199 one-time | Acquisition |
| Operator (1 store) | **$299/mo** | Single-location dealers |
| Group (2–5 stores) | **$799/mo** | Dealer groups |
| Franchise / OEM | $2,500+/mo | Brands, white-label |

Unit economics: one recovered repair order (~$800) pays a year of Operator. Payback is
measured in days when the pilot report lands.

## Market

- **US auto dealers:** ~25,000 franchised + ~20,000 independent. At $299–799/mo blended,
  the dealership pack alone is a **$150M+ ARR** opportunity.
- **Expansion packs** (home services ~600k businesses, salons ~400k, hospitality) push the
  served market **>$1B ARR** on the same core engine.
- Wedge: the *fixed-ops + follow-up* workflow every dealer runs on spreadsheets today.
  No incumbent owns "evidence-first operating layer"; CRM tools store data but don't
  audit it, and BI tools describe but don't act.

## Roadmap

| Phase | Milestone | Status |
|---|---|---|
| **Now** | Auto Dealership pack · detectors · workflows · pilot funnel · EN/ES/VI/AR | **Shipped** |
| +90 days | 10 paying pilots · CSV/DMS ingest wizard · scheduled detector runs (Vercel Cron) · weekly digest | In build |
| +6 months | Home Services pack · Supabase Auth + RLS hardening · pgvector knowledge search · Group plan UI | Planned |
| +12 months | Franchise white-label · API access · usage-based tiers · SOC 2 track | Planned |

## The Ask

Raising a **pre-seed to fund the first 10 pilots and Pack #2**. Use of funds:
product hardening (RLS, cron, ingest), one GTM hire, pilot success engineering.

*Pilot traction target at raise: 5 pilots running, 2 converted, one documented
"$X recovered in Y days" case study — the metric that sells the next 50 dealers.*

---

**Contact:** HASI Technologies · pilots@hasi.tech
*Live demo available: evidence-first dashboard, approval chain, and pilot report — 20 minutes, real data.*
