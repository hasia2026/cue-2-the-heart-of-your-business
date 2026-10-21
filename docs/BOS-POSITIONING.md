# CUE ≠ another BOS on the shelf

*Why the dealership/HVAC owner who tried Ninety, WorkBoard and Monday doesn't need a fourth one — they need the part of the operating system nobody else ships.*

---

## The landscape (2026)

Three platforms crowd the "business operating system" market:

| Category | Examples | Strong at | Missing |
|---|---|---|---|
| EOS frameworks | Ninety.io, Bloom Growth | Vision, accountability charts, meeting cadence | Doesn't touch your actual data; rigid structure; scorecards get *typed in* |
| OKR / goal platforms | Lattice, WorkBoard | Goal trees, check-ins | No operating content, no meeting rhythm, no industry shape |
| All-in-one suites / PM | Asana, Monday.com | Flexible projects and views | No strategy layer, no live record-of-truth — you configure everything yourself |
| Generic ERP | SAP, NetSuite, Odoo | Finance, supply chain, integration | Months-long rollout; priced for the CFO; dealerships pilot worse than they buy |

Every one of them changes **what you write down**. None of them changes **what actually happens** in the service lane.

## What CUE runs instead

1. **Industry packs are our modularity — modules install at the schema level.**
   A dealership pack (vehicles, stock aging, trade appraisals, RO invoicing) and an HVAC pack (maintenance agreements, service orders, renewal windows) aren't feature toggles we promise on an enterprise call — they're the actual table shapes CUE's detectors reason over. ERP calls this "flexible module integration" and delivers it in a 9-month implementation. CUE calls it seed data and a CSV importer, and delivers it in 20 minutes.

2. **AI insights are the guidance engine, not a bot bolt-on.**
   The 2026 "new standard" is *AI that surfaces risks and recommends actions automatically* — the research content is now table stakes in the pitch, but almost no mid-market BOS actually reads your invoices. CUE's Understand loop outputs severity + dollar impact + queryable evidence — "invoice RO-1042 or lose $2,340 of its unbilled labor" — with every number traceable to real rows.

3. **The human stays accountable.**
   EOS is right that tools are passive without ownership. CUE never acts alone: insights become recommendations, decisions are human-gated, and the pilot report reads straight from the audit trail. Approving a recommendation *now* generates the workflow and tasks with owners (this does not execute anything — each task is a person's move), which closes the classic gap where a BOS records a decision and the work still dies in a Slack thread.

4. **The weekly digest is the meeting agenda, not a notification.**
   Open leaks → decisions awaiting approval → action items with owners → approvals this week → money found. That's the EOS weekly meeting order, pre-needed-preparation, derived from live records rather than a slide someone updates on Sunday night.

5. **Money framing, not task framing.**
   Lattice tracks who's behind on objectives. CUE tracks *dollars at stake, dollars recovered, and the projected monthly recovery sitting in open leaks*. Owners fund what pays.

## What CUE deliberately is not

- **Not an ERP.** No ledger, no payroll, no tax engine — CUE reads invoices and work orders, it doesn't become the accounting system. The `/ecosystem` integrations story (QuickBooks/Xero) is the connective tissue, not a replacement.
- **Not flexible- everything software.** Monday.com wins when the customer enjoys configuring workflows. CUE wins when the owner is done configuring by Tuesday and the system already told them where the money is leaking.
- **Not framework-locked.** Run EOS/OKR rhythms inside CUE if you like — the agenda structure supports them — but nothing requires you to adopt the vocabulary to get value in week one.

## The one-line pitch

> Everything the BOS category promises in principle — alignment, accountability, live metrics, meeting rhythm, AI guidance — delivered on your **actual records** in your **industry's shape**, with a human decision on every consequential step.

---

*Sources for the category survey: EOS (eosworldwide.com), Ninety.io how-to guides, Lattice/WorkBoard OKR category pages, Salesforce/NetSuite ERP feature pages, and l2l.com's manufacturing-OS criteria. Verified against this repo's feature set: `src/lib/digest.ts`, `src/lib/intelligence.ts`, `src/lib/workflows.ts`, `src/lib/reminders.ts`, industry seed packs (`scripts/seed-dealership.mjs`, `scripts/seed-hvac.mjs`).*
