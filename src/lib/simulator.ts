import { prisma } from "./prisma";
import { money } from "./format";

// ─────────────────────────────────────────────────────────────
// What-if simulator. Every projection is derived from the org's
// OWN historical conversion rates; the math is shown, not hidden.
// When there is no history, we say so instead of inventing rates.
// ─────────────────────────────────────────────────────────────

export type Simulation = {
  title: string;
  /** The open opportunity the levers act on. */
  openCount: number;
  openValue: number;
  /** Historical conversion rate, or null if no history exists. */
  rate: number | null;
  rateBasis: string;
  /** Projected recovery if the follow-up plan is executed. */
  projected: number;
  math: string;
  pack: "HOME" | "AUTO";
};

export async function runSimulations(orgId: string): Promise<{ simulations: Simulation[]; hasHistory: boolean }> {
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId: orgId } });
  const industry = (profile?.industry ?? "").toLowerCase();
  const isAuto = industry.includes("auto") || industry.includes("dealership");
  const out: Simulation[] = [];

  if (isAuto) {
    // Lead → deal rate from history
    const [totalLeads, wonLeads] = await Promise.all([
      prisma.lead.count({ where: { organizationId: orgId, status: { in: ["CONTACTED", "QUALIFIED", "WON", "LOST"] } } }),
      prisma.lead.count({ where: { organizationId: orgId, status: "WON" } }),
    ]);
    const newLeads = await prisma.lead.findMany({ where: { organizationId: orgId, status: "NEW" } });
    const leadValue = newLeads.reduce((s, l) => s + (l.estValue ?? 0), 0);
    const leadRate = totalLeads > 0 ? wonLeads / totalLeads : null;
    out.push({
      title: "Respond to every missed lead",
      openCount: newLeads.length,
      openValue: leadValue,
      rate: leadRate,
      rateBasis: totalLeads > 0 ? `${wonLeads} of ${totalLeads} past leads converted` : "No lead history yet",
      projected: leadRate !== null ? Math.round(leadValue * leadRate) : 0,
      math:
        leadRate !== null
          ? `${money(leadValue)} open leads × ${Math.round(leadRate * 100)}% historical close rate = ${money(Math.round(leadValue * leadRate))}`
          : "Log lead outcomes and CUE will compute your real conversion rate here.",
      pack: "AUTO",
    });

    // Deal save rate
    const stalled = await prisma.deal.findMany({ where: { organizationId: orgId, status: "NEGOTIATING" } });
    const [closed, won] = await Promise.all([
      prisma.deal.count({ where: { organizationId: orgId, status: { in: ["WON", "LOST"] } } }),
      prisma.deal.count({ where: { organizationId: orgId, status: "WON" } }),
    ]);
    const dealValue = stalled.reduce((s, d) => s + d.amount, 0);
    const dealRate = closed > 0 ? won / closed : null;
    out.push({
      title: "Re-engage every stalled deal",
      openCount: stalled.length,
      openValue: dealValue,
      rate: dealRate,
      rateBasis: closed > 0 ? `${won} of ${closed} closed deals were won` : "No closed-deal history yet",
      projected: dealRate !== null ? Math.round(dealValue * dealRate * 0.5) : 0,
      math:
        dealRate !== null
          ? `${money(dealValue)} stalled × ${Math.round(dealRate * 100)}% close rate × 50% save factor = ${money(Math.round(dealValue * dealRate * 0.5))}`
          : "Close deals and log outcomes to unlock this projection.",
      pack: "AUTO",
    });
  } else {
    // Estimate acceptance rate
    const [accepted, declined] = await Promise.all([
      prisma.estimate.count({ where: { organizationId: orgId, status: "ACCEPTED" } }),
      prisma.estimate.count({ where: { organizationId: orgId, status: "DECLINED" } }),
    ]);
    const stale = await prisma.estimate.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "VIEWED"] } },
    });
    const staleValue = stale.reduce((s, e) => s + e.amount, 0);
    const rate = accepted + declined > 0 ? accepted / (accepted + declined) : null;
    out.push({
      title: "Follow up on every stale estimate",
      openCount: stale.length,
      openValue: staleValue,
      rate,
      rateBasis: accepted + declined > 0 ? `${accepted} of ${accepted + declined} decided estimates were accepted` : "No estimate outcomes logged yet",
      projected: rate !== null ? Math.round(staleValue * rate) : 0,
      math:
        rate !== null
          ? `${money(staleValue)} open estimates × ${Math.round(rate * 100)}% acceptance rate = ${money(Math.round(staleValue * rate))}`
          : "Mark estimates accepted/declined as decisions come in, and this projection activates.",
      pack: "HOME",
    });
  }

  return { simulations: out, hasHistory: out.some((s) => s.rate !== null) };
}
