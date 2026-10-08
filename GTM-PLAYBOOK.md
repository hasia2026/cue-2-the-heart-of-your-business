# CUE Go-To-Market Playbook
*Positioning → Funnel → Pricing → Pilot script → What to borrow from the CU³ deck*

---

## 1. POSITIONING

**The one-liner that sells:**

> **"CUE finds the money you're already earning but not collecting."**

Everything in the funnel leads with recovered dollars, not features. The demo org proves the
pitch: $4,951 in unbilled service work, $460k in stale leads, $66k in aging inventory —
computed from the dealership's *own records*, with evidence attached. That's not an AI
demo; that's a profit-and-loss conversation.

Secondary lines (match to the audience):

- To an owner: "Your DMS knows you're leaving money on the table. CUE shows you exactly where."
- To a GM: "Your service manager is a great tech, not an invoicer. CUE catches the ROs that never got billed."
- To an investor: "Evidence-first AI for the 25,000+ US franchised and independent dealers that still run follow-up on sticky notes. We charge for recovered revenue, not seats."

**Category:** AI Business Operating System (Industry Packs: Auto Dealership first).
Avoid "CRM" — you'll be compared to $200/month tools instead of a $1,500/month profit system.

---

## 2. THE FUNNEL (owner → pilot → paid)

```
AWARENESS        →  "5 leaks" content + dealer groups + referrals
   ↓
LANDING PAGE     →  free "Revenue Leak Scan" (the hook)
   ↓
SCAN CALL        →  20-min screen-share on THEIR numbers (the proof)
   ↓
PILOT            →  30 days, one store, success metric agreed upfront
   ↓
CONVERT          →  annual contract at $299–799/mo after the scan proves value
```

### Stage 1 — Awareness (pick two, don't spread thin)
1. **Dealer Facebook/Reddit groups + r/Autosales** — post the *artifacts*, not the pitch:
   screenshots of CUE detecting "$4,951 unbilled" with the evidence drawer open. Posts that
   look like a case study outperform anything that looks like an ad.
2. **One free tool page** — a public "Revenue Leak Score" mini-scan (5 questions: how many
   ROs/week, average RO value, how do you track lead follow-up, how often do you reprice
   aging stock, who does billing). Spits out a score + one concrete leak. This is your
   email capture.
3. **LinkedIn outreach to GMs/Fixed-Ops directors** — 20 personalized messages/week with a
   single line: "Found $X in unbilled ROs at a store your size last month. Want the 20-min scan?"

### Stage 2 — Landing page (single conversion goal)
- Headline: "See the money your dealership is losing — in 20 minutes, from your own numbers."
- One button: **Book the free Revenue Leak Scan.** No free trial yet — trials leak leads.
- Social proof slot reserved for the pilot numbers ("$31k recovered in 60 days at a Riverside store").

### Stage 3 — The Scan Call (this is the whole game)
1. They share screen (or email a CSV export) of last month's closed ROs and leads.
2. You run CUE's detectors against it live — the exact code in `src/lib/intelligence.ts`.
3. The page shows: X unbilled ROs ($Y), Z stale leads ($W), N aging units ($V).
4. End with: "That's $X/month leaking. The pilot's job is to stop it. Want to start Monday?"

This works because the software *is* the sales demo. No slideware.

### Stage 4 — Pilot (30 days, one store, $0 or $199 setup)
- Scope: one location, service dept + leads board only. Don't onboard everything.
- **Agree one success metric before starting** — e.g. "100% of completed ROs invoiced
  within 48h" or "every lead contacted within 24h for 2 weeks straight."
- Daily 10-min check-in for the first week, then weekly.
- End-of-pilot report generated from CUE's own audit trail: leaks found → recs approved →
  dollars recovered. This document becomes the conversion asset *and* the case study.

### Stage 5 — Conversion
- Price anchor: the pilot report's recovered-dollars number vs. the monthly fee.
- Offer: annual at a discount, or monthly with a 90-day out. Annual preferred — cash + commitment.
- If they won't convert: ask for the referral ("who else in your 20-group should see this scan?").

---

## 3. PRICING

Anchor to recovered revenue, not seats. Recommended structure:

| Tier | Price | Who | What's included |
|---|---|---|---|
| **Pilot** | $0–199 one-time | One store, 30 days | Full CUE, one location, service + leads |
| **Operator** | **$299/mo** | Single store | All modules, 10 seats, email support |
| **Group** | **$799/mo** | 2–5 stores | Multi-location rollup, consolidated health scores, priority support |
| **Franchise/OEM** | $2,500+/mo | 10+ rooftops or a brand | White-label, API, dedicated success |

Rules of thumb:
- **Never price below $199/mo.** Below that you're a commodity tool, and support costs eat you.
- Deal-pack value math with them: one recovered RO/month (~$800 avg) pays for the tier.
- Annual = 2 months free (i.e., 10× monthly).
- Add-on later: "Automate" tier unlock (+$100/mo) when AI permissions go beyond Recommend.
- Founding-customer offer for the first 10 pilots: $199/mo locked for life, in exchange for
  a testimonial + case study rights. Scarcity is real at this stage; use it.

---

## 4. INVESTOR MATERIALS (what exists vs. what to build)

Already shipped in the repo: evidence-first architecture, working detectors, audit trail,
human-in-the-loop controls, multi-tenant schema, i18n incl. RTL Arabic/Vietnamese — a
credible pilot platform, not a mockup.

Build next for the raise:
1. **One-page deck** — Problem (leaked revenue) → Solution (CUE scans records, not vibes) →
   Demo screenshots → Pilot pricing → Market (25k dealers × $299–799/mo → $60–240M TAM) →
   Roadmap (Home Services, Hospitality packs) → Ask.
2. **The pilot report as exhibit A** — nothing sells like "we found $31k in 30 days."
3. **Metrics to instrument now** (so the raise has numbers): pilots started, leaks detected
   per store, dollars recovered, conversion pilot→paid, churn.

---

## 5. FROM THE CU³ DECK — TAKE, SKIP, FIX

**Take (work into product/marketing):**
- ✅ **"Scal³ / Revenue Intelligence" naming** — a branded monetization lens on the same data. Great for the Expand page. Cheap to add: it's a section header + KPI strip.
- ✅ **Mascot-style guide (Revi)** — your `CueAI` drawer becomes a character with a voice ("I'm uncovering some great opportunities…"). The expressions/poses sheet is a brand book; even 3 static states (idle → scanning → found something) adds memorability without an animation pipeline.
- ✅ **Industry butterfly/glow colors** — one accent color per Industry Pack (Auto=blue, Home Services=orange, Salon=green…). Reinforces "one core, many packs" and is a one-line theme change.
- ✅ **"$3 from every subscription → charity"** — strong differentiator + recruiting magnet. Put it on the landing page, not the footer.
- ✅ **"80% time saved / 3× growth / 5× leads / 95% CSAT"** — these are aspirational *until* the first pilots. Keep them out of the deck until a customer gives you the number; then attribute it ("— Dana Whitfield, Northgate"). Fake-looking stats repel exactly the owners you're targeting.

**Skip or defer (from the ecosystem slide):**
- Website Builder, Mascot Studio, Email Campaigns, Social Manager, Forms, Presentations, Voice/Audio, Commerce Studio, Community Hub, VR — **all "coming soon" on the slide, and correctly so.** Every one is a separate company's roadmap. They'd slow the pilot and dilute the "evidence-first OS" story. Park them in the deck's "Innovation Lab" section as future modules; revisit after 10 paying stores.
- "AI Ambassador 24/7" — you already ship CUE AI grounded in business data; don't ALSO promise a customer-facing website chatbot in the same box. Different product, different risk.

**Fix:**
- The deck says "CRM" in Expand. Don't. You're the OS above the CRM; the pack already reads leads/deals/service orders. Keep the category clean.
- "Multi-Location & Multi-Company" is on the slide — the schema (org isolation) supports it, but the UI doesn't yet. Either mark it "Group plan — Q2" or keep it out of pilot conversations.

---

## 6. FIRST 10 PILOTS — 30-DAY PLAN

Week 1: 2 landing pages live (leak score + scan booking), 100 DMs to GMs, 3 dealer-group posts.
Week 2: 5 scan calls, 2 pilots started. Instrument everything (even a spreadsheet).
Week 3: 2 more pilots; publish one screenshot-as-case-study per pilot with permission.
Week 4: Convert 1–2 to annual; raise the founding-customer price to $299.
Success at day 30 = 5 pilots, 2 conversions, 1 documented case study. That's the seed of everything else.

---

## 7. COMPETITIVE POSITIONING (october 2026 scan)

There is no single product doing what CUE does. The danger is suites converging, not one
incumbent. Use this table in scan calls when the prospect says "we already use X":

| Category | Examples | Where they stop |
|---|---|---|
| Field-service AI (HVAC) | QuoteIQ, Avoca AI, BuildOps, Housecall Pro, ServiceTrade | Dispatch, call handling, quoting, scheduling. No business-strategy insights, approvals governance, or knowledge loop. |
| All-in-one CRM/marketing OS | GoHighLevel (+ dealership resellers), monday.com, HubSpot | Pipeline and campaigns — they *store* data, they don't interpret it. No insight engine, no strategy loop. |
| "AI Business OS" startups | NeuraLake, Omninity, NexusOS, BOSAI and similar | Same category *branding*; mostly early or thin — narrow feature sets behind the marketing site. |
| Vertical DMS | DealerSocket, VinSolutions, CDK | Dealership CRM/inventory, legacy, per-seat pricing, zero generative-AI insight layer. |

**What CUE combines that none of them do (say it in this order):**
1. **The full loop** — capture documents → understand insights → enhance strategy (Compass,
   Pricing Studio) → execute *with human approval gates* → expand (GTM pipeline). Competitors
   cover one or two of the five.
2. **Approvals governance** — AI proposes, the owner decides, full audit trail. Enterprises
   talk about this pattern; SMB tools don't ship it.
3. **One system, industry-native vocabulary** — the same loops speak "dealership" or "HVAC"
   (per-org industry packs). Competitors are either vertical-only or generic.
4. **Honest degradation** — grounded-only answers when no AI key is configured, real numbers
   only. Most "AI OS" marketing in this space is the overclaiming CUE was built to avoid.
5. **Cost position** — free-LLM wiring (Groq/Gemini) keeps AI operating cost near zero, while
   DMS/FSM incumbents charge per-seat SaaS prices.

**Objection handling:**
- "We already have GoHighLevel/CDK" → "Keep it. CUE reads what your system already stores and
  finds the money it's leaking — it sits above your CRM, not instead of it."
- "Avoca/QuoteIQ do AI for HVAC" → "They answer phones and dispatch trucks. CUE tells you why
  your margin dropped and what to do about it — and asks your permission before anything moves."
- "Why not just bolt ChatGPT onto our reports?" → "No evidence trail, no approvals, no audit.
  CUE's every number is computed from your records and every action is logged."
