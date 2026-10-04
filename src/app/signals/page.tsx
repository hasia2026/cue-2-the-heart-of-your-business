import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import AppShell from "@/components/AppShell";
import SignalsClient from "./SignalsClient";

export default async function SignalsPage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const locale = await getLocale();

  const [watches, signals, reviews, ingest] = await Promise.all([
    prisma.marketWatch.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { signals: true } } },
    }),
    prisma.marketSignal.findMany({
      where: { organizationId: orgId },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: { watch: { select: { name: true } } },
    }),
    prisma.gbpReview.findMany({
      where: { organizationId: orgId },
      orderBy: { postedAt: "desc" },
      take: 60,
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { ingestKey: true } }),
  ]);

  return (
    <AppShell crumb="Market Signals">
      <SignalsClient
        locale={locale}
        watches={watches.map((w) => ({
          id: w.id,
          name: w.name,
          keywords: w.keywords,
          geography: w.geography,
          sourceHint: w.sourceHint,
          active: w.active,
          signalCount: w._count.signals,
          lastSignalAt: w.lastSignalAt?.toISOString() ?? null,
        }))}
        signals={signals.map((s) => ({
          id: s.id,
          source: s.source,
          externalUrl: s.externalUrl,
          author: s.author,
          title: s.title,
          content: s.content,
          intent: s.intent,
          matchedKeywords: s.matchedKeywords,
          watchName: s.watch?.name ?? null,
          receivedAt: s.receivedAt.toISOString(),
          status: s.status,
          convertedLeadId: s.convertedLeadId,
          convertedInsightId: s.convertedInsightId,
        }))}
        reviews={reviews.map((r) => ({
          id: r.id,
          channel: r.channel,
          authorName: r.authorName,
          rating: r.rating,
          sentiment: r.sentiment,
          body: r.body,
          postedAt: r.postedAt.toISOString(),
          status: r.status,
          responseText: r.responseText,
          respondedAt: r.respondedAt?.toISOString() ?? null,
        }))}
        ingestKey={ingest?.ingestKey ?? ""}
      />
    </AppShell>
  );
}
