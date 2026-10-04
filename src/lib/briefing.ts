import { prisma } from "./prisma";
import { computeMoneyOnTheTable } from "./impact";
import { money } from "./format";
import { countUnreadThreads } from "./messages";

// ─────────────────────────────────────────────────────────────
// Morning Briefing — "what changed, what needs me today."
// Computed fresh on each dashboard load from real records.
// ─────────────────────────────────────────────────────────────

export type Briefing = {
  headline: string;
  moneyAtStake: number;
  lines: { icon: string; text: string; href: string; tone: "urgent" | "attention" | "info" }[];
  decisionsWaiting: number;
  tasksToday: number;
  unreadMessages: number;
  newSignals: number;
  reviewsWaiting: number;
};

export async function computeBriefing(orgId: string): Promise<Briefing> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Threads with unread messages (shared logic with the nav badge)
  const unreadMessages = await countUnreadThreads(orgId);

  const [newInsights, decided, completedTasks, pendingRecs, tasksDueToday, mot, newSignals, reviewsWaiting] =
    await Promise.all([
      prisma.insight.findMany({
        where: { organizationId: orgId, status: "OPEN", createdAt: { gte: since } },
        orderBy: [{ severity: "asc" }, { impactValue: "desc" }],
        take: 3,
      }),
      prisma.auditEvent.count({
        where: { organizationId: orgId, createdAt: { gte: since }, action: { startsWith: "RECOMMENDATION_" } },
      }),
      prisma.task.count({
        where: { organizationId: orgId, status: "DONE", completedAt: { gte: since } },
      }),
      prisma.recommendation.count({
        where: { organizationId: orgId, status: "PENDING" },
      }),
      prisma.task.count({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
          dueAt: { lte: todayEnd },
        },
      }),
      computeMoneyOnTheTable(orgId),
      prisma.marketSignal.count({ where: { organizationId: orgId, status: "NEW" } }),
      prisma.gbpReview.count({ where: { organizationId: orgId, status: { not: "REPLIED" } } }),
    ]);

  const lines: Briefing["lines"] = [];

  for (const i of newInsights) {
    lines.push({
      icon: i.severity === "HIGH" ? "🔴" : i.severity === "MEDIUM" ? "🟡" : "🔵",
      text: `${i.title}${i.impactValue ? ` — ${money(i.impactValue)} at stake` : ""}`,
      href: "/understand",
      tone: i.severity === "HIGH" ? "urgent" : "attention",
    });
  }
  if (unreadMessages > 0) lines.push({ icon: "💬", text: `${unreadMessages} conversation${unreadMessages === 1 ? "" : "s"} with unread messages`, href: "/messages", tone: "attention" });
  if (newSignals > 0) lines.push({ icon: "📡", text: `${newSignals} new market signal${newSignals === 1 ? "" : "s"} to triage`, href: "/signals", tone: "attention" });
  if (reviewsWaiting > 0) lines.push({ icon: "⭐", text: `${reviewsWaiting} Google review${reviewsWaiting === 1 ? "" : "s"} waiting for a reply`, href: "/signals", tone: "attention" });
  if (decided > 0) lines.push({ icon: "✅", text: `${decided} decision${decided === 1 ? "" : "s"} made in the last 24h`, href: "/understand", tone: "info" });
  if (completedTasks > 0) lines.push({ icon: "🏗️", text: `${completedTasks} task${completedTasks === 1 ? "" : "s"} completed by the team`, href: "/execute", tone: "info" });

  const headline =
    mot.total > 0
      ? `${money(mot.total)} is sitting on the table — and ${pendingRecs > 0 ? `${pendingRecs} decision${pendingRecs === 1 ? "" : "s"} are waiting on you` : "no decisions are waiting on you"}.`
      : pendingRecs > 0
        ? `${pendingRecs} decision${pendingRecs === 1 ? "" : "s"} waiting on you. Nothing new flagged overnight.`
        : "Nothing needs you urgently. Good morning.";

  return {
    headline,
    moneyAtStake: mot.total,
    lines,
    decisionsWaiting: pendingRecs,
    tasksToday: tasksDueToday,
    unreadMessages,
    newSignals,
    reviewsWaiting,
  };
}
