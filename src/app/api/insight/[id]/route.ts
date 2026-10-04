import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseEvidence } from "@/lib/intelligence";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const insight = await prisma.insight.findUnique({
    where: { id },
    include: { recommendations: { take: 1 } },
  });
  if (!insight || insight.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rec = insight.recommendations[0] ?? null;
  const audit = await prisma.auditEvent.findMany({
    where: {
      organizationId: session.organizationId,
      OR: [
        { targetType: "Insight", targetId: insight.id },
        ...(rec ? [{ targetType: "Recommendation", targetId: rec.id }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  return NextResponse.json({
    insight: {
      id: insight.id,
      title: insight.title,
      summary: insight.summary,
      severity: insight.severity,
      type: insight.type,
      impactValue: insight.impactValue,
      confidence: insight.confidence,
      reasoning: insight.reasoning,
      status: insight.status,
      recId: insight.recId,
      createdAt: insight.createdAt,
    },
    rec: rec
      ? {
          id: rec.id,
          title: rec.title,
          action: rec.action,
          rationale: rec.rationale,
          impact: rec.impact,
          impactValue: rec.impactValue,
          confidence: rec.confidence,
          status: rec.status,
        }
      : null,
    evidence: await parseEvidence(insight.evidence),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      actorType: a.actorType,
      detail: a.detail,
      createdAt: a.createdAt,
    })),
  });
}
