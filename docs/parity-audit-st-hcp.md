# CUE vs ServiceTitan vs Housecall Pro — feature-parity audit
*October 2026 · sources: vendor pricing/feature pages and help docs (2025–26), [full source list below](#sources).*

## Scope

Categories requested: scheduling, dispatch, invoicing, inventory, service plans/memberships, plus the areas a small operator feels day-to-day (quotes, payments, reporting). One ground rule: every CUE answer is what the current codebase actually does — verified build, not roadmap.

## Comparison

| Category | ServiceTitan | Housecall Pro | CUE (today, shipped) |
|---|---|---|---|
| **Scheduling** | Drag-drop board, capacity forecasting (Adaptive Capacity, Scheduling Pro — 2025). Quoted pricing; enterprise cost. | Drag-drop calendar, unscheduled jobs in a drawer, ZIP-code area coloring, map view. $59–$299/mo (2025 published tiers). | Unscheduled board ([/pipeline/unscheduled](../src/app/(app)/pipeline/unscheduled/page.tsx)): open maintenance jobs grouped by town/area, one-click Google-Maps route per area, CSV export, monthly unscheduled report. Appointments table with scheduled/completed/no-show. |
| **Dispatch / GPS** | Fleet Pro + Ford Pro hardware GPS, route optimization around arrival windows. | Vehicle/employee GPS, live map, "On My Way" texts. | No live GPS. Board routes by area instead of live tracking — honest gap, different-model answer (route planning, not fleet telemetry). |
| **Quotes/estimates** | Mobile estimates, booking-time payments (Scheduling Pro). | Good/better/best options, financing, digital signature. | Localized quote drafts auto-prepared from approved insights (en/es/ar/vi), payments via Stripe, plus Agreements (recurring service plans with renewal detection). |
| **Invoicing** | Same-day invoicing, Tap to Pay, Pay by Bank, AP automation. | Invoices, card on file, progress invoicing, payment reminders. | Same-day-invoice SOP enforced as tasks + same-day insight/warning, localized payment reminder cadence (owner-approved cron), overdue→sent lifecycle. |
| **Inventory** | Native Purchasing & Inventory: truck stock, POs, transfers, returns. | **No native module** — relies on the Ply integration (2025). | No native inventory. Gap. Acceptable only if CUE positions as the layer above an HCP/Ply/ServiceTitan install — otherwise a hard requirement for HVAC/parts-heavy trades. |
| **Service plans / memberships** | Customizable memberships; sign-ups during booking. | Agreements: custom services, recurring visits, monthly/quarterly/annual billing. | Agreements + CUE's distinct advantage: active/expire lifecycle tracked as a *revenue leak*, with a proposal signal when a heavy user has no agreement. |
| **Payments** | Card on file, financing, tips — very mature. | Card/ACH/wallets, automated reminders. | Stripe checkout; invoices carry paid_at and are collected in the pilot report. |
| **Reporting / business intelligence** | Marketing attribution, dashboards (enterprise-grade). | Jobs list filtering/CSV export; area-based reports "coming soon". | **Strongest differentiator:** audit-trail pilot report, $/day found-money line, projected recovery from open leaks only, health score, decision-rate and execution metrics. |
| **AI / the CUE wedge** | Agentic tools, Automations Command Center (2025) — enterprise add-on direction. | No meaningful leak/intelligence layer. | Core product: leak detection (unbilled work, stale leads, aging quotes, expiring agreements) → owner approval → workflow + tasks + quote drafts, multilingual customer comms. |

## Gap roadmap — ranked by demo-ability

Each item: can it be demoed with realistic seeded data in a 15-minute pilot?

1. **Unscheduled maintenance board** — *shipped*. Seeded backlog grouped by area, month report, CSV, Maps route. Fastest to demo, directly answers the HCP pain.
2. **Localized reminder cadence** — *shipped*. WhatsApp/email reminders speak the customer's language; HCP doesn't localize. Demo: flip the setting, show drafts in Spanish.
3. **Agreements + renewal-expiry leak** — *shipped*. Watch renewal pressure build before the owner sees it. HCP requires a separate agreements module; CUE ties it to dollars at risk.
4. **Inventory / truck stock** — *not started*, hardest gap. "CUE reads inventory from your existing Ply/ServiceTitan/HCP install" is the honest positioning; native modules are 2+ quarters away.
5. **Native GPS dispatch** — *not started*. Differentiator is *planning around* where work is, not tracking trucks; position as such, or add third-party GPS later.
6. **Payroll / AP / deep pricebook** — *not started*; enterprise-venue features. Not needed to beat HCP at its own small-operator game.

## Sources

Read by the researcher between Oct 19–20, 2026: [ServiceTitan pricing](https://www.servicetitan.com/pricing) · [ServiceTitan Pantheon 2025](https://www.servicetitan.com/press/servicetitan-major-product-expansions-pantheon-2025) · [ServiceTitan Purchasing & Inventory](https://www.servicetitan.com/blog/webinar-recap-purchasing-inventory) · [HCP pricing](https://www.housecallpro.com/pricing/) · [SoftwareConnect HCP 2025 pricing](https://softwareconnect.com/reviews/housecall-pro/) · [HCP schedule/calendar help](https://help.housecallpro.com/en/articles/6367496-how-to-use-the-schedule-tab-calendar) · [HCP routes help](https://help.housecallpro.com/en/articles/13871869-getting-started-with-routes-in-housecall-pro) · [HCP job list reporting](https://help.housecallpro.com/en/articles/8241575-job-estimate-list-reporting) · [HCP dispatch](https://www.housecallpro.com/features/dispatching-software/) · [HCP route optimization](https://www.housecallpro.com/features/route-optimization-software/) · [HCP invoicing](https://www.housecallpro.com/features/invoicing-software/) · [HCP service agreements](https://www.housecallpro.com/features/service-agreement-software/) · [HCP price book](https://www.housecallpro.com/features/price-book/) · [HCP automated marketing](https://www.housecallpro.com/features/automated-marketing/) · [HCP review management](https://www.housecallpro.com/features/review-management-software/) · [HCP Spring 2025 update (Ply)](https://www.housecallpro.com/resources/news-press/release-notes/spring-2025-product-updates/) · [Ply + ServiceTitan](https://www.getply.com/integrations/servicetitan/) · [Ply in ServiceTitan Marketplace](https://marketplace.servicetitan.com/partner/ply)
