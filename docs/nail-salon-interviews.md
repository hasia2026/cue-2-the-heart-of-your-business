# Nail-salon owner interviews — validation script

**Why:** before writing the nail-salon vertical spec, validate the leak modes
research suggests (early cancel/no-shows, lapsed rebooking, unrecorded
add-ons, cash reconciliation) against real owners in Orange County. The
workers are majority Vietnamese — run conversations in whichever language the
owner prefers (không bắt buộc tiếng Việt, nhưng hữu ích).

**Who:** 5–10 independent salon owners (not chains). Target solo operators
and 5-chair shops — both the ~765 payroll businesses and the ~4,500 solo
operators in OC. 20–25 minutes each, one free 20-min scan of their last
month of records as the thank-you (this mirrors the flyer offer exactly, so
the conversation doubles as sales pipeline).

## Warm-up (3 min)
1. How long has the shop been open? How many chairs/techs work here?
2. Walk in or book ahead — what share of services is each?
3. What runs your appointments and checkout today: paper/text, Booksy,
   Vagaro, Square, something else? (Probe: would you be able to pull/export
   the last month of appointments and payments, or take photos of them?)

## The leak modes (10 min — validate, don't pitch)
4. Think about last month — how many appointments got cancelled late or
   just didn't show? What do you do now when a cancel opens your afternoon?
5. When a regular leaves, how often do they rebook before they go? Does
   anyone chase the customers who haven't come back in 6–8 weeks?
6. Software or not, what does an add-on (gel upgrade, nail art, callus
   treatment, paraffin) do to the ticket — and does **every** add-on end up
   in the record, or do some get rung in later?
7. How do you and your techs settle up each week — services, products,
   booth rent, tips? Where does cash vs card get messy?
8. Membership/prepaid packages ("nail club") — do you run any? If a plan
   customer stops coming, how would you even notice?

## Decision + trust (5 min)
9. If an app said "one service today was technically completed but never
   rang into the register — here's the appointment and the amount," would
   you act on it? What would make you dismiss it as wrong?
10. Who controls the numbers day-to-day: you, a manager, or the counter?
11. What's the monthly number, dollar-wise, that would make a tool like
    this obviously worth paying for?

## Close (2 min)
12. If I scanned last month's records right now and showed you where money
    leaked, would you want that in Vietnamese text or English? (Language
    preference for the digest and reminders — no assumption.)
13. Any objection to a free 20-minute scan call using read-only exports?

## What we're scoring against
- **Record reality:** is enough activity actually captured (digitally or
  photographable) for CUE to scan? (Questions 2–3)
- **Leak salience:** do cancelations/rebooking/add-ons surface as money the
  owner already worries about? (4–8)
- **Control gap:** does the owner currently get any single view of these?
- **Language:** owner-language preference for the workspace and digest.
- **Close rate:** % who say yes to the free scan → these become pilot leads.

After all interviews: write the design spec (docs/superpowers/specs/) only if
at least 6/10 confirm ≥2 leak modes they currently handle badly, and record
access looks feasible. Source material: OC counts — Groundwork (765 payroll +
4,543 solo nail-salon businesses); no-show/upsell/membership norms — Zenoti
and vendor benchmarks (treat as hypotheses, not facts).
