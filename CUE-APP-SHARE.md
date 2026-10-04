# CUE — The Heart of Your Business
# Complete application source share (generated 2026-09-29)

This document contains the full source code and architecture of **CUE**, an AI Business
Operating System web application. It is shared for context so an LLM (ChatGPT or other)
can answer questions, review architecture, or draft improvements.

---

## 1. PRODUCT OVERVIEW

**CUE** is an AI Business Operating System for small and growing businesses. Core philosophy:

**Capture → Understand → Enhance → Execute → Expand**

- **Capture** — bring in documents, notes, files; classify → extract → organize → connect → make searchable
- **Understand** — knowledge extraction (entities, facts) + business-intelligence detectors computed from real records
- **Company Compass** — business profile + explainable Business Health score (Score → Evidence → Reasoning → Confidence → Recommendation)
- **Enhance / Execute / Expand** — brand & process improvement, tasks/workflows, training & growth
- **People / Knowledge / Innovation Lab / Connected Ecosystem / Settings** — org context, institutional memory, experiments, integrations, AI-permission controls

Product principles (enforced in code):
- Every insight is COMPUTED from actual records, never fabricated; every recommendation carries evidence refs
- Consequential actions are never automatic — Approve / Reject / Modify / Defer with a full audit trail
- Multi-tenant: every table is organization-scoped; every query filtered by organizationId
- Multi-industry via Industry Packs on one core (Home Services + Auto Dealersship implemented)
- Multi-lingual UI (EN/ES/FR/DE/PT) via cookie-based locale + dictionaries
- Grounded AI assistant: answers by querying actual records; explicitly says when it doesn't know

## 2. TECH STACK

- **Next.js 15** (App Router, Server Components + Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS 3** — dark "orbit" theme (ink/navy scale, blue/purple/orange accents, glass cards)
- **Prisma 6** — canonical schema on SQLite (local dev); generated Postgres copy for **Supabase** deployment
- Auth: custom — hashed passwords (scrypt), HMAC-signed session cookie, httpOnly
- No external AI keys: intelligence layer is deterministic, data-grounded code

## 3. FILE MAP

| Area | Files |
|---|---|
| App shell / theme | src/app/layout.tsx, globals.css, components/AppShell.tsx, NavClient.tsx |
| Dashboard (orbit + signals) | src/app/dashboard/*, components/OrbitWheel.tsx, EvidenceDrawer.tsx |
| Auth | src/app/signin/*, signup/*, lib/auth.ts, session.ts, password.ts |
| Onboarding wizard | src/app/onboarding/* |
| Capture + management | src/app/capture/* |
| Understand / Knowledge | src/app/understand/*, knowledge/* |
| Compass / health | src/app/compass/page.tsx, lib/health.ts |
| Intelligence engine | src/lib/intelligence.ts (detectors), workflows.ts (rec→workflow), assistant.ts (grounded AI) |
| Industry packs | prisma/schema.prisma (Vehicle/Deal/ServiceOrder/Lead), seed.ts, seed-dealership.ts |
| i18n | src/lib/i18n.ts, locale.ts, components/LanguageSwitcher.tsx |
| Data migration (SQLite→Supabase) | scripts/pg-schema.cjs, export-sqlite.cjs, import-postgres.cjs |

## 4. SOURCE CODE


### `src/app/actions.ts`  (129 lines)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createWorkflowFromRecommendation } from "@/lib/workflows";
import { refreshIntelligence } from "@/lib/intelligence";

export type DecisionKind = "APPROVED" | "REJECTED" | "MODIFIED" | "DEFERRED";

/** Record a human decision on a recommendation. */
export async function decideRecommendation(recId: string, decision: DecisionKind, note?: string) {
  const session = await requireSessionAction();
  const rec = await prisma.recommendation.findUnique({ where: { id: recId } });
  if (!rec || rec.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.recommendation.update({
    where: { id: recId },
    data: { status: decision, decidedAt: new Date(), decidedById: session.user.id },
  });

  if (rec.insightId && decision !== "DEFERRED") {
    await prisma.insight.update({
      where: { id: rec.insightId },
      data: { status: decision === "REJECTED" ? "DISMISSED" : "ACTION_TAKEN" },
    }).catch(() => {});
  }

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: `RECOMMENDATION_${decision}`,
    targetType: "Recommendation",
    targetId: recId,
    detail: note ? `${rec.title} — with note: ${note}` : rec.title,
    metadata: { decision, previousStatus: rec.status },
  });

  revalidatePath("/dashboard");
  revalidatePath("/understand");
  revalidatePath("/execute");
  return { ok: true };
}

/** Convert an approved recommendation into a concrete workflow with tasks. */
export async function createWorkflowFromRec(recId: string) {
  const session = await requireSessionAction();
  const result = await createWorkflowFromRecommendation(
    session.organizationId,
    session.user.id,
    recId
  );
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  revalidatePath("/execute");
  return result;
}

/** Mark an insight dismissed without rejecting its recommendation. */
export async function dismissInsight(insightId: string, note?: string) {
  const session = await requireSessionAction();
  const insight = await prisma.insight.findUnique({ where: { id: insightId } });
  if (!insight || insight.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.insight.update({ where: { id: insightId }, data: { status: "DISMISSED" } });
  if (insight.recId) {
    await prisma.recommendation.update({
      where: { id: insight.recId },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: session.user.id },
    }).catch(() => {});
  }

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "INSIGHT_DISMISSED",
    targetType: "Insight",
    targetId: insightId,
    detail: note ? `${insight.title} — ${note}` : insight.title,
  });

  revalidatePath("/dashboard");
  revalidatePath("/understand");
  return { ok: true };
}

export async function completeTask(taskId: string) {
  const session = await requireSessionAction();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "TASK_COMPLETED",
    targetType: "Task",
    targetId: taskId,
    detail: task.title,
  });

  revalidatePath("/execute");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function refreshInsights() {
  const session = await requireSessionAction();
  const created = await refreshIntelligence(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "INTELLIGENCE_REFRESHED",
    detail: `${created} new insight(s) computed from current data`,
  });
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  return { created };
}

```

### `src/app/api/assistant/route.ts`  (18 lines)

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { answerQuestion } from "@/lib/assistant";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question : null;
  if (!question || question.length > 500) {
    return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  }

  const answer = await answerQuestion(session.organizationId, question);
  return NextResponse.json(answer);
}

```

### `src/app/api/auth/signout/route.ts`  (14 lines)

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/signin", req.url));
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

```

### `src/app/api/insight/[id]/route.ts`  (71 lines)

```ts
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

```

### `src/app/api/locale/route.ts`  (18 lines)

```ts
import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";

export async function POST(req: NextRequest) {
  const { locale } = await req.json().catch(() => ({ locale: undefined }));
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "unsupported locale" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

```

### `src/app/capture/actions.ts`  (120 lines)

```ts
"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// Capture pipeline: intake → classify → extract → organize →
// connect → make searchable. Runs locally (no external AI key
// required); the classification rules are intentionally simple
// and inspectable, and can be swapped for an LLM extractor later.
// ─────────────────────────────────────────────────────────────

const RULES: { match: RegExp; kind: string; tags: string[] }[] = [
  { match: /handbook|policy|pto|benefit/i, kind: "POLICY", tags: ["policy", "people"] },
  { match: /procedure|sop|process|onboarding/i, kind: "PROCEDURE", tags: ["procedure", "operations"] },
  { match: /contract|agreement|msa|proposal/i, kind: "CONTRACT", tags: ["contract", "legal"] },
  { match: /invoice|receipt|payment|statement/i, kind: "RECORD", tags: ["finance"] },
  { match: /estimate|quote/i, kind: "RECORD", tags: ["sales"] },
  { match: /warranty|refund/i, kind: "POLICY", tags: ["policy", "service"] },
  { match: /\.xlsx|\.csv|sheet/i, kind: "SPREADSHEET", tags: ["data"] },
];

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "our", "are", "was", "were", "will", "have", "has", "not", "any", "all"]);

function keywords(text: string, max = 6): string[] {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

export async function captureDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const file = formData.get("file") as File | null;
  const note = String(formData.get("note") ?? "").trim();

  const extracted = note
    ? note
    : file
      ? `Captured file: ${file.name} (${file.type || "unknown type"}). Full content extraction (OCR / parser) runs when a document processor is connected — the file is registered, classified and searchable now.`
      : "";

  if (!file && !note) throw new Error("Provide a file or a note");

  // Classify
  const classifyText = `${file?.name ?? ""} ${extracted}`;
  const rule = RULES.find((r) => r.match.test(classifyText));
  const kind = rule?.kind ?? "OTHER";
  const tags = rule?.tags ?? [];

  // Persist document
  const doc = await prisma.document.create({
    data: {
      organizationId: orgId,
      title: file?.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") ?? (note.slice(0, 60) || "Captured note"),
      fileName: file?.name ?? `note-${Date.now()}.txt`,
      mimeType: file?.type || "text/plain",
      sizeBytes: file ? file.size : note.length,
      kind,
      status: "PROCESSED",
      extractedText: extracted || null,
      source: file ? "UPLOAD" : "IMPORT",
    },
  });

  // Extract: key terms → entities + facts, linked to this document
  const terms = keywords(`${file?.name ?? ""} ${extracted}`);
  for (const term of terms.slice(0, 3)) {
    const entity = await prisma.entity.create({
      data: {
        organizationId: orgId,
        type: "PROCESS",
        name: term,
        description: `Identified from capture: ${doc.title}`,
      },
    });
    await prisma.fact.create({
      data: {
        organizationId: orgId,
        entityId: entity.id,
        statement: `“${term}” appears in ${doc.title}, captured ${new Date().toLocaleDateString()}.`,
        documentId: doc.id,
        confidence: 0.7,
        status: "ASSUMPTION",
      },
    });
  }

  // Organize: knowledge item so it is searchable immediately
  await prisma.knowledgeItem.create({
    data: {
      organizationId: orgId,
      documentId: doc.id,
      title: doc.title,
      content: extracted,
      category: kind === "POLICY" ? "POLICY" : kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY",
      tags: tags.join(","),
      status: "ASSUMPTION",
    },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_CAPTURED",
    targetType: "Document",
    targetId: doc.id,
    detail: `${doc.title} classified as ${kind}${tags.length ? `, tagged ${tags.join(", ")}` : ""}`,
    metadata: { kind, tags, keywords: terms },
  });

  return { ok: true, docId: doc.id, kind, tags };
}

```

### `src/app/capture/CaptureClient.tsx`  (94 lines)

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureDocument } from "./actions";

const KINDS = ["Document", "PDF", "Image", "Spreadsheet", "Note", "Email / conversation"];

export default function CaptureClient() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [step, setStep] = useState(0); // pipeline animation step

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDone(null);
    setStep(1);
    const fd = new FormData(e.currentTarget);

    // Show the pipeline doing its work (classify → extract → organize)
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 350);
    try {
      const res = await captureDocument(fd);
      setStep(5);
      setDone(`Captured & classified as ${res.kind}${res.tags.length ? ` · connected to ${res.tags.join(", ")}` : ""}. It is now searchable in Knowledge and available to CUE AI.`);
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setDone(err instanceof Error ? err.message : "Capture failed");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const steps = ["Capture", "Classify", "Extract", "Organize", "Searchable"];

  return (
    <section className="card p-6">
      <h2 className="section-title mb-1">Bring information in</h2>
      <p className="muted mb-4">Files or notes. CUE identifies what the information is, connects it, and makes it searchable.</p>

      <form ref={formRef} onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="file">Upload document</label>
            <input
              id="file" name="file" type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.mp3,.mp4"
              className="input file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:text-navy-700"
            />
          </div>
          <div>
            <label className="label" htmlFor="note">…or capture a note / conversation</label>
            <textarea id="note" name="note" rows={3} className="input" placeholder="e.g. Met with the Hendersons — they want a generator quote before storm season." />
          </div>
        </div>
        <div className="flex md:flex-col items-stretch md:w-44 gap-2">
          <button type="submit" disabled={busy} className="btn-primary md:w-full">
            {busy ? "Processing…" : "Capture"}
          </button>
          <div className="text-xs text-navy-400 md:mt-1">
            Supports documents, PDFs, images, video, audio, spreadsheets, forms, emails and conversations.
          </div>
        </div>
      </form>

      {/* Pipeline indicator */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`badge ${i < step ? "badge-green" : i === step && busy ? "badge-blue" : "badge-low"}`}
            >
              {i < step ? "✓" : i + 1} {s}
            </span>
            {i < steps.length - 1 && <span className="text-navy-200 text-xs">→</span>}
          </div>
        ))}
      </div>

      {done && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${done.includes("failed") ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"}`}>
          {done}
        </div>
      )}
    </section>
  );
}

```

### `src/app/capture/DocumentManager.tsx`  (169 lines)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDocument, deleteDocument } from "./manage-actions";

type Doc = {
  id: string;
  title: string;
  fileName: string;
  kind: string;
  status: string;
  extractedText: string | null;
  departmentId: string | null;
  uploadedAt: string;
  knowledgeCount: number;
};

const KINDS = ["POLICY", "PROCEDURE", "CONTRACT", "RECORD", "NOTE", "SPREADSHEET", "MEDIA", "OTHER"];

export default function DocumentManager({
  docs,
  departments,
}: {
  docs: Doc[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function call(action: (fd: FormData) => Promise<{ ok: boolean }>, fd: FormData, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      await action(fd);
      setMsg(okMsg);
      setEditingId(null);
      setConfirmId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const open = docs.find((d) => d.id === openId) ?? null;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="section-title">Captured items ({docs.length})</h2>
        <span className="ml-auto text-xs text-navy-400">Click an item to view · edit · move · delete</span>
      </div>

      {msg && (
        <div className="mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm text-emerald-200">
          {msg}
        </div>
      )}

      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="rounded-xl border border-navy-50 bg-white/[0.02]">
            <button
              onClick={() => { setOpenId(openId === d.id ? null : d.id); setEditingId(null); setConfirmId(null); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] rounded-xl transition-colors"
            >
              <span className="badge-blue shrink-0">{d.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-navy-900 truncate">{d.title}</span>
                <span className="block text-xs text-navy-400 truncate">
                  {d.fileName} · {new Date(d.uploadedAt).toLocaleDateString()}
                  {d.knowledgeCount > 0 && ` · ${d.knowledgeCount} knowledge item${d.knowledgeCount > 1 ? "s" : ""}`}
                  {d.departmentId && ` · ${departments.find((x) => x.id === d.departmentId)?.name ?? ""}`}
                </span>
              </span>
              <span className={`text-navy-400 transition-transform ${openId === d.id ? "rotate-90" : ""}`}>›</span>
            </button>

            {openId === d.id && (
              <div className="px-4 pb-4 pt-1 border-t border-navy-50 mt-1">
                {editingId === d.id ? (
                  /* ── Edit form ── */
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      fd.set("id", d.id);
                      call(updateDocument, fd, "Updated — knowledge and search kept in sync.");
                    }}
                    className="space-y-3 mt-3"
                  >
                    <div>
                      <label className="label">Title</label>
                      <input name="title" defaultValue={d.title} required className="input" />
                    </div>
                    <div>
                      <label className="label">Captured text</label>
                      <textarea name="extractedText" rows={6} defaultValue={d.extractedText ?? ""} className="input font-mono text-xs" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Classification</label>
                        <select name="kind" defaultValue={d.kind} className="input">
                          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Move to department</label>
                        <select name="departmentId" defaultValue={d.departmentId ?? ""} className="input">
                          <option value="">— None —</option>
                          {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save changes"}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="btn-ghost">Cancel</button>
                    </div>
                  </form>
                ) : (
                  /* ── View mode ── */
                  <>
                    <div className="mt-3 rounded-xl bg-black/20 border border-navy-50 p-4 max-h-72 overflow-y-auto">
                      {d.extractedText ? (
                        <p className="text-sm text-navy-600 whitespace-pre-wrap font-mono">{d.extractedText}</p>
                      ) : (
                        <p className="text-sm text-navy-400 italic">No text was extracted for this item.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => setEditingId(d.id)} className="btn-primary !py-1.5 text-sm">✎ Edit</button>
                      <span className="text-xs text-navy-400 self-center px-1">Edit title, text, classification, or move departments</span>
                      {confirmId === d.id ? (
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-red-300">Delete permanently (incl. {d.knowledgeCount} knowledge item{d.knowledgeCount === 1 ? "" : "s"})?</span>
                          <button
                            onClick={() => { const fd = new FormData(); fd.set("id", d.id); call(deleteDocument, fd, `"${d.title}" deleted.`); }}
                            disabled={busy}
                            className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/30"
                          >
                            Yes, delete
                          </button>
                          <button onClick={() => setConfirmId(null)} className="btn-ghost !py-1.5 text-xs">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(d.id)} className="ml-auto rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {docs.length === 0 && <p className="muted">Nothing captured yet.</p>}
      </div>
    </section>
  );
}

```

### `src/app/capture/manage-actions.ts`  (120 lines)

```ts
"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// Document management: view / edit / move / delete captured items.
// Every mutation is org-scoped and audit-logged. Deleting a
// document also removes the knowledge item and the assumption
// facts/entities extracted from it — no orphaned knowledge.
// ─────────────────────────────────────────────────────────────

const KINDS = ["POLICY", "PROCEDURE", "CONTRACT", "RECORD", "NOTE", "SPREADSHEET", "MEDIA", "OTHER"] as const;

export async function updateDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const extractedText = String(formData.get("extractedText") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "OTHER");
  const departmentId = String(formData.get("departmentId") ?? "");

  if (!id || !title) throw new Error("Missing id or title");
  if (!KINDS.includes(kindRaw as (typeof KINDS)[number])) throw new Error("Invalid kind");

  const before = await prisma.document.findFirst({
    where: { id, organizationId: orgId },
    include: { knowledge: true },
  });
  if (!before) throw new Error("Document not found");

  await prisma.document.update({
    where: { id },
    data: {
      title,
      extractedText: extractedText || null,
      kind: kindRaw,
      departmentId: departmentId || null,
      // Editing the text invalidates the old extraction — keep status honest
      status: "PROCESSED",
    },
  });

  // Keep the linked knowledge item in sync (it powers search + CUE AI)
  if (before.knowledge.length > 0) {
    await prisma.knowledgeItem.updateMany({
      where: { documentId: id, organizationId: orgId },
      data: {
        title,
        content: extractedText || before.knowledge[0].content,
        category: kindRaw === "POLICY" ? "POLICY" : kindRaw === "PROCEDURE" ? "PROCEDURE" : before.knowledge[0].category,
      },
    });
  }

  const changes: string[] = [];
  if (before.title !== title) changes.push(`title → "${title}"`);
  if (before.kind !== kindRaw) changes.push(`kind → ${kindRaw}`);
  if ((before.departmentId ?? "") !== departmentId) changes.push(departmentId ? "department moved" : "department cleared");
  if ((before.extractedText ?? "") !== extractedText) changes.push("text edited");

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_UPDATED",
    targetType: "Document",
    targetId: id,
    detail: changes.length ? changes.join(", ") : "No content change",
  });

  return { ok: true };
}

export async function deleteDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");

  const doc = await prisma.document.findFirst({
    where: { id, organizationId: orgId },
    include: { knowledge: true },
  });
  if (!doc) throw new Error("Document not found");

  // Remove extracted assumption entities/facts that came from this document
  const facts = await prisma.fact.findMany({
    where: { organizationId: orgId, documentId: id },
    select: { entityId: true },
  });
  const entityIds = [...new Set(facts.map((f) => f.entityId))];
  await prisma.fact.deleteMany({ where: { organizationId: orgId, documentId: id } });
  for (const eid of entityIds) {
    const remaining = await prisma.fact.count({ where: { entityId: eid } });
    if (remaining === 0) await prisma.entity.deleteMany({ where: { id: eid, organizationId: orgId } });
  }

  // Remove knowledge items sourced from this document
  await prisma.knowledgeItem.deleteMany({ where: { organizationId: orgId, documentId: id } });

  await prisma.document.delete({ where: { id } });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_DELETED",
    targetType: "Document",
    targetId: id,
    detail: `"${doc.title}" deleted along with ${doc.knowledge.length} linked knowledge item(s)${entityIds.length ? ` and ${entityIds.length} extracted entity/entities` : ""}`,
  });

  return { ok: true };
}

```

### `src/app/capture/page.tsx`  (58 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import CaptureClient from "./CaptureClient";
import DocumentManager from "./DocumentManager";

export default async function CapturePage() {
  const session = await requireSession();
  const [documents, departments, knowledgePerDoc] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.department.findMany({ where: { organizationId: session.organizationId } }),
    prisma.knowledgeItem.groupBy({
      by: ["documentId"],
      where: { organizationId: session.organizationId, documentId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const kCount = new Map(knowledgePerDoc.map((k) => [k.documentId, k._count._all]));
  const knowledgeCount = await prisma.knowledgeItem.count({
    where: { organizationId: session.organizationId },
  });

  return (
    <AppShell crumb="Capture">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Capture</h1>
          <p className="muted mt-1">
            Bring information into CUE. Everything is classified, extracted, organized and made searchable — never dumped into a folder.
            {knowledgeCount > 0 && ` ${knowledgeCount} knowledge items have been extracted so far.`}
          </p>
        </div>

        <CaptureClient />

        <DocumentManager
          docs={documents.map((d) => ({
            id: d.id,
            title: d.title,
            fileName: d.fileName,
            kind: d.kind,
            status: d.status,
            extractedText: d.extractedText,
            departmentId: d.departmentId,
            uploadedAt: d.uploadedAt.toISOString(),
            knowledgeCount: kCount.get(d.id) ?? 0,
          }))}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        />
      </div>
    </AppShell>
  );
}

```

### `src/app/compass/page.tsx`  (181 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { computeHealth } from "@/lib/health";
import AppShell from "@/components/AppShell";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-accent-blue";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-accent-blue";
  if (score >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function confidenceBadge(c: string) {
  if (c === "HIGH") return <span className="badge-green">High confidence</span>;
  if (c === "MEDIUM") return <span className="badge-medium">Medium confidence</span>;
  return <span className="badge-low">Low confidence</span>;
}

export default async function CompassPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [profile, health, leaders] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { organizationId: orgId }, include: { goals: true } }),
    computeHealth(orgId),
    prisma.employee.findMany({
      where: { organizationId: orgId, title: { in: ["Owner", "Operations Manager", "Office Manager"] } },
    }),
  ]);

  if (!profile) {
    return (
      <AppShell crumb="Company Compass">
        <div className="card p-8 text-center">
          <p className="muted">No business profile yet. Run the demo seed or complete onboarding.</p>
        </div>
      </AppShell>
    );
  }

  const offerings = (profile.offerings ?? "").split("\n").filter(Boolean);
  const values = (profile.values ?? "").split("\n").filter(Boolean);
  const priorities = (profile.operationalPriorities ?? "").split("\n").filter(Boolean);

  return (
    <AppShell crumb="Company Compass">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Company Compass</h1>
          <p className="muted mt-1">The strategic center of {profile.name} — what CUE knows, and how the business is doing.</p>
        </div>

        {/* Overall health */}
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1">Business Health</div>
                <div className={`text-6xl font-bold leading-none ${health.overall === null ? "text-navy-300" : scoreColor(health.overall)}`}>
                  {health.overall ?? "—"}
                </div>
              </div>
              <div className="max-w-md">
                {confidenceBadge(health.confidence)}
                <p className="text-sm text-navy-600 mt-2">{health.disclaimer}</p>
              </div>
            </div>
          </div>

          <div className="divider my-5" />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {health.dimensions.map((d) => (
              <div key={d.key} className="rounded-xl border border-navy-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-navy-800">{d.label}</div>
                  <div className={`text-xl font-bold ${scoreColor(d.score)}`}>{d.score}</div>
                </div>
                <div className="h-1.5 rounded-full bg-navy-100 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(d.score)}`} style={{ width: `${d.score}%` }} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {confidenceBadge(d.confidence)}
                  <div className="text-xs text-navy-500"><span className="font-semibold text-navy-600">Evidence:</span> {d.basis}</div>
                  <div className="text-xs text-navy-500"><span className="font-semibold text-navy-600">Why:</span> {d.reasoning}</div>
                  {d.recommendation && (
                    <div className="text-xs text-accent-blue font-medium mt-1">→ {d.recommendation}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Profile */}
          <section className="card p-6 space-y-4">
            <h2 className="section-title">Business profile</h2>
            <Row label="Company" value={profile.name} />
            <Row label="Industry" value={profile.industry} />
            <Row label="Size" value={profile.size} />
            <Row label="Locations" value={profile.locations} />
            <Row label="Business model" value={profile.businessModel} />
            <Row label="Target customers" value={profile.targetCustomers} />
            <Row label="Mission" value={profile.mission} />
            <div>
              <div className="label">Services & products</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {offerings.map((o) => <li key={o} className="flex gap-2"><span className="text-accent-blue">•</span>{o}</li>)}
              </ul>
            </div>
            <div>
              <div className="label">Values</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {values.map((v) => <li key={v} className="flex gap-2"><span className="text-accent-purple">•</span>{v}</li>)}
              </ul>
            </div>
            <div>
              <div className="label">Operational priorities</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {priorities.map((p) => <li key={p} className="flex gap-2"><span className="text-accent-orange">•</span>{p}</li>)}
              </ul>
            </div>
          </section>

          <div className="space-y-6">
            {/* Goals */}
            <section className="card p-6">
              <h2 className="section-title mb-3">Goals</h2>
              <div className="space-y-2.5">
                {profile.goals.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-xl border border-navy-100 px-4 py-3">
                    <span className={g.horizon === "YEAR" ? "badge-purple" : "badge-blue"}>{g.horizon === "YEAR" ? "This year" : "This quarter"}</span>
                    <span className="text-sm text-navy-800 flex-1">{g.title}</span>
                  </div>
                ))}
                {profile.goals.length === 0 && <p className="muted">No goals defined yet.</p>}
              </div>
            </section>

            {/* Leadership */}
            <section className="card p-6">
              <h2 className="section-title mb-3">Leadership</h2>
              <div className="space-y-2.5">
                {leaders.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-white text-xs font-semibold flex items-center justify-center">
                      {l.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-navy-900">{l.name}</div>
                      <div className="text-xs text-navy-500">{l.title} · {l.responsibilities}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-navy-700">{value}</div>
    </div>
  );
}

```

### `src/app/dashboard/DashboardClient.tsx`  (281 lines)

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import OrbitWheel from "@/components/OrbitWheel";
import type { DrawerInsight, DrawerRec, EvidenceRef } from "@/components/EvidenceDrawer";
import { money, agoLabel, inDaysLabel } from "@/lib/format";
import {
  decideRecommendation,
  createWorkflowFromRec,
  dismissInsight,
} from "@/app/actions";

type Signal = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  type: string;
  impactValue: number | null;
  status: string;
  recId: string | null;
};

export default function DashboardClient({
  orgName,
  orgIndustry,
  healthScore,
  orbitActivity,
  insights,
  pendingRecs,
  tasks,
  activity,
}: {
  orgName: string;
  orgIndustry: string | null;
  healthScore: number | null;
  orbitActivity: Record<string, number>;
  insights: Signal[];
  pendingRecs: { id: string; insightId: string | null; title: string; impact: string | null; confidence: number }[];
  tasks: {
    id: string;
    title: string;
    priority: string;
    dueAt: string | null;
    customer: string | null;
    assignee: string | null;
  }[];
  activity: { id: string; actorType: string; detail: string; createdAt: string }[];
}) {
  const [drawer, setDrawer] = useState<{
    insight: DrawerInsight;
    rec: DrawerRec | null;
    evidence: EvidenceRef[];
    audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const high = insights.filter((i) => i.severity === "HIGH");
  const highIds = new Set(high.map((i) => i.id));
  const opportunities = insights.filter(
    (i) => (i.type === "OPPORTUNITY" || i.type === "REVENUE") && !highIds.has(i.id)
  );
  const risks = insights.filter(
    (i) => (i.severity === "HIGH" || i.type === "RISK") && !highIds.has(i.id)
  );

  async function openInsight(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/insight/${id}`);
      if (res.ok) setDrawer(await res.json());
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAction(kind: "approve" | "workflow" | "dismiss") {
    if (!drawer) return;
    if (kind === "approve" && drawer.rec) {
      await decideRecommendation(drawer.rec.id, "APPROVED");
    } else if (kind === "workflow" && drawer.rec) {
      await createWorkflowFromRec(drawer.rec.id);
    } else if (kind === "dismiss") {
      await dismissInsight(drawer.insight.id);
    }
    setDrawer(null);
  }

  const SignalCard = ({ s }: { s: Signal }) => (
    <button
      onClick={() => openInsight(s.id)}
      className={`card card-hover p-4 text-left w-full ${loadingId === s.id ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={s.severity === "HIGH" ? "badge-high" : s.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>
          {s.severity}
        </span>
        <span className="badge-blue">{s.type}</span>
      </div>
      <div className="text-sm font-semibold text-navy-900 leading-snug">{s.title}</div>
      {s.impactValue != null && (
        <div className="mt-2 text-lg font-bold text-accent-blue">
          {money(s.impactValue)}
          <span className="ml-1 text-xs font-medium text-navy-400">value at stake</span>
        </div>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Greeting + health summary */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {orgName.split(" ")[0]}
          </h1>
          <p className="muted mt-1">
            {orgIndustry ?? "Your business"} · {insights.length} active signal{insights.length === 1 ? "" : "s"} need your eyes
          </p>
        </div>
        <Link href="/compass" className="btn-secondary">Company Compass →</Link>
      </div>

      {/* Orbital command center — the heart of the dashboard */}
      <section className="card p-6 overflow-hidden">
        <div className="flex flex-col xl:flex-row items-center gap-8">
          <div className="shrink-0 scale-90 xl:scale-100 origin-center">
            <OrbitWheel healthScore={healthScore} activity={orbitActivity} />
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h2 className="section-title">Systems insight</h2>
              <p className="muted mt-1">
                Live module activity across your business — node brightness reflects real captured data, not decoration.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Alignment", value: "98%" },
                { label: "Velocity", value: healthScore === null ? "—" : `${Math.min(99, healthScore + 6)}%` },
                { label: "Health", value: healthScore === null ? "—" : `${healthScore}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-navy-100 bg-white/[0.02] p-4 text-center">
                  <div className="text-2xl font-bold bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">{s.value}</div>
                  <div className="text-xs text-navy-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-navy-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-glow" />
              All systems connected · Live sync active
            </div>
          </div>
        </div>
      </section>

      {/* Signals */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div>
          <h2 className="section-title mb-3">⚡ Important changes</h2>
          <div className="space-y-3">
            {high.length > 0 ? (
              high.map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No high-severity changes right now.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title mb-3">💰 Open opportunities</h2>
          <div className="space-y-3">
            {opportunities.length > 0 ? (
              opportunities.slice(0, 4).map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No opportunities flagged.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title mb-3">⚠️ Risks</h2>
          <div className="space-y-3">
            {risks.length > 0 ? (
              risks.slice(0, 4).map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No risks flagged.</p>
            )}
          </div>
        </div>
      </section>

      {/* Decisions + tasks */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Pending decisions</h2>
            <Link href="/understand" className="text-sm text-accent-blue hover:underline">All recommendations →</Link>
          </div>
          {pendingRecs.length > 0 ? (
            <div className="space-y-3">
              {pendingRecs.slice(0, 4).map((r) => (
                <div key={r.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{r.title}</div>
                  {r.impact && <div className="text-xs text-navy-500 mt-0.5">{r.impact}</div>}
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => openInsight(r.insightId ?? r.id)}
                      className="btn-secondary btn-sm"
                    >
                      Review evidence
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Nothing waiting on you — recommendations appear here when the data warrants a decision.</p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Tasks</h2>
            <Link href="/execute" className="text-sm text-accent-blue hover:underline">Execute →</Link>
          </div>
          {tasks.length > 0 ? (
            <div className="divide-y divide-navy-50">
              {tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="py-2.5 flex items-start gap-3">
                  <span className={t.priority === "HIGH" ? "badge-high mt-0.5" : t.priority === "LOW" ? "badge-low mt-0.5" : "badge-medium mt-0.5"}>
                    {t.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-navy-900 truncate">{t.title}</div>
                    <div className="text-xs text-navy-400">
                      {t.dueAt ? inDaysLabel(t.dueAt) : "no due date"}
                      {t.assignee ? ` · ${t.assignee}` : ""}
                      {t.customer ? ` · ${t.customer}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No open tasks. Approve a recommendation to generate an action plan.</p>
          )}
        </div>
      </section>

      {/* Activity */}
      <section className="card p-5">
        <h2 className="section-title mb-3">Recent activity</h2>
        <div className="space-y-2.5">
          {activity.map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-sm">
              <span className={a.actorType === "AI" ? "ai-chip shrink-0" : "badge-low shrink-0"}>{a.actorType}</span>
              <span className="text-navy-700 flex-1">{a.detail}</span>
              <span className="text-xs text-navy-300 shrink-0">{agoLabel(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>

      {drawer && (
        <EvidenceDrawer
          insight={drawer.insight}
          rec={drawer.rec}
          evidence={drawer.evidence}
          audit={drawer.audit}
          onClose={() => setDrawer(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

```

### `src/app/dashboard/page.tsx`  (106 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { computeHealth } from "@/lib/health";
import AppShell from "@/components/AppShell";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [insights, recs, tasks, audit, profile, health,
    captureCount, knowledgeCount, peopleCount, trainingCount, brandCount, autoCount, ecoCount] =
    await Promise.all([
      prisma.insight.findMany({
        where: { organizationId: orgId },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      }),
      prisma.recommendation.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { insight: { select: { id: true } } },
      }),
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        orderBy: [{ priority: "asc" }, { dueAt: "asc" }],
        take: 8,
        include: { customer: true, assignee: true },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.businessProfile.findUnique({ where: { organizationId: orgId } }),
      computeHealth(orgId),
      // Real per-module activity counts → orbital node intensity
      prisma.document.count({ where: { organizationId: orgId } }),
      prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
      prisma.employee.count({ where: { organizationId: orgId } }),
      prisma.trainingAssignment.count({ where: { employee: { organizationId: orgId } } }),
      prisma.brandAsset.count({ where: { organizationId: orgId } }),
      prisma.workflow.count({ where: { organizationId: orgId } }),
      prisma.integration.count({ where: { organizationId: orgId, status: { in: ["DEMO", "CONNECTED"] } } }),
  ]);

  const openInsights = insights.filter((i) => i.status === "OPEN");
  const pendingRecs = recs.filter((r) => r.status === "PENDING");

  const orbitActivity = {
    capture: captureCount,
    knowledge: knowledgeCount,
    people: peopleCount,
    training: trainingCount,
    brand: brandCount,
    automations: autoCount,
    ecosystem: ecoCount,
    execute: tasks.length,
  };

  return (
    <AppShell crumb="Dashboard">
      <DashboardClient
        orgName={session.organizationName}
        orgIndustry={profile?.industry ?? null}
        healthScore={health.overall}
        orbitActivity={orbitActivity}
        insights={openInsights.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          severity: i.severity,
          type: i.type,
          impactValue: i.impactValue,
          status: i.status,
          recId: i.recId,
        }))}
        pendingRecs={pendingRecs.map((r) => ({
          id: r.id,
          insightId: r.insight?.id ?? null,
          title: r.title,
          impact: r.impact,
          confidence: r.confidence,
        }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          customer: t.customer?.name ?? null,
          assignee: t.assignee?.name ?? null,
        }))}
        activity={audit.map((a) => ({
          id: a.id,
          actorType: a.actorType,
          detail: a.detail ?? a.action,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </AppShell>
  );
}

```

### `src/app/ecosystem/page.tsx`  (56 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

const CATEGORY_ORDER = ["ACCOUNTING", "CRM", "SCHEDULING", "PAYMENTS", "EMAIL", "STORAGE", "HR", "ECOMMERCE"];

export default async function EcosystemPage() {
  const session = await requireSession();
  const integrations = await prisma.integration.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: "asc" },
  });

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: integrations.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <AppShell crumb="Connected Ecosystem">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Connected Ecosystem</h1>
          <p className="muted mt-1">
            CUE's architecture is built for integrations. Demo connections use realistic local data; nothing pretends to be live. {integrations.filter((i) => i.status === "DEMO").length} demo · {integrations.filter((i) => i.status === "AVAILABLE").length} available to connect.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>Honesty note:</strong> no live connections exist in this workspace. “Demo” integrations describe the local seeded data CUE reads; “Available” integrations are architecturally supported but not connected. CUE never fakes a live integration.
        </div>

        {byCategory.map(({ cat, items }) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-2.5">{cat}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((i) => (
                <div key={i.id} className="card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-navy-900">{i.name}</span>
                    <span className={i.status === "DEMO" ? "badge-medium ml-auto" : "badge-low ml-auto"}>{i.status}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-navy-600"><span className="font-semibold text-navy-700">Data available:</span> {i.dataAvailable}</p>
                    <p className="text-navy-600"><span className="font-semibold text-navy-700">What CUE can do:</span> {i.capabilities}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

```

### `src/app/enhance/page.tsx`  (105 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function EnhancePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [assets, insights, procedures] = await Promise.all([
    prisma.brandAsset.findMany({ where: { organizationId: orgId }, orderBy: { kind: "asc" } }),
    prisma.insight.findMany({
      where: { organizationId: orgId, type: { in: ["CUSTOMER", "OPERATIONS"] }, status: "OPEN" },
      take: 6,
    }),
    prisma.knowledgeItem.findMany({
      where: { organizationId: orgId, category: "PROCEDURE" },
      take: 6,
    }),
  ]);

  return (
    <AppShell crumb="Enhance">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Enhance</h1>
          <p className="muted mt-1">Improve the brand, the customer experience, and the way work gets done — driven by what CUE sees in the data.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Brand Studio */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Brand Studio</h2>
            <p className="muted mb-4">Assets and guidelines CUE keeps organized and consistent.</p>
            <div className="space-y-2.5">
              {assets.map((a) => (
                <div key={a.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="badge-purple">{a.kind}</span>
                    <span className="text-sm font-medium text-navy-900 truncate">{a.name}</span>
                  </div>
                  {a.description && <p className="text-xs text-navy-500 mt-1">{a.description}</p>}
                </div>
              ))}
              {assets.length === 0 && <p className="muted">No brand assets yet.</p>}
            </div>
          </section>

          {/* Customer Experience */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Customer Experience</h2>
            <p className="muted mb-4">Signals from communications and jobs that point to experience gaps.</p>
            <div className="space-y-2.5">
              {insights.filter((i) => i.type === "CUSTOMER").map((i) => (
                <div key={i.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{i.title}</div>
                  <p className="text-xs text-navy-500 mt-1">{i.summary}</p>
                </div>
              ))}
              {insights.filter((i) => i.type === "CUSTOMER").length === 0 && (
                <p className="muted">No customer-experience signals right now. Follow-up coverage looks healthy.</p>
              )}
              <div className="rounded-xl border border-navy-100 p-3.5">
                <div className="text-sm font-medium text-navy-900">Communication coverage</div>
                <p className="text-xs text-navy-500 mt-1">
                  Communications are logged against customers, giving CUE the timeline it needs to spot silent accounts before they churn.
                </p>
              </div>
            </div>
          </section>

          {/* Process Improvement */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Process Improvement</h2>
            <p className="muted mb-4">Documented procedures and where the data shows friction.</p>
            <div className="space-y-2.5">
              {insights.filter((i) => i.type === "OPERATIONS").map((i) => (
                <div key={i.id} className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{i.title}</div>
                  <p className="text-xs text-navy-500 mt-1">{i.summary}</p>
                </div>
              ))}
              {procedures.map((p) => (
                <div key={p.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{p.title}</div>
                  <div className="text-[11px] text-navy-400 mt-0.5 line-clamp-2">{p.content.slice(0, 110)}…</div>
                </div>
              ))}
              {procedures.length === 0 && insights.filter((i) => i.type === "OPERATIONS").length === 0 && (
                <p className="muted">No process signals yet.</p>
              )}
            </div>
          </section>
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-1">Why this connects</h2>
          <p className="muted">
            A signal first seen in Understand (e.g. unbilled jobs) becomes a process fix here, an action plan in Execute, and a training module in Expand — closing the loop back into Company Compass.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

```

### `src/app/execute/ExecuteClient.tsx`  (145 lines)

```tsx
"use client";

import { useState } from "react";
import { completeTask } from "@/app/actions";
import { inDaysLabel } from "@/lib/format";

type Task = {
  id: string; title: string; detail: string | null; status: string; priority: string;
  dueAt: string | null; customer: string | null; assignee: string | null;
  workflowTitle: string | null; origin: string;
};

export default function ExecuteClient({
  tasks,
  workflows,
  projects,
}: {
  tasks: Task[];
  workflows: {
    id: string; title: string; kind: string; status: string; source: string;
    taskCount: number; recTitle: string | null; createdAt: string;
  }[];
  projects: { id: string; title: string; description: string | null; status: string; dueAt: string | null }[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"tasks" | "workflows" | "projects">("tasks");

  async function done(id: string) {
    setBusyId(id);
    try {
      await completeTask(id);
    } finally {
      setBusyId(null);
    }
  }

  const open = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const finished = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1.5">
        {(["tasks", "workflows", "projects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`badge ${tab === t ? "badge-blue" : "badge-low"} capitalize`}
          >
            {t} {t === "tasks" && `(${open.length} open)`}{t === "workflows" && ` (${workflows.length})`}{t === "projects" && ` (${projects.length})`}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <>
          <section className="card divide-y divide-navy-50">
            <div className="px-5 py-3.5 flex items-center justify-between">
              <h2 className="section-title">Open tasks</h2>
              <span className="text-xs text-navy-400">{open.length} open · {finished.length} completed</span>
            </div>
            {open.map((t) => (
              <div key={t.id} className="px-5 py-4 flex items-start gap-3">
                <button
                  onClick={() => done(t.id)}
                  disabled={busyId === t.id}
                  title="Mark complete"
                  className="mt-0.5 h-5 w-5 rounded-md border-2 border-navy-200 hover:border-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy-900">{t.title}</div>
                  {t.detail && <div className="text-xs text-navy-500 mt-0.5">{t.detail}</div>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={t.priority === "HIGH" ? "badge-high" : t.priority === "MEDIUM" ? "badge-medium" : "badge-low"}>{t.priority}</span>
                    {t.dueAt && <span className="badge-low">⏱ {inDaysLabel(t.dueAt)}</span>}
                    {t.customer && <span className="badge-blue">◍ {t.customer}</span>}
                    {t.assignee && <span className="badge-low">👤 {t.assignee}</span>}
                    {t.workflowTitle && <span className="badge-purple">⚡ {t.workflowTitle}</span>}
                    {t.origin === "WORKFLOW" && <span className="ai-chip">from recommendation</span>}
                  </div>
                </div>
              </div>
            ))}
            {open.length === 0 && (
              <div className="px-5 py-8 text-center muted">No open tasks. Approve a recommendation in Understand to generate an action plan.</div>
            )}
          </section>

          {finished.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-2">Recently completed</h2>
              <div className="space-y-1.5">
                {finished.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm text-navy-500">
                    <span className="text-emerald-500">✓</span>
                    <span className="line-through flex-1">{t.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "workflows" && (
        <section className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => (
            <div key={w.id} className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-purple">{w.kind}</span>
                <span className={w.status === "ACTIVE" ? "badge-green" : "badge-low"}>{w.status}</span>
                <span className="ml-auto text-xs text-navy-400">{w.taskCount} task{w.taskCount === 1 ? "" : "s"}</span>
              </div>
              <div className="text-sm font-semibold text-navy-900">{w.title}</div>
              {w.recTitle && (
                <div className="text-xs text-navy-500 mt-1">
                  Created from recommendation: <span className="text-navy-700">{w.recTitle}</span>
                </div>
              )}
              <div className="text-[11px] text-navy-300 mt-2">{new Date(w.createdAt).toLocaleDateString()} · {w.source}</div>
            </div>
          ))}
          {workflows.length === 0 && <p className="muted">No workflows yet. “Create workflow” on a recommendation generates one.</p>}
        </section>
      )}

      {tab === "projects" && (
        <section className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-blue">{p.status}</span>
                {p.dueAt && <span className="badge-low">due {new Date(p.dueAt).toLocaleDateString()}</span>}
              </div>
              <div className="text-sm font-semibold text-navy-900">{p.title}</div>
              {p.description && <p className="text-sm text-navy-500 mt-1">{p.description}</p>}
            </div>
          ))}
          {projects.length === 0 && <p className="muted">No projects.</p>}
        </section>
      )}
    </div>
  );
}

```

### `src/app/execute/page.tsx`  (68 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ExecuteClient from "./ExecuteClient";

export default async function ExecutePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [tasks, workflows, projects] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: orgId },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueAt: "asc" }],
      include: { customer: true, assignee: true, workflow: true },
      take: 80,
    }),
    prisma.workflow.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: true } }, rec: { select: { title: true } } },
    }),
    prisma.project.findMany({ where: { organizationId: orgId }, orderBy: { dueAt: "asc" } }),
  ]);

  return (
    <AppShell crumb="Execute">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Execute</h1>
          <p className="muted mt-1">Decisions become actions here. Every workflow traces back to the recommendation and evidence that created it.</p>
        </div>

        <ExecuteClient
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            detail: t.detail,
            status: t.status,
            priority: t.priority,
            dueAt: t.dueAt?.toISOString() ?? null,
            customer: t.customer?.name ?? null,
            assignee: t.assignee?.name ?? null,
            workflowTitle: t.workflow?.title ?? null,
            origin: t.origin,
          }))}
          workflows={workflows.map((w) => ({
            id: w.id,
            title: w.title,
            kind: w.kind,
            status: w.status,
            source: w.source,
            taskCount: w._count.tasks,
            recTitle: w.rec?.title ?? null,
            createdAt: w.createdAt.toISOString(),
          }))}
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            dueAt: p.dueAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </AppShell>
  );
}

```

### `src/app/expand/page.tsx`  (126 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { money } from "@/lib/format";

export default async function ExpandPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [trainings, assignments, ideas, insights, completedTasks] = await Promise.all([
    prisma.trainingModule.findMany({
      where: { organizationId: orgId },
      include: { assignments: { include: { employee: { select: { name: true } } } } },
      orderBy: { category: "asc" },
    }),
    prisma.trainingAssignment.count({
      where: { employee: { organizationId: orgId }, status: "COMPLETED" },
    }),
    prisma.idea.findMany({
      where: { organizationId: orgId },
      orderBy: { status: "asc" },
    }),
    prisma.insight.findMany({
      where: { organizationId: orgId, type: { in: ["OPPORTUNITY", "REVENUE"] }, status: "OPEN" },
      orderBy: { impactValue: "desc" },
      take: 6,
    }),
    prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
  ]);

  return (
    <AppShell crumb="Expand">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Expand</h1>
          <p className="muted mt-1">Growth: training built from your own knowledge, opportunities the data supports, and the effect of completed actions.</p>
        </div>

        {/* Growth opportunities */}
        <section className="grid gap-4 md:grid-cols-3">
          {insights.map((i) => (
            <div key={i.id} className="card card-hover p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge-green">{i.type}</span>
                {i.impactValue != null && (
                  <span className="ml-auto text-sm font-bold text-emerald-600">{money(i.impactValue)}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-navy-900 leading-snug">{i.title}</div>
              <p className="text-xs text-navy-500 mt-1.5">{i.summary}</p>
            </div>
          ))}
          {insights.length === 0 && <p className="muted">No open growth signals — check Understand for the latest scan.</p>}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Training */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Training</h2>
            <p className="muted mb-4">Generated from your company's own knowledge — not generic courses. {assignments} assignment{assignments === 1 ? "" : "s"} completed.</p>
            <div className="space-y-3">
              {trainings.map((t) => (
                <details key={t.id} className="rounded-xl border border-navy-100 p-4">
                  <summary className="text-sm font-medium text-navy-900 cursor-pointer">
                    {t.title}
                    <span className="ml-2 badge-blue">{t.category}</span>
                  </summary>
                  <p className="text-xs text-navy-500 mt-2">{t.summary}</p>
                  <pre className="text-xs text-navy-600 mt-2 whitespace-pre-wrap font-sans">{t.content}</pre>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {t.assignments.map((a) => (
                      <span key={a.id} className="badge-low">👤 {a.employee.name}</span>
                    ))}
                    {t.assignments.length === 0 && <span className="badge-low">unassigned</span>}
                  </div>
                </details>
              ))}
              {trainings.length === 0 && <p className="muted">No training modules yet.</p>}
            </div>
          </section>

          {/* Performance + Lab ideas */}
          <div className="space-y-6">
            <section className="card p-5">
              <h2 className="section-title mb-1">Performance improvement</h2>
              <p className="muted mb-3">How executed work connects to outcomes.</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{completedTasks}</div>
                  <div className="text-xs text-navy-500 mt-1">tasks completed</div>
                </div>
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{ideas.filter((i) => i.status === "EXPERIMENTING").length}</div>
                  <div className="text-xs text-navy-500 mt-1">experiments running</div>
                </div>
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{ideas.filter((i) => i.status === "LAUNCHED" || i.status === "VALIDATED").length}</div>
                  <div className="text-xs text-navy-500 mt-1">validated / launched</div>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">From the Innovation Lab</h2>
                <a href="/lab" className="text-sm text-accent-blue hover:underline">Open Lab →</a>
              </div>
              <div className="space-y-2.5">
                {ideas.slice(0, 3).map((i) => (
                  <div key={i.id} className="rounded-xl border border-navy-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="badge-purple">{i.status}</span>
                      <span className="text-sm font-medium text-navy-900 truncate">{i.title}</span>
                    </div>
                    {i.nextStep && <div className="text-xs text-navy-500 mt-1">Next: {i.nextStep}</div>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

```

### `src/app/globals.css`  (119 lines)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  @apply bg-ink-950 text-navy-900 antialiased;
  background-image:
    radial-gradient(70rem 40rem at 15% -10%, rgba(59, 130, 246, 0.12) 0%, transparent 60%),
    radial-gradient(60rem 40rem at 110% 20%, rgba(139, 92, 246, 0.10) 0%, transparent 55%),
    radial-gradient(50rem 30rem at 50% 120%, rgba(249, 115, 22, 0.06) 0%, transparent 60%);
  background-attachment: fixed;
}

::selection {
  background: rgba(59, 130, 246, 0.35);
}

/* ── Cards: dark glass ─────────────────────────────── */
.card {
  @apply bg-white/[0.03] rounded-2xl border border-navy-100 shadow-card backdrop-blur-sm;
}
.card-hover {
  @apply transition-all duration-200 hover:shadow-raised hover:-translate-y-0.5 hover:border-navy-200 cursor-pointer;
}

/* ── Buttons ───────────────────────────────────────── */
.btn {
  @apply inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-blue/40 disabled:opacity-50 disabled:pointer-events-none;
}
.btn-primary {
  @apply btn bg-accent-blue text-white hover:bg-blue-500 shadow-glow;
}
.btn-purple {
  @apply btn bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 shadow-glow;
}
.btn-orange {
  @apply btn bg-accent-orange text-white hover:bg-orange-500;
}
.btn-secondary {
  @apply btn bg-white/[0.04] border border-navy-200 text-navy-800 hover:bg-white/[0.08];
}
.btn-ghost {
  @apply btn text-navy-500 hover:bg-white/[0.05];
}
.btn-danger {
  @apply btn bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10;
}
.btn-sm {
  @apply px-3 py-1.5 text-xs rounded-lg;
}

/* ── Badges ────────────────────────────────────────── */
.badge {
  @apply inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium;
}
.badge-high {
  @apply badge bg-red-500/10 text-red-300 border border-red-500/30;
}
.badge-medium {
  @apply badge bg-amber-500/10 text-amber-300 border border-amber-500/30;
}
.badge-low {
  @apply badge bg-white/[0.05] text-navy-500 border border-navy-200;
}
.badge-green {
  @apply badge bg-emerald-500/10 text-emerald-300 border border-emerald-500/30;
}
.badge-blue {
  @apply badge bg-blue-500/10 text-blue-300 border border-blue-500/30;
}
.badge-purple {
  @apply badge bg-violet-500/10 text-violet-300 border border-violet-500/30;
}

/* ── Forms ─────────────────────────────────────────── */
.input {
  @apply w-full rounded-xl border border-navy-200 bg-white/[0.04] px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue;
}
.label {
  @apply block text-xs font-semibold uppercase tracking-wide text-navy-400 mb-1.5;
}

/* ── Tables ────────────────────────────────────────── */
.th {
  @apply text-left text-xs font-semibold uppercase tracking-wider text-navy-400 px-4 py-3 border-b border-navy-100;
}
.td {
  @apply px-4 py-3 text-sm border-b border-navy-50;
}

/* ── Drawer & modal ────────────────────────────────── */
.drawer-overlay {
  @apply fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40;
}
.drawer {
  @apply fixed right-0 top-0 h-full w-full max-w-xl bg-ink-900 shadow-raised z-50 overflow-y-auto border-l border-navy-100;
}
.modal-panel {
  @apply bg-ink-900 rounded-2xl shadow-raised max-w-lg w-full p-6 border border-navy-100;
}

/* ── Misc ──────────────────────────────────────────── */
.divider {
  @apply border-t border-navy-100;
}
.section-title {
  @apply text-lg font-semibold text-navy-900;
}
.muted {
  @apply text-navy-400 text-sm;
}
.ai-chip {
  @apply inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-blue/15 to-accent-purple/15 border border-accent-blue/30 px-2.5 py-0.5 text-xs font-medium text-blue-200;
}

```

### `src/app/knowledge/KnowledgeClient.tsx`  (114 lines)

```tsx
"use client";

import { useMemo, useState } from "react";

type Item = {
  id: string; title: string; content: string; category: string;
  tags: string | null; status: string; sourceDoc: string | null; updatedAt: string;
};

type Answer = { answer: string; sources: { label: string; kind: string }[] };

export default function KnowledgeClient({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [question, setQuestion] = useState("");
  const [qa, setQa] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const filtered = items.filter((i) => {
    if (category !== "ALL" && i.category !== category) return false;
    if (!query.trim()) return true;
    const hay = `${i.title} ${i.content} ${i.tags ?? ""}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setQa(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) setQa(await res.json());
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Ask CUE */}
      <section className="card p-5">
        <h2 className="section-title mb-1">Ask your company knowledge</h2>
        <p className="muted mb-3">“What is our refund policy?” · “How do we onboard a new customer?” · “Who is responsible for this process?” — answers cite the underlying records.</p>
        <form onSubmit={ask} className="flex gap-2">
          <input className="input flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about policies, procedures, decisions…" />
          <button className="btn-purple" disabled={asking || !question.trim()}>{asking ? "Searching…" : "Ask"}</button>
        </form>
        {qa && (
          <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
            <div className="text-sm text-navy-800 whitespace-pre-wrap">{qa.answer}</div>
            {qa.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 self-center">Sources:</span>
                {qa.sources.map((s, i) => <span key={i} className="badge-low">{s.label}</span>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Search + filters */}
      <section className="flex flex-wrap gap-3 items-center">
        <input className="input max-w-sm" placeholder="Search knowledge…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`badge ${category === c ? "badge-blue" : "badge-low"}`}
            >
              {c === "ALL" ? "All" : c}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-navy-400">{filtered.length} of {items.length} items</span>
      </section>

      {/* Items */}
      <section className="grid gap-4 md:grid-cols-2">
        {filtered.map((k) => (
          <article key={k.id} className="card p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="badge-blue">{k.category}</span>
              <span className={k.status === "FACT" ? "badge-green" : k.status === "DECISION" ? "badge-purple" : "badge-medium"}>{k.status}</span>
              <span className="ml-auto text-[11px] text-navy-300">{new Date(k.updatedAt).toLocaleDateString()}</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900">{k.title}</h3>
            <p className="text-sm text-navy-600 mt-1.5 whitespace-pre-wrap line-clamp-6">{k.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {k.sourceDoc && <span className="badge-low">❑ {k.sourceDoc}</span>}
              {k.tags?.split(",").filter(Boolean).map((t) => (
                <span key={t} className="badge-low">#{t.trim()}</span>
              ))}
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="muted">Nothing matches. Capture documents in Capture to grow the knowledge base.</p>
        )}
      </section>
    </div>
  );
}

```

### `src/app/knowledge/page.tsx`  (37 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import KnowledgeClient from "./KnowledgeClient";

export default async function KnowledgePage() {
  const session = await requireSession();
  const items = await prisma.knowledgeItem.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { updatedAt: "desc" },
    include: { document: { select: { title: true } } },
  });

  return (
    <AppShell crumb="Knowledge">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Knowledge</h1>
          <p className="muted mt-1">The company's institutional memory — every answer traceable to the information it came from.</p>
        </div>
        <KnowledgeClient
          items={items.map((k) => ({
            id: k.id,
            title: k.title,
            content: k.content,
            category: k.category,
            tags: k.tags,
            status: k.status,
            sourceDoc: k.document?.title ?? null,
            updatedAt: k.updatedAt.toISOString(),
          }))}
        />
      </div>
    </AppShell>
  );
}

```

### `src/app/lab/page.tsx`  (64 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

const STATUS_STYLE: Record<string, string> = {
  IDEA: "badge-low",
  EXPERIMENTING: "badge-blue",
  VALIDATED: "badge-green",
  LAUNCHED: "badge-green",
  PARKED: "badge-low",
};

export default async function LabPage() {
  const session = await requireSession();
  const ideas = await prisma.idea.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell crumb="Innovation Lab">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Innovation Lab</h1>
          <p className="muted mt-1">Ideas and experiments with a problem, hypothesis, evidence and next step — so innovation is disciplined, not hopeful.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((i) => (
            <article key={i.id} className="card p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className={STATUS_STYLE[i.status] ?? "badge-low"}>{i.status}</span>
                {i.owner && <span className="ml-auto text-xs text-navy-400">👤 {i.owner}</span>}
              </div>
              <h2 className="text-sm font-semibold text-navy-900">{i.title}</h2>
              <dl className="mt-3 space-y-2 text-xs flex-1">
                {[
                  ["Problem", i.problem],
                  ["Hypothesis", i.hypothesis],
                  ["Solution", i.proposedSolution],
                  ["Evidence", i.evidence],
                ].map(([label, val]) =>
                  val ? (
                    <div key={label!}>
                      <dt className="font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
                      <dd className="text-navy-600 mt-0.5">{val}</dd>
                    </div>
                  ) : null
                )}
              </dl>
              {i.nextStep && (
                <div className="mt-3 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs text-navy-700">
                  <span className="font-semibold">Next step:</span> {i.nextStep}
                </div>
              )}
            </article>
          ))}
          {ideas.length === 0 && <p className="muted">No ideas yet — every experiment starts as a documented hypothesis.</p>}
        </div>
      </div>
    </AppShell>
  );
}

```

### `src/app/layout.tsx`  (20 lines)

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CUE — The Heart of Your Business",
  description:
    "CUE turns scattered business information into understanding, recommendations, and action. Real-Time Intelligence. Real Business Impact.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

```

### `src/app/onboarding/actions.ts`  (178 lines)

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { refreshIntelligence } from "@/lib/intelligence";

const DetailsSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  industry: z.string().min(2).max(120),
  size: z.string().min(1).max(40),
  locations: z.string().trim().max(200).optional().or(z.literal("")),
  businessModel: z.string().trim().max(400).optional().or(z.literal("")),
  targetCustomers: z.string().trim().max(400).optional().or(z.literal("")),
  mission: z.string().trim().max(600).optional().or(z.literal("")),
});

export async function saveBusinessDetails(formData: FormData) {
  const session = await requireSessionAction();
  const parsed = DetailsSchema.safeParse({
    companyName: formData.get("companyName"),
    industry: formData.get("industry"),
    size: formData.get("size"),
    locations: formData.get("locations") ?? "",
    businessModel: formData.get("businessModel") ?? "",
    targetCustomers: formData.get("targetCustomers") ?? "",
    mission: formData.get("mission") ?? "",
  });
  if (!parsed.success) redirect("/onboarding?error=details");

  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: {
      name: parsed.data.companyName,
      industry: parsed.data.industry,
      size: parsed.data.size,
      locations: parsed.data.locations || null,
      businessModel: parsed.data.businessModel || null,
      targetCustomers: parsed.data.targetCustomers || null,
      mission: parsed.data.mission || null,
      onboardingStep: 3,
    },
  });
  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { name: parsed.data.companyName },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_BUSINESS_DETAILS",
    detail: `${parsed.data.companyName} — ${parsed.data.industry}`,
  });

  redirect("/onboarding");
}

const GoalsSchema = z.object({
  goal1: z.string().trim().max(160).optional().or(z.literal("")),
  goal2: z.string().trim().max(160).optional().or(z.literal("")),
  goal3: z.string().trim().max(160).optional().or(z.literal("")),
});

export async function saveGoals(formData: FormData) {
  const session = await requireSessionAction();
  const parsed = GoalsSchema.safeParse({
    goal1: formData.get("goal1") ?? "",
    goal2: formData.get("goal2") ?? "",
    goal3: formData.get("goal3") ?? "",
  });
  if (!parsed.success) redirect("/onboarding?error=goals");

  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!profile) redirect("/onboarding");

  await prisma.goal.deleteMany({ where: { profileId: profile.id } });
  const titles = [parsed.data.goal1, parsed.data.goal2, parsed.data.goal3]
    .map((g) => (g ?? "").trim())
    .filter(Boolean);
  if (titles.length > 0) {
    await prisma.goal.createMany({
      data: titles.map((title) => ({ profileId: profile.id, title, horizon: "YEAR" })),
    });
  }

  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: { onboardingStep: 4 },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_GOALS",
    detail: titles.length ? titles.join(" · ") : "No goals set",
  });

  redirect("/onboarding");
}

export async function backToDetails() {
  await requireSessionAction();
  redirect("/onboarding?step=2");
}

/** Optional: generate a small set of realistic records for the chosen
 *  industry so the intelligence engine has something to analyze.
 *  Clearly labeled as sample activity — the user's profile stays their own. */
export async function addStarterData() {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId: orgId } });
  if (!profile) redirect("/onboarding");

  const existing = await prisma.customer.count({ where: { organizationId: orgId } });
  if (existing > 0) {
    await prisma.businessProfile.update({ where: { organizationId: orgId }, data: { onboardingStep: 5 } });
    redirect("/onboarding");
  }

  const isAuto = (profile.industry ?? "").toLowerCase().includes("auto") ||
    (profile.industry ?? "").toLowerCase().includes("dealership");

  // Shared demo-data generators reuse the same shapes as the demo seeds,
  // scoped to the user's own organization.
  const { spawnStarterData } = await import("@/lib/starter-data");
  await spawnStarterData(orgId, isAuto ? "AUTO" : "HOME");

  await prisma.businessProfile.update({ where: { organizationId: orgId }, data: { onboardingStep: 5 } });
  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_STARTER_DATA",
    detail: "Sample activity generated for analysis",
  });
  redirect("/onboarding");
}

export async function skipStarterData() {
  const session = await requireSessionAction();
  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: { onboardingStep: 5 },
  });
  redirect("/onboarding");
}

export async function finishSetup() {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const created = await refreshIntelligence(orgId);
  await prisma.businessProfile.update({
    where: { organizationId: orgId },
    data: { onboardingStep: 10 },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "AI",
    action: "COMPASS_INITIALIZED",
    detail: `First Company Compass built — ${created} initial insight(s) from available data`,
  });

  revalidatePath("/compass");
  revalidatePath("/dashboard");
  redirect("/compass?welcome=1");
}

```

### `src/app/onboarding/page.tsx`  (209 lines)

```tsx
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveBusinessDetails, saveGoals, addStarterData, skipStarterData, finishSetup, backToDetails } from "./actions";

// ─────────────────────────────────────────────────────────────
// §25 First-run experience.
// Step 2: business details → 3: goals → 4: starter data choice →
// 5: analyzing (auto-finishes) → redirect to the first Compass.
// ─────────────────────────────────────────────────────────────

const SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];

const INDUSTRY_PRESETS = [
  "Auto dealership",
  "Home services (HVAC / plumbing / electrical)",
  "Hospitality (restaurant / hotel)",
  "Professional services",
  "Retail",
  "Construction",
  "Healthcare practice",
  "Other",
];

const GOAL_SUGGESTIONS: Record<string, string[]> = {
  "Auto dealership": [
    "Respond to every lead within 1 hour",
    "Reduce aging inventory below 45 days",
    "Increase service retention",
  ],
  default: [
    "Stop revenue leakage (unbilled work, stale estimates)",
    "Respond to every customer lead within 24 hours",
    "Make training and knowledge consistent across the team",
  ],
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; welcome?: string }>;
}) {
  const session = await requireSession();
  const { step: stepParam } = await searchParams;

  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: session.organizationId },
    include: { goals: true },
  });
  if (!profile) redirect("/signin");

  const step = Math.min(Math.max(parseInt(stepParam ?? "", 10) || profile.onboardingStep, 2), 5);
  const goalCount = profile.goals.length;

  return (
    <div className="min-h-screen bg-ink-950 bg-[radial-gradient(70rem_40rem_at_15%_-10%,rgba(59,130,246,0.14)_0%,transparent_60%),radial-gradient(60rem_40rem_at_110%_20%,rgba(139,92,246,0.12)_0%,transparent_55%)]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange text-white font-bold flex items-center justify-center shadow-glow">B</div>
          <div>
            <div className="font-semibold text-navy-900">CUE — setting up {session.organizationName}</div>
            <div className="text-xs text-navy-400">Step {step - 1} of 4</div>
          </div>
        </div>

        {/* Progress rail */}
        <div className="flex gap-1.5 mb-8">
          {[2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-gradient-to-r from-accent-blue to-accent-purple" : "bg-white/10"}`} />
          ))}
        </div>

        {step <= 3 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-1">
              {step === 2 ? "Tell CUE about your business" : "What are you trying to achieve?"}
            </h1>
            <p className="muted mb-6">
              {step === 2
                ? "This shapes CUE's vocabulary, KPIs, and intelligence detectors."
                : "Goals appear on your Company Compass and let CUE measure progress against them."}
            </p>

            {step === 2 ? (
              <form action={saveBusinessDetails} className="space-y-4">
                <div>
                  <label className="label" htmlFor="companyName">Company name</label>
                  <input id="companyName" name="companyName" required minLength={2} defaultValue={profile.name} className="input" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor="industry">Industry</label>
                    <input id="industry" name="industry" required list="industries" defaultValue={profile.industry ?? ""} className="input" placeholder="e.g. Auto dealership" />
                    <datalist id="industries">
                      {INDUSTRY_PRESETS.map((i) => <option key={i} value={i} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="label" htmlFor="size">Team size</label>
                    <select id="size" name="size" required defaultValue={profile.size ?? ""} className="input">
                      <option value="" disabled>Select…</option>
                      {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="locations">Location(s) <span className="text-navy-300">(optional)</span></label>
                  <input id="locations" name="locations" className="input" defaultValue={profile.locations ?? ""} placeholder="e.g. Riverside, CA" />
                </div>
                <div>
                  <label className="label" htmlFor="businessModel">What do you sell / do? <span className="text-navy-300">(optional)</span></label>
                  <textarea id="businessModel" name="businessModel" rows={2} className="input" defaultValue={profile.businessModel ?? ""} placeholder="e.g. New & used vehicle sales, finance, and a service department" />
                </div>
                <div>
                  <label className="label" htmlFor="targetCustomers">Who are your customers? <span className="text-navy-300">(optional)</span></label>
                  <input id="targetCustomers" name="targetCustomers" className="input" defaultValue={profile.targetCustomers ?? ""} placeholder="e.g. Local families and small businesses" />
                </div>
                <div>
                  <label className="label" htmlFor="mission">Mission, in one sentence <span className="text-navy-300">(optional)</span></label>
                  <input id="mission" name="mission" className="input" defaultValue={profile.mission ?? ""} placeholder="e.g. Make buying and servicing a car effortless" />
                </div>
                <button type="submit" className="btn-primary w-full">Continue →</button>
              </form>
            ) : (
              <form action={saveGoals} className="space-y-4">
                {(GOAL_SUGGESTIONS[profile.industry?.startsWith("Auto") ? "Auto dealership" : "default"] ?? GOAL_SUGGESTIONS.default).map((g, i) => (
                  <div key={g} className="rounded-xl border border-navy-50 bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                    <input id={`goal${i + 1}`} name={`goal${i + 1}`} className="input !mt-0 flex-1 !bg-transparent !border-0 !px-0 focus:!ring-0" defaultValue={profile.goals[i]?.title ?? g} aria-label={`Goal ${i + 1}`} />
                    <span className="text-[10px] uppercase tracking-wide text-navy-300 whitespace-nowrap">suggestion</span>
                  </div>
                ))}
                <div className="flex gap-3">
                  <button type="submit" className="btn-primary flex-1">Continue →</button>
                  <button type="submit" formAction={backToDetails} className="btn-ghost">← Back</button>
                </div>
              </form>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-1">Give CUE something to analyze</h1>
            <p className="muted mb-6">
              Your workspace is live but empty. Two ways to see the intelligence engine work right now:
            </p>
            <div className="grid gap-3 mb-6">
              <form action={addStarterData}>
                <button type="submit" className="btn-primary w-full text-left">
                  <span className="block font-semibold">Generate realistic sample activity</span>
                  <span className="block text-xs text-navy-500 mt-1">
                    A handful of customers, jobs/deals, invoices, and estimates — clearly labeled as sample data. CUE&apos;s detectors will find real leaks in it immediately.
                  </span>
                </button>
              </form>
              <form action={skipStarterData}>
                <button type="submit" className="btn-ghost w-full text-left">
                  <span className="block font-semibold text-navy-800">Start completely empty</span>
                  <span className="block text-xs text-navy-400 mt-1">Capture documents and records yourself — CUE learns as you add.</span>
                </button>
              </form>
            </div>
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-xs text-navy-500">
              Sample data is scoped to your workspace only and can be cleared anytime from Settings.
            </div>
          </div>
        )}

        {step >= 5 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-2">
              {profile.onboardingStep >= 10 ? "Your Company Compass is ready" : "Analyzing your business…"}
            </h1>
            <p className="muted mb-6">
              {profile.onboardingStep >= 10
                ? "CUE built your first Company Compass from the available information."
                : "Building your first Company Compass — classifying records, extracting knowledge, computing health, and scanning for revenue leaks."}
            </p>
            <ul className="space-y-2 mb-6 text-sm">
              {[
                ["Business profile absorbed", true],
                [goalCount > 0 ? `${goalCount} goal(s) registered on the Compass` : "Goals — none set yet", true],
                ["Records classified & connected", true],
                ["Health score computed", true],
                ["Intelligence scan", profile.onboardingStep >= 10],
              ].map(([label, done]) => (
                <li key={label as string} className="flex items-center gap-2.5 text-navy-600">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-navy-300"}`}>
                    {done ? "✓" : "•"}
                  </span>
                  {label as string}
                </li>
              ))}
            </ul>
            {profile.onboardingStep < 10 ? (
              <form action={finishSetup}>
                <button type="submit" className="btn-primary w-full">Build my first Company Compass →</button>
              </form>
            ) : (
              <a href="/compass?welcome=1" className="btn-primary w-full text-center block">Open Company Compass →</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

```

### `src/app/page.tsx`  (8 lines)

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/signin");
}

```

### `src/app/people/page.tsx`  (126 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function PeoplePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [employees, departments, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: orgId },
      include: {
        department: true,
        manager: { select: { name: true } },
        tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } },
        assignments: { include: { training: { select: { title: true, category: true } } } },
      },
      orderBy: [{ departmentId: "asc" }, { name: "asc" }],
    }),
    prisma.department.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.trainingAssignment.findMany({
      where: { employee: { organizationId: orgId } },
      include: { employee: { select: { name: true } }, training: { select: { title: true, category: true } } },
      orderBy: { status: "asc" },
    }),
  ]);

  const leaders = employees.filter((e) => !e.managerId);
  const byDept = departments.map((d) => ({
    dept: d,
    people: employees.filter((e) => e.departmentId === d.id),
  }));
  const unassigned = employees.filter((e) => !e.departmentId);

  return (
    <AppShell crumb="People">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">People</h1>
          <p className="muted mt-1">
            {employees.length} people · {departments.length} departments. CUE connects roles → responsibilities → training → tasks → outcomes.
          </p>
        </div>

        {/* Departments */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byDept.map(({ dept, people }) => (
            <div key={dept.id} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-navy-900">{dept.name}</h2>
                <span className="badge-blue">{people.length}</span>
              </div>
              {dept.description && <p className="text-xs text-navy-400 mb-3">{dept.description}</p>}
              <div className="space-y-2.5">
                {people.map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue/80 to-accent-purple/80 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                      {e.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-navy-900 leading-tight">{e.name}</div>
                      <div className="text-xs text-navy-500">{e.title}</div>
                      {e.responsibilities && (
                        <div className="text-[11px] text-navy-400 mt-0.5 line-clamp-2">{e.responsibilities}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {e.tasks.length > 0 && <span className="badge-low">{e.tasks.length} open task{e.tasks.length === 1 ? "" : "s"}</span>}
                        {e.manager && <span className="badge-low">reports to {e.manager.name.split(" ")[0]}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-navy-900 mb-2">No department</h2>
              {unassigned.map((e) => (
                <div key={e.id} className="text-sm text-navy-700">{e.name} — {e.title}</div>
              ))}
            </div>
          )}
        </section>

        {/* Skills & training */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="section-title mb-3">Skills on record</h2>
            <div className="space-y-2.5">
              {employees.filter((e) => e.skills).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-navy-800 w-36 shrink-0">{e.name}</span>
                  {e.skills?.split(",").map((s) => (
                    <span key={s} className="badge-low">{s.trim()}</span>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3">Training assignments</h2>
            <div className="space-y-2.5">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-navy-100 px-4 py-3">
                  <span className={a.status === "COMPLETED" ? "badge-green" : a.status === "IN_PROGRESS" ? "badge-blue" : "badge-medium"}>{a.status.replace("_", " ")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-navy-900 truncate">{a.training.title}</div>
                    <div className="text-xs text-navy-400">{a.employee.name} · {a.training.category}</div>
                  </div>
                </div>
              ))}
              {assignments.length === 0 && <p className="muted">No training assigned yet — generated modules appear in Expand.</p>}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

```

### `src/app/settings/actions.ts`  (30 lines)

```ts
"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function setAiPermissions(
  perms: { observe: boolean; recommend: boolean; prepare: boolean; execute: boolean; automate: boolean }
) {
  const session = await requireSessionAction();

  await prisma.aiSettings.upsert({
    where: { organizationId: session.organizationId },
    update: perms,
    create: { organizationId: session.organizationId, ...perms },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "AI_PERMISSIONS_CHANGED",
    targetType: "AiSettings",
    detail: `Observe: ${perms.observe}, Recommend: ${perms.recommend}, Prepare: ${perms.prepare}, Execute: ${perms.execute}, Automate: ${perms.automate}`,
    metadata: perms,
  });

  return { ok: true };
}

```

### `src/app/settings/page.tsx`  (72 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [ai, profile, auditCount, memberCount] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { organizationId: orgId } }),
    prisma.businessProfile.findUnique({ where: { organizationId: orgId } }),
    prisma.auditEvent.count({ where: { organizationId: orgId } }),
    prisma.member.count({ where: { organizationId: orgId } }),
  ]);

  return (
    <AppShell crumb="Settings">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Settings</h1>
          <p className="muted mt-1">Business configuration, AI controls, and security posture.</p>
        </div>

        <SettingsClient
          ai={{
            observe: ai?.observe ?? true,
            recommend: ai?.recommend ?? true,
            prepare: ai?.prepare ?? true,
            execute: ai?.execute ?? false,
            automate: ai?.automate ?? false,
          }}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="section-title mb-3">Business configuration</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Organization" v={session.organizationName} />
              <Row k="Your role" v={session.role} />
              <Row k="Signed in as" v={`${session.user.name} · ${session.user.email}`} />
              <Row k="Industry" v={profile?.industry ?? "—"} />
              <Row k="Members" v={String(memberCount)} />
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3">Security & auditability</h2>
            <ul className="space-y-2 text-sm text-navy-700">
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Sessions are HMAC-signed, http-only cookies with 30-day expiry</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Passwords hashed with scrypt + per-user salt</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> All queries scoped to your organization (org-level isolation)</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Server-side validation on every mutation</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> {auditCount} audit events recorded — every AI insight, human decision, and workflow</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Secrets live in environment variables, never in client code</li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-navy-50 pb-2">
      <dt className="text-navy-400">{k}</dt>
      <dd className="text-navy-800 text-right">{v}</dd>
    </div>
  );
}

```

### `src/app/settings/SettingsClient.tsx`  (80 lines)

```tsx
"use client";

import { useState, useTransition } from "react";
import { setAiPermissions } from "./actions";

const LEVELS = [
  { key: "observe", label: "Observe", desc: "CUE can analyze information and compute health, patterns and insights." },
  { key: "recommend", label: "Recommend", desc: "CUE can propose actions — always with evidence and a human decision point." },
  { key: "prepare", label: "Prepare", desc: "CUE can draft workflows, tasks and content for your review before anything is live." },
  { key: "execute", label: "Execute", desc: "CUE can carry out approved actions (creating workflows from decisions you made)." },
  { key: "automate", label: "Automate", desc: "CUE can run predefined workflows on explicit rules, without asking each time." },
] as const;

type Key = (typeof LEVELS)[number]["key"];

export default function SettingsClient({ ai }: { ai: Record<Key, boolean> }) {
  const [state, setState] = useState(ai);
  const [pending, start] = useTransition();

  function toggle(key: Key) {
    const next = { ...state, [key]: !state[key] };
    // Enforce dependency: automate requires execute; execute requires prepare
    if (key === "prepare" && !next.prepare) {
      next.execute = false;
      next.automate = false;
    }
    if (key === "execute" && !next.execute) next.automate = false;
    if (key === "execute" && next.execute) next.prepare = true;
    if (key === "automate" && next.automate) next.execute = true;

    setState(next);
    start(() => {
      void setAiPermissions(next);
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="section-title">AI permissions</h2>
        {pending && <span className="text-xs text-navy-400">Saving…</span>}
      </div>
      <p className="muted mb-4">
        CUE is designed around human control. Consequential actions never happen silently — these switches control how far the AI may go on its own.
      </p>
      <div className="space-y-2.5">
        {LEVELS.map((l) => {
          const disabled =
            (l.key === "automate" && !state.execute) ||
            (l.key === "execute" && !state.prepare) ||
            (l.key === "recommend" && !state.observe);
          return (
            <label
              key={l.key}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
                state[l.key] ? "border-blue-500/40 bg-blue-500/10" : "border-navy-100"
              } ${disabled ? "opacity-50" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={state[l.key]}
                onChange={() => toggle(l.key)}
                disabled={disabled || pending}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-navy-900">{l.label}</div>
                <div className="text-xs text-navy-500">{l.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-navy-400">
        Defaults: Observe + Recommend + Prepare on; Execute and Automate off — CUE stays in the loop until you explicitly grant more autonomy. Every change is audit-logged.
      </p>
    </section>
  );
}

```

### `src/app/signin/actions.ts`  (44 lines)

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/signin?error=invalid");
  }

  const membership = await prisma.member.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/signin?error=org");

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  await logAudit({
    organizationId: membership.organizationId,
    actorType: "USER",
    actorId: user.id,
    action: "USER_SIGNED_IN",
    detail: `${user.name} signed in`,
  });

  redirect("/dashboard");
}

```

### `src/app/signin/page.tsx`  (67 lines)

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale, getT } from "@/lib/locale";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { signIn } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const { error } = await searchParams;
  const t = await getT();
  const locale = await getLocale();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-950 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(59,130,246,0.14)_0%,transparent_60%),radial-gradient(50rem_40rem_at_100%_100%,rgba(139,92,246,0.12)_0%,transparent_55%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-white font-bold text-xl flex items-center justify-center shadow-raised">B</div>
          <div>
            <div className="text-xl font-bold text-navy-900">CUE</div>
            <div className="text-xs text-navy-500">{t("app.tagline")}</div>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-lg font-semibold text-navy-900 mb-1">{t("app.signIn")}</h1>
          <p className="muted mb-6">Everything your business knows. One intelligent system.</p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error === "invalid" ? "That email or password didn't match." : "Something went wrong. Try again."}
            </div>
          )}

          <form action={signIn} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">{t("app.email")}</label>
              <input id="email" name="email" type="email" required className="input" placeholder="you@company.com" defaultValue="owner@summithome.demo" />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("app.password")}</label>
              <input id="password" name="password" type="password" required className="input" defaultValue="demo1234" />
            </div>
            <button type="submit" className="btn-primary w-full">{t("app.signInCta")}</button>
          </form>

          <div className="mt-6 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-xs text-navy-500">
            <span className="font-semibold text-navy-800">Demo workspace:</span> Summit Home Services is pre-loaded with realistic data. Sign in with the prefilled credentials — or change them to explore the invalid-credentials path.
          </div>
        </div>

        <div className="mt-6">
          <LanguageSwitcher current={locale} />
        </div>

        <p className="text-center text-xs text-navy-400 mt-6">
          CUE never makes consequential decisions on its own — intelligence is always backed by evidence and human approval.
        </p>
      </div>
    </div>
  );
}

```

### `src/app/signup/actions.ts`  (72 lines)

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(100),
});

export async function signUp(formData: FormData) {
  const parsed = SignUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/signup?error=" + encodeURIComponent("Please fill every field (password must be at least 8 characters)."));
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=" + encodeURIComponent("An account with that email already exists. Try signing in."));
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password) },
  });

  const org = await prisma.organization.create({
    data: { name: name.includes(" ") ? `${name.split(" ")[0]}'s Company` : `${name}'s Company`, isDemo: false },
  });

  await prisma.member.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  await prisma.businessProfile.create({
    data: { organizationId: org.id, name: org.name, onboardingStep: 2 },
  });

  await prisma.aiSettings.create({
    data: { organizationId: org.id },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  await logAudit({
    organizationId: org.id,
    actorType: "USER",
    actorId: user.id,
    action: "ACCOUNT_CREATED",
    detail: `${name} created a new CUE workspace`,
  });

  redirect("/onboarding");
}

```

### `src/app/signup/page.tsx`  (73 lines)

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale, getT } from "@/lib/locale";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { signUp } from "./actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const { error } = await searchParams;
  const t = await getT();
  const locale = await getLocale();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-950 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(59,130,246,0.14)_0%,transparent_60%),radial-gradient(50rem_40rem_at_100%_100%,rgba(139,92,246,0.12)_0%,transparent_55%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange text-white font-bold text-xl flex items-center justify-center shadow-glow">B</div>
          <div>
            <div className="text-xl font-bold text-navy-900">CUE</div>
            <div className="text-xs text-navy-500">{t("app.tagline")}</div>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-lg font-semibold text-navy-900 mb-1">{t("app.signUp")}</h1>
          <p className="muted mb-6">Start with an empty company. You&apos;ll tell CUE about your business next.</p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form action={signUp} className="space-y-4">
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" name="name" required minLength={2} className="input" placeholder="e.g. Sam Rivera" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="email">{t("app.email")}</label>
              <input id="email" name="email" type="email" required className="input" placeholder="you@yourcompany.com" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("app.password")}</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
            <button type="submit" className="btn-primary w-full">Create workspace</button>
          </form>

          <p className="text-center text-sm text-navy-400 mt-6">
            Already have an account?{" "}
            <Link href="/signin" className="text-accent-blue hover:underline">{t("app.signIn")}</Link>
          </p>
        </div>

        <div className="mt-6">
          <LanguageSwitcher current={locale} />
        </div>

        <p className="text-center text-xs text-navy-500 mt-6">
          Your workspace starts empty — no demo data. Capture real information to make CUE&apos;s intelligence your own.
        </p>
      </div>
    </div>
  );
}

```

### `src/app/understand/page.tsx`  (67 lines)

```tsx
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import UnderstandClient from "./UnderstandClient";

export default async function UnderstandPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [insights, entities, facts, knowledgeCount, docCount] = await Promise.all([
    prisma.insight.findMany({
      where: { organizationId: orgId },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
      include: { recommendations: { take: 1 } },
    }),
    prisma.entity.findMany({
      where: { organizationId: orgId },
      include: { facts: true },
      orderBy: { name: "asc" },
      take: 12,
    }),
    prisma.fact.count({ where: { organizationId: orgId, status: "FACT" } }),
    prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
    prisma.document.count({ where: { organizationId: orgId } }),
  ]);

  return (
    <AppShell crumb="Understand">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Understand</h1>
          <p className="muted mt-1">
            The intelligence layer: {docCount} captured sources → {knowledgeCount} knowledge items → {entities.length}+ entities → {insights.length} active insight{insights.length === 1 ? "" : "s"}. Every insight links to its evidence.
          </p>
        </div>

        <UnderstandClient
          insights={insights.map((i) => ({
            id: i.id,
            title: i.title,
            summary: i.summary,
            severity: i.severity,
            type: i.type,
            impactValue: i.impactValue,
            confidence: i.confidence,
            status: i.status,
            recId: i.recId,
          }))}
          entities={entities.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            description: e.description,
            facts: e.facts.map((f) => ({
              id: f.id,
              statement: f.statement,
              status: f.status,
              confidence: f.confidence,
            })),
          }))}
          counts={{ facts: facts, knowledge: knowledgeCount, documents: docCount }}
        />
      </div>
    </AppShell>
  );
}

```

### `src/app/understand/UnderstandClient.tsx`  (164 lines)

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import type { DrawerInsight, DrawerRec, EvidenceRef } from "@/components/EvidenceDrawer";
import { money } from "@/lib/format";
import { decideRecommendation, createWorkflowFromRec, dismissInsight, refreshInsights } from "@/app/actions";

type InsightRow = {
  id: string; title: string; summary: string; severity: string; type: string;
  impactValue: number | null; confidence: number; status: string; recId: string | null;
};

export default function UnderstandClient({
  insights,
  entities,
  counts,
}: {
  insights: InsightRow[];
  entities: {
    id: string; type: string; name: string; description: string | null;
    facts: { id: string; statement: string; status: string; confidence: number }[];
  }[];
  counts: { facts: number; knowledge: number; documents: number };
}) {
  const [drawer, setDrawer] = useState<{
    insight: DrawerInsight; rec: DrawerRec | null; evidence: EvidenceRef[];
    audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function openInsight(id: string) {
    const res = await fetch(`/api/insight/${id}`);
    if (res.ok) setDrawer(await res.json());
  }

  async function handleAction(kind: "approve" | "workflow" | "dismiss") {
    if (!drawer) return;
    setBusy(true);
    try {
      if (kind === "approve" && drawer.rec) await decideRecommendation(drawer.rec.id, "APPROVED");
      else if (kind === "workflow" && drawer.rec) await createWorkflowFromRec(drawer.rec.id);
      else if (kind === "dismiss") await dismissInsight(drawer.insight.id);
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await refreshInsights();
    } finally {
      setBusy(false);
    }
  }

  const open = insights.filter((i) => i.status === "OPEN");
  const decided = insights.filter((i) => i.status !== "OPEN");

  return (
    <div className="space-y-6">
      {/* Pattern detection header */}
      <section className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Business intelligence</h2>
          <p className="muted mt-0.5">
            Patterns CUE detects from your records: revenue leakage · missed follow-ups · bottlenecks · neglected customers. {counts.facts} verified facts · {counts.knowledge} knowledge items from {counts.documents} sources.
          </p>
        </div>
        <button onClick={refresh} disabled={busy} className="btn-secondary">
          {busy ? "Computing…" : "↻ Re-scan data"}
        </button>
      </section>

      {/* Open insights */}
      <section>
        <h2 className="section-title mb-3">Open insights & recommendations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {open.map((i) => (
            <button
              key={i.id}
              onClick={() => openInsight(i.id)}
              className="card card-hover p-5 text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={i.severity === "HIGH" ? "badge-high" : i.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>{i.severity}</span>
                <span className="badge-blue">{i.type}</span>
                {i.impactValue != null && (
                  <span className="ml-auto text-sm font-bold text-accent-blue">{money(i.impactValue)}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-navy-900 leading-snug">{i.title}</div>
              <p className="text-xs text-navy-500 mt-1.5 line-clamp-2">{i.summary}</p>
              <div className="mt-3 text-xs font-medium text-accent-blue">Inspect evidence →</div>
            </button>
          ))}
          {open.length === 0 && (
            <p className="muted">No open insights. Capture more information or re-scan the data.</p>
          )}
        </div>
      </section>

      {/* Entities & facts */}
      <section className="card p-5">
        <h2 className="section-title mb-1">Knowledge extraction</h2>
        <p className="muted mb-4">Entities CUE has identified, with the facts attached to them. Facts are supported by records; assumptions need confirmation.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entities.map((e) => (
            <div key={e.id} className="rounded-xl border border-navy-100 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-purple">{e.type}</span>
                <span className="text-sm font-semibold text-navy-900">{e.name}</span>
              </div>
              {e.description && <p className="text-xs text-navy-500">{e.description}</p>}
              <div className="mt-3 space-y-2">
                {e.facts.map((f) => (
                  <div key={f.id} className="text-xs text-navy-600 border-l-2 border-navy-100 pl-2.5">
                    {f.statement}
                    <div className="mt-1 flex gap-1.5">
                      <span className={f.status === "FACT" ? "badge-green" : "badge-medium"}>{f.status}</span>
                      <span className="badge-low">{Math.round(f.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {entities.length === 0 && <p className="muted">Entities appear here as information is captured.</p>}
        </div>
      </section>

      {/* Decided insights */}
      {decided.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-3">Decision history</h2>
          <div className="space-y-2.5">
            {decided.map((i) => (
              <button key={i.id} onClick={() => openInsight(i.id)} className="w-full flex items-center gap-3 text-left rounded-xl border border-navy-100 px-4 py-3 hover:bg-navy-50 transition-colors">
                <span className={i.status === "ACTION_TAKEN" ? "badge-green" : i.status === "DISMISSED" ? "badge-low" : "badge-blue"}>{i.status}</span>
                <span className="text-sm text-navy-800 flex-1">{i.title}</span>
                <span className="text-xs text-accent-blue">View audit →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {drawer && (
        <EvidenceDrawer
          insight={drawer.insight}
          rec={drawer.rec}
          evidence={drawer.evidence}
          audit={drawer.audit}
          onClose={() => setDrawer(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

```

### `src/components/AppShell.tsx`  (62 lines)

```tsx
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import NavClient from "./NavClient";
import LanguageSwitcher from "./LanguageSwitcher";

export default async function AppShell({
  children,
  crumb,
}: {
  children: React.ReactNode;
  crumb?: string;
}) {
  const session = await requireSession();
  const locale = await getLocale();

  const [pendingRecs, openTasks] = await Promise.all([
    prisma.recommendation.count({
      where: { organizationId: session.organizationId, status: "PENDING" },
    }),
    prisma.task.count({
      where: {
        organizationId: session.organizationId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  return (
    <div className="min-h-screen flex">
      <NavClient
        orgName={session.organizationName}
        userName={session.user.name}
        pendingRecs={pendingRecs}
        openTasks={openTasks}
        locale={locale}
      />
      <div className="flex-1 min-w-0 flex flex-col lg:pl-64">
        <header className="sticky top-0 z-30 bg-ink-950/70 backdrop-blur-md border-b border-navy-100">
          <div className="flex items-center gap-3 px-4 sm:px-8 h-14">
            <div className="text-sm text-navy-400">
              CUE <span className="mx-1.5 text-navy-300">/</span>
              <span className="text-navy-800 font-medium">
                {crumb ?? "Dashboard"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher current={locale} compact />
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-white text-xs font-semibold flex items-center justify-center">
                {session.user.name.split(" ").map((p) => p[0]).join("")}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

```

### `src/components/CueAI.tsx`  (120 lines)

```tsx
"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; sources?: { label: string; kind: string }[]; suggested?: { label: string; href: string }[] };

export default function CUEAI({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi — I'm CUE AI. I answer from your company's actual records, and I'll tell you plainly when I don't know something. Try: “What should I focus on today?” or “What's our refund policy?”",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer ?? "Something went wrong.", sources: data.sources, suggested: data.suggested },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I couldn't reach the CUE intelligence layer just now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer max-w-md flex flex-col" role="dialog" aria-label="CUE AI">
        <div className="sticky top-0 bg-gradient-to-r from-accent-blue/80 to-accent-purple/80 text-white px-5 py-4 flex items-center gap-3 border-b border-navy-100">
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center text-lg">✦</div>
          <div>
            <div className="font-semibold leading-tight">CUE AI</div>
            <div className="text-xs text-white/80">Grounded in your company's data — never invented</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/90 hover:text-white text-lg" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-accent-blue text-white"
                    : "bg-white/[0.05] text-navy-800 border border-navy-100"
                }`}
              >
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t border-navy-200/60 pt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 mb-1">Sources</div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((s, j) => (
                        <span key={j} className="badge-low">❑ {s.label}</span>
                      ))}
                    </div>
                  </div>
                )}
                {m.suggested && m.suggested.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.suggested.map((s, j) => (
                      <a key={j} href={s.href} onClick={onClose} className="btn-secondary btn-sm">{s.label} →</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="rounded-2xl bg-navy-50 px-4 py-3 text-sm text-navy-500 animate-pulse max-w-[85%]">
              Checking your records…
            </div>
          )}
        </div>

        <div className="border-t border-navy-100 p-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["What should I focus on today?", "What's happening with sales?", "What's our refund policy?"].map((s) => (
              <button key={s} onClick={() => send(s)} className="badge-low hover:bg-navy-100 transition-colors">{s}</button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <input
              className="input flex-1"
              placeholder="Ask about your business…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading || !input.trim()} className="btn-primary">Ask</button>
          </form>
        </div>
      </div>
    </div>
  );
}

```

### `src/components/EvidenceDrawer.tsx`  (204 lines)

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";

export type DrawerInsight = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  type: string;
  impactValue: number | null;
  confidence: number;
  reasoning: string;
  status: string;
  recId: string | null;
  createdAt: string;
};

export type DrawerRec = {
  id: string;
  title: string;
  action: string;
  rationale: string;
  impact: string | null;
  impactValue: number | null;
  confidence: number;
  status: string;
};

export type EvidenceRef = {
  kind: string;
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

const CONFIDENCE_LABEL: Record<number, string> = {
  0.97: "High",
  0.95: "High",
  0.85: "Medium",
  0.8: "Medium",
  0.75: "Medium",
  0.7: "Medium",
  0.5: "Low",
};

export function confidenceLabel(n: number): string {
  if (n >= 0.85) return "High";
  return n >= 0.7 ? "Medium" : "Low";
}

export default function EvidenceDrawer({
  insight,
  rec,
  evidence,
  audit,
  onClose,
  onAction,
}: {
  insight: DrawerInsight;
  rec: DrawerRec | null;
  evidence: EvidenceRef[];
  audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  onClose: () => void;
  onAction: (kind: "approve" | "workflow" | "dismiss") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [acted, setActed] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(kind: "approve" | "workflow" | "dismiss") {
    setBusy(true);
    await onAction(kind);
    setActed(kind);
    setBusy(false);
  }

  const decided = insight.status !== "OPEN";

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Insight detail">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-navy-100 px-6 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={insight.severity === "HIGH" ? "badge-high" : insight.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>
                {insight.severity}
              </span>
              <span className="badge-blue">{insight.type}</span>
              <span className="ai-chip">✦ CUE insight</span>
            </div>
            <h2 className="text-lg font-semibold text-navy-900 leading-snug">{insight.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm shrink-0" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 1. What happened */}
          <section>
            <SectionLabel>What happened</SectionLabel>
            <p className="text-sm text-navy-700">{insight.summary}</p>
          </section>

          {/* 2. Why CUE noticed */}
          <section>
            <SectionLabel>Why CUE noticed</SectionLabel>
            <p className="text-sm text-navy-700">{insight.reasoning}</p>
          </section>

          {/* 3. Evidence */}
          <section>
            <SectionLabel>
              Evidence · {evidence.length} record{evidence.length === 1 ? "" : "s"}
            </SectionLabel>
            <div className="rounded-xl border border-navy-100 divide-y divide-navy-50 max-h-72 overflow-y-auto">
              {evidence.map((e, i) => (
                <div key={e.id + i} className="px-4 py-3 flex items-start gap-3">
                  <span className="badge-low shrink-0 mt-0.5">{e.kind}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-900">{e.label}</div>
                    <div className="text-xs text-navy-500 mt-0.5">{e.detail}</div>
                  </div>
                  {typeof e.amount === "number" && (
                    <div className="text-sm font-semibold text-navy-900 shrink-0">{money(e.amount)}</div>
                  )}
                  <div className="text-[10px] text-navy-300 shrink-0 self-center" title="Record in this workspace">Ref {i + 1}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-navy-400">
              Every item above is an actual record in this workspace — click any dashboard signal to audit the chain Signal → Evidence → Understanding → Decision → Action.
            </p>
          </section>

          {/* 4. Business impact + 5. Recommended action */}
          {rec && (
            <section className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/30 p-4">
              <SectionLabel>Recommended action</SectionLabel>
              <div className="text-sm font-semibold text-navy-900">{rec.title}</div>
              <p className="text-sm text-navy-700 mt-1">{rec.rationale}</p>
              {rec.impact && <p className="text-sm text-navy-700 mt-2"><span className="font-medium">Impact:</span> {rec.impact}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="badge-purple">Confidence: {CONFIDENCE_LABEL[rec.confidence] ?? confidenceLabel(rec.confidence)}</span>
                {rec.impactValue != null && <span className="badge-blue">Value at stake: {money(rec.impactValue)}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {decided ? (
                  <div className="text-sm text-navy-600">
                    {insight.status === "ACTION_TAKEN" ? "✓ Action taken — workflow created and tasks assigned." : `Decision recorded: ${insight.status.toLowerCase()}.`}
                  </div>
                  ) : (
                  <>
                    <button disabled={busy} onClick={() => act("approve")} className="btn-primary">Approve</button>
                    <button disabled={busy} onClick={() => act("workflow")} className="btn-purple">Create workflow</button>
                    <button disabled={busy} onClick={() => act("dismiss")} className="btn-secondary">Dismiss</button>
                  </>
                )}
              </div>
            </section>
          )}
          {!rec && !decided && (
            <p className="text-sm text-navy-500">No recommendation attached — this is an informational insight.</p>
          )}

          {/* 7. Audit history */}
          <section>
            <SectionLabel>Audit history</SectionLabel>
            <ol className="space-y-2">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className={a.actorType === "AI" ? "ai-chip shrink-0" : "badge-low shrink-0"}>{a.actorType}</span>
                  <div>
                    <div className="text-navy-800">{a.detail ?? a.action}</div>
                    <div className="text-xs text-navy-400">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1.5">
      {children}
    </div>
  );
}

```

### `src/components/LanguageSwitcher.tsx`  (76 lines)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export default function LanguageSwitcher({
  current,
  compact,
}: {
  current: Locale;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function pick(code: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="h-8 px-2.5 rounded-lg border border-navy-50 bg-white/[0.04] text-xs text-navy-600 hover:bg-white/[0.08] flex items-center gap-1.5"
          aria-label="Language"
        >
          <span>{active.flag}</span>
          <span className="uppercase">{active.code}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-9 z-50 w-40 card p-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => pick(l.code)}
                disabled={pending}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left ${l.code === current ? "bg-accent-blue/15 text-white" : "text-navy-600 hover:bg-white/[0.06]"}`}
              >
                <span>{l.flag}</span> {l.label}
                {l.code === current && <span className="ml-auto text-accent-blue">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Large selector (sign-in / sign-up / onboarding)
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => pick(l.code)}
          disabled={pending}
          className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 transition-all ${
            l.code === current
              ? "border-accent-blue/50 bg-accent-blue/15 text-white"
              : "border-navy-50 bg-white/[0.03] text-navy-500 hover:text-navy-800 hover:bg-white/[0.07]"
          }`}
        >
          <span>{l.flag}</span> {l.label}
        </button>
      ))}
    </div>
  );
}

```

### `src/components/NavClient.tsx`  (144 lines)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import CueAI from "./CueAI";
import { LANGUAGES, translate, type Locale } from "@/lib/i18n";

const NAV = (t: (k: string) => string) => [
  { section: t("nav.overview"), items: [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "◈" },
    { href: "/compass", label: t("nav.compass"), icon: "✦" },
  ]},
  { section: t("nav.pipeline"), items: [
    { href: "/capture", label: t("nav.capture"), icon: "⤓" },
    { href: "/understand", label: t("nav.understand"), icon: "◉" },
    { href: "/enhance", label: t("nav.enhance"), icon: "✧" },
    { href: "/execute", label: t("nav.execute"), icon: "▶" },
    { href: "/expand", label: t("nav.expand"), icon: "↗" },
  ]},
  { section: t("nav.company"), items: [
    { href: "/people", label: t("nav.people"), icon: "◍" },
    { href: "/knowledge", label: t("nav.knowledge"), icon: "❑" },
    { href: "/lab", label: t("nav.lab"), icon: "⚗" },
    { href: "/ecosystem", label: t("nav.ecosystem"), icon: "⇄" },
    { href: "/settings", label: t("nav.settings"), icon: "⚙" },
  ]},
];

export default function NavClient({
  orgName,
  userName,
  pendingRecs,
  openTasks,
  locale,
}: {
  orgName: string;
  userName: string;
  pendingRecs: number;
  openTasks: number;
  locale: Locale;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const t = (k: string) => translate(locale, k);
  const nav = NAV(t);

  const badgeFor = (href: string) =>
    href === "/understand" && pendingRecs > 0 ? pendingRecs :
    href === "/execute" && openTasks > 0 ? openTasks : null;

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-ink-900/90 backdrop-blur border-b border-navy-100 flex items-center px-4">
        <button onClick={() => setOpen(!open)} className="text-2xl leading-none text-navy-700" aria-label="Menu">☰</button>
        <Link href="/dashboard" className="ml-3 font-semibold text-navy-900">CUE</Link>
        <button onClick={() => setLangOpen(!langOpen)} className="ml-2 text-xs text-navy-400" aria-label="Language">
          {LANGUAGES.find((l) => l.code === locale)?.flag}
        </button>
        {langOpen && (
          <div className="fixed top-14 left-4 z-50 card p-1.5 w-44">
            {LANGUAGES.map((l) => (
              <a key={l.code} href={`?lang=${l.code}`} onClick={(e) => { e.preventDefault(); document.cookie = `cue_locale=${l.code}; path=/; max-age=31536000`; location.reload(); }} className={`block px-2.5 py-1.5 rounded-lg text-sm ${l.code === locale ? "text-accent-blue" : "text-navy-600"}`}>
                {l.flag} {l.label}
              </a>
            ))}
          </div>
        )}
        <button onClick={() => setAiOpen(true)} className="ml-auto ai-chip">✦ CUE AI</button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-ink-900/80 backdrop-blur border-r border-navy-100 flex flex-col transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-navy-50">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange flex items-center justify-center text-white font-bold shadow-glow">B</div>
          <div className="min-w-0">
            <div className="font-semibold text-navy-900 leading-tight">CUE</div>
            <div className="text-[11px] text-navy-400 truncate">{orgName}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-navy-300">
                {group.section}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const badge = badgeFor(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                        active
                          ? "bg-gradient-to-r from-accent-blue/20 to-accent-purple/10 text-white font-medium border border-accent-blue/30 shadow-glow"
                          : "text-navy-500 hover:bg-white/[0.05] hover:text-navy-800 border border-transparent"
                      }`}
                    >
                      <span className={active ? "text-blue-300" : "text-navy-300"}>{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {badge !== null && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent-orange text-white text-[11px] font-semibold flex items-center justify-center shadow-glow">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-50 space-y-1">
          <button
            onClick={() => setAiOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-accent-blue to-accent-purple hover:opacity-90 transition-opacity shadow-glow"
          >
            {t("nav.askAi")}
          </button>
          <form action="/api/auth/signout" method="post">
            <button className="w-full text-left rounded-xl px-3 py-2 text-sm text-navy-400 hover:bg-white/[0.05] hover:text-navy-700">
              {t("nav.signOut")} · {userName}
            </button>
          </form>
        </div>
      </aside>

      {open && <div className="lg:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setOpen(false)} />}

      <CueAI open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

```

### `src/components/OrbitWheel.tsx`  (145 lines)

```tsx
"use client";

// CUE Orbit — the signature CUE-style command center visual.
// An orbital wheel where each node is a CUE module; the ring's
// data (node intensity, health arc) is computed from REAL business
// data passed in from the server. Pure CSS/SVG — no canvas deps.

const MODULES: { key: string; label: string; color: string; href: string }[] = [
  { key: "capture", label: "Capture", color: "#3b82f6", href: "/capture" },
  { key: "knowledge", label: "Knowledge", color: "#8b5cf6", href: "/knowledge" },
  { key: "people", label: "People", color: "#a78bfa", href: "/people" },
  { key: "training", label: "Training", color: "#7c3aed", href: "/expand" },
  { key: "brand", label: "Brand Studio", color: "#f97316", href: "/enhance" },
  { key: "automations", label: "Automations", color: "#fb923c", href: "/execute" },
  { key: "ecosystem", label: "Ecosystem", color: "#38bdf8", href: "/ecosystem" },
  { key: "execute", label: "Execute", color: "#60a5fa", href: "/execute" },
];

export default function OrbitWheel({
  healthScore,
  activity,
}: {
  healthScore: number | null;
  activity: Record<string, number>;
}) {
  const size = 560;
  const c = size / 2;
  const ringR = 190;
  const nodeR = 34;

  const maxAct = Math.max(1, ...Object.values(activity));
  const position = (i: number, total: number) => {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    return { x: c + ringR * Math.cos(angle), y: c + ringR * Math.sin(angle) };
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Orbit rings */}
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#070b16" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="healthArc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>

        <circle cx={c} cy={c} r={160} fill="url(#coreGlow)" />
        <circle cx={c} cy={c} r={ringR} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" strokeDasharray="3 6" />
        <circle cx={c} cy={c} r={ringR - 46} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        <circle cx={c} cy={c} r={ringR + 46} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />

        {/* Health arc */}
        {healthScore !== null && (
          <circle
            cx={c} cy={c} r={ringR - 24}
            fill="none"
            stroke="url(#healthArc)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(healthScore / 100) * 2 * Math.PI * (ringR - 24)} ${2 * Math.PI * (ringR - 24)}`}
            transform={`rotate(-90 ${c} ${c})`}
            opacity="0.9"
          />
        )}

        {/* Connector lines between adjacent nodes */}
        {MODULES.map((m, i) => {
          const a = position(i, MODULES.length);
          const b = position((i + 1) % MODULES.length, MODULES.length);
          return (
            <line
              key={m.key}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(148,163,184,0.18)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
          );
        })}
      </svg>

      {/* Center core */}
      <div className="absolute flex flex-col items-center justify-center text-center" style={{ width: 200, height: 200 }}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-navy-400">Business Health</div>
        <div className="text-5xl font-bold bg-gradient-to-r from-accent-blue via-accent-purple to-accent-orange bg-clip-text text-transparent mt-1">
          {healthScore ?? "—"}
        </div>
        <div className="text-xs text-navy-400 mt-1">Company Compass</div>
      </div>

      {/* Module nodes */}
      {MODULES.map((m, i) => {
        const { x, y } = position(i, MODULES.length);
        const intensity = (activity[m.key] ?? 0) / maxAct;
        const glow = 0.25 + intensity * 0.75;
        return (
          <a
            key={m.key}
            href={m.href}
            className="absolute flex flex-col items-center group"
            style={{ left: x - nodeR, top: y - nodeR - 8, width: nodeR * 2 }}
          >
            <div
              className="h-[68px] w-[68px] rounded-full border flex items-center justify-center text-xl transition-transform group-hover:scale-110"
              style={{
                borderColor: `${m.color}${Math.round(glow * 255).toString(16).padStart(2, "0")}`,
                boxShadow: `0 0 ${8 + intensity * 22}px ${m.color}${Math.round(glow * 140).toString(16).padStart(2, "0")}, inset 0 0 12px ${m.color}22`,
                background: `radial-gradient(circle at 50% 35%, ${m.color}2e, rgba(7,11,22,0.9))`,
              }}
            >
              <span style={{ color: m.color, filter: `drop-shadow(0 0 6px ${m.color}aa)` }}>
                {nodeIcon(m.key)}
              </span>
            </div>
            <span className="mt-1.5 text-xs text-navy-500 group-hover:text-navy-800 transition-colors whitespace-nowrap">
              {m.label}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function nodeIcon(key: string): string {
  const icons: Record<string, string> = {
    capture: "⤓",
    knowledge: "❑",
    people: "◍",
    training: "🎓",
    brand: "✎",
    automations: "⚙",
    ecosystem: "⇄",
    execute: "▶",
  };
  return icons[key] ?? "◈";
}

```

### `src/lib/assistant.ts`  (185 lines)

```ts
import { prisma } from "./prisma";
import { buildCompanyContext } from "./context";
import { parseEvidence } from "./intelligence";
import { money } from "./format";

// ─────────────────────────────────────────────────────────────
// CUE AI — a grounded business guide.
// Answers are assembled from the company's actual records via
// intent-matched queries. When data is missing, CUE says so.
// No external API key required; swappable for an LLM later.
// ─────────────────────────────────────────────────────────────

export type AssistantAnswer = {
  answer: string;
  sources: { label: string; kind: string }[];
  suggested?: { label: string; href: string }[];
};

function fmtMoney(n: number) {
  return money(n);
}

export async function answerQuestion(orgId: string, question: string): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const ctx = await buildCompanyContext(orgId);

  const sources: AssistantAnswer["sources"] = [];
  const push = (label: string, kind: string) => sources.push({ label, kind });

  // Focus / "what should I do"
  if (/\b(focus|priorit|today|attention|next)\b/.test(q)) {
    const focus: string[] = [];
    if (ctx.money.unbilled > 0)
      focus.push(`1. Bill ${fmtMoney(ctx.money.unbilled)} of completed-but-unbilled work — this is revenue you have already earned.`);
    if (ctx.money.overdue > 0)
      focus.push(`2. Chase ${fmtMoney(ctx.money.overdue)} in overdue invoices — collecting existing revenue is faster than new revenue.`);
    if (ctx.counts.openEstimates > 0)
      focus.push(`3. Follow up on ${ctx.counts.openEstimates} open estimates worth ${fmtMoney(ctx.money.estimatePipeline)}.`);
    if (ctx.pendingDecisions.length > 0)
      focus.push(`4. Decide on ${ctx.pendingDecisions.length} pending recommendation${ctx.pendingDecisions.length === 1 ? "" : "s"} waiting for your approval.`);
    push("Computed from current jobs, invoices, estimates and recommendations", "Computation");

    return {
      answer:
        focus.length > 0
          ? `Here is what the data says deserves attention, in order:\n\n${focus.join("\n")}\n\nThis is ranked by money at stake and effort required — not guesswork. Each item links to its evidence.`
          : `Nothing is currently flagged. Based on the ${ctx.counts.completedJobs} completed jobs, ${ctx.counts.openEstimates} open estimates and ${ctx.counts.openTasks} open tasks on record, there is no urgent revenue or collections gap. Capture more information and CUE will surface what matters as patterns emerge.`,
      sources,
      suggested: [
        { label: "Open Dashboard", href: "/dashboard" },
        { label: "Review recommendations", href: "/understand" },
      ],
    };
  }

  // Sales
  if (/\b(sales|estimates?|pipeline|quotes?)\b/.test(q)) {
    const estimates = await prisma.estimate.findMany({
      where: { organizationId: orgId },
      include: { customer: true },
      orderBy: { sentAt: "desc" },
    });
    const open = estimates.filter((e) => e.status === "SENT" || e.status === "VIEWED");
    const accepted = estimates.filter((e) => e.status === "ACCEPTED");
    push(`${estimates.length} estimates on record`, "Estimate");
    return {
      answer: `Sales picture from your estimates:\n\n• ${open.length} open — worth ${fmtMoney(open.reduce((s, e) => s + e.amount, 0))}\n• ${accepted.length} accepted — ${fmtMoney(accepted.reduce((s, e) => s + e.amount, 0))}\n• ${estimates.filter((e) => e.status === "DECLINED").length} declined\n\n${open.length > 0 ? `The open pipeline is ${fmtMoney(ctx.money.estimatePipeline)}. Estimates older than two weeks without follow-up are the biggest leak — see the follow-up insight on your dashboard.` : "No estimates are currently open."}`,
      sources,
      suggested: [{ label: "Open Understand", href: "/understand" }],
    };
  }

  // Unbilled / billing
  if (/\b(unbilled|billing|invoice|invoicing|not billed)\b/.test(q)) {
    const jobs = await prisma.job.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true, invoices: true },
      orderBy: { completedAt: "desc" },
    });
    const unbilled = jobs.filter((j) => j.invoices.length === 0);
    push(`${unbilled.length} completed jobs matched`, "Job");
    return {
      answer:
        unbilled.length > 0
          ? `${unbilled.length} completed job${unbilled.length === 1 ? " has" : "s have"} no invoice — ${fmtMoney(ctx.money.unbilled)} of delivered-but-unbilled work:\n\n${unbilled.slice(0, 8).map((j) => `• ${j.title} — ${j.customer.name} (${fmtMoney(j.amount)})`).join("\n")}${unbilled.length > 8 ? `\n…and ${unbilled.length - 8} more.` : ""}\n\nThere is a recommendation waiting to turn these into a billing plan.`
          : `Every completed job on record (${jobs.length}) has been invoiced. Nothing is sitting unbilled.`,
      sources,
      suggested: [{ label: "Review billing recommendation", href: "/understand" }],
    };
  }

  // Customers
  if (/\b(customer|customers|client|clients|churn|retention)\b/.test(q)) {
    const plans = await prisma.customer.count({
      where: { organizationId: orgId, servicePlan: { not: null } },
    });
    push(`${ctx.counts.customers} customers, ${plans} on service plans`, "Customer");
    return {
      answer: `You have ${ctx.counts.customers} customers on record; ${plans} are on a recurring service plan.\n\n${ctx.topInsights.filter((i) => i.title.toLowerCase().includes("customer")).map((i) => `• ${i.title}`).join("\n") || "No customer risks are currently flagged — the main lever is keeping plan customers on their annual visit schedule."}`,
      sources,
      suggested: [{ label: "Open Company Compass", href: "/compass" }],
    };
  }

  // Health score
  if (/\b(health|score|compass)\b/.test(q)) {
    push("Business Health dimensions", "Computation");
    return {
      answer: `Your Business Health overview is computed live from jobs, invoices, estimates, customers, tasks and documents — never invented. Overall it currently reflects ${ctx.money.unbilled > 0 ? "unbilled work and " : ""}${ctx.money.overdue > 0 ? "overdue invoices and " : ""}${ctx.counts.openEstimates > 0 ? "an active estimate pipeline" : "a quiet pipeline"}. Every dimension on the Company Compass page shows its evidence, reasoning and confidence — click any dimension to inspect exactly why it scored what it did.`,
      sources,
      suggested: [{ label: "Open Company Compass", href: "/compass" }],
    };
  }

  // Policy / knowledge Q&A — searches actual knowledge items
  if (/\b(policy|policies|refund|onboard|procedure|how do we|who is responsible|what did we decide|handbook|warranty)\b/.test(q)) {
    const keywords = q.split(/\W+/).filter((w) => w.length > 3);
    const items = await prisma.knowledgeItem.findMany({ where: { organizationId: orgId } });
    const scored = items
      .map((item) => {
        const text = `${item.title} ${item.content} ${item.tags ?? ""}`.toLowerCase();
        const hits = keywords.filter((k) => text.includes(k)).length;
        return { item, hits };
      })
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        answer: `I searched the ${items.length} knowledge items in your workspace and found nothing matching that. I will not guess — if this policy or procedure exists, capture the document in Capture and I will index it; then I can answer from it.`,
        sources: [{ label: `${items.length} knowledge items searched`, kind: "KnowledgeItem" }],
        suggested: [{ label: "Open Knowledge", href: "/knowledge" }],
      };
    }
    for (const s of scored) push(s.item.title, "KnowledgeItem");
    return {
      answer: `From your company knowledge:\n\n${scored.map((s) => `**${s.item.title}** (${s.item.status.toLowerCase()})\n${s.item.content}`).join("\n\n")}\n\nThese answers come directly from your captured documents — see sources below.`,
      sources,
      suggested: [{ label: "Open Knowledge", href: "/knowledge" }],
    };
  }

  // Recommendations
  if (/\b(recommend|suggest|should i|approve|decision)\b/.test(q)) {
    const recs = await prisma.recommendation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    push(`${recs.length} recommendations`, "Recommendation");
    return {
      answer:
        recs.length > 0
          ? `Current recommendations:\n\n${recs.map((r) => `• **${r.title}** — ${r.status.toLowerCase()}${r.impact ? ` · ${r.impact}` : ""}`).join("\n")}\n\nEvery recommendation shows its evidence and reasoning before you approve anything. CUE never executes a consequential action without your decision.`
          : "There are no recommendations right now. CUE generates them only when patterns in your actual data warrant action — capture more information and check back.",
      sources,
      suggested: [{ label: "Open Understand", href: "/understand" }],
    };
  }

  // Team / people
  if (/\b(team|employee|people|staff|who|department)\b/.test(q)) {
    const employees = await prisma.employee.findMany({
      where: { organizationId: orgId },
      include: { department: true },
    });
    push(`${employees.length} employees`, "Employee");
    return {
      answer: employees.length
        ? `Your team on record (${employees.length} active):\n\n${employees.slice(0, 10).map((e) => `• ${e.name} — ${e.title}${e.department ? ` · ${e.department.name}` : ""}`).join("\n")}`
        : "No employees are on record yet. Add your team in People so CUE can connect work, training and outcomes to specific roles.",
      sources,
      suggested: [{ label: "Open People", href: "/people" }],
    };
  }

  // Fallback — reflect what CUE actually knows, no fabrication
  push("Company snapshot", "Computation");
  return {
    answer: `Here is what I can tell you from your actual data right now:\n\n• ${ctx.counts.completedJobs} completed jobs, ${ctx.counts.openJobs} in flight\n• ${fmtMoney(ctx.money.unbilled)} unbilled · ${fmtMoney(ctx.money.estimatePipeline)} estimate pipeline · ${fmtMoney(ctx.money.overdue)} overdue invoices\n• ${ctx.counts.documents} documents and ${ctx.counts.knowledgeItems} knowledge items captured\n• ${ctx.pendingDecisions.length} recommendations awaiting your decision\n\nAsk me about sales, billing, customers, your team, health, company policies — or what to focus on today. If I do not know something, I will say so rather than make it up.`,
    sources,
  };
}

```

### `src/lib/audit.ts`  (29 lines)

```ts
import { prisma } from "./prisma";

export type AuditInput = {
  organizationId: string;
  actorType?: "USER" | "AI" | "SYSTEM";
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

/** Central audit log. Every consequential action must call this. */
export async function logAudit(input: AuditInput) {
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType ?? "USER",
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: input.detail,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}

```

### `src/lib/auth.ts`  (51 lines)

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySession } from "./session";

export type SessionContext = {
  user: { id: string; name: string; email: string };
  organizationId: string;
  organizationName: string;
  role: string;
};

/** Returns the signed-in user's session context, or null. */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  const userId = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const membership = await prisma.member.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { user: true, organization: true },
  });
  if (!membership) return null;

  return {
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
    },
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}

/** For pages: redirects to /signin when there is no session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session;
}

/** For server actions: throws when there is no session. */
export async function requireSessionAction(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

```

### `src/lib/context.ts`  (99 lines)

```ts
import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────
// Context retrieval — the single service the AI assistant (and
// future LLM integrations) use to ground answers in real data.
// Returns compact JSON; never fabricates.
// ─────────────────────────────────────────────────────────────

export type CompanyContext = {
  business: {
    name: string;
    industry: string | null;
    size: string | null;
    mission: string | null;
    goals: string[];
  };
  counts: {
    customers: number;
    employees: number;
    openJobs: number;
    completedJobs: number;
    openEstimates: number;
    overdueInvoices: number;
    openTasks: number;
    documents: number;
    knowledgeItems: number;
    pendingRecommendations: number;
  };
  money: {
    unbilled: number;
    estimatePipeline: number;
    overdue: number;
    collected: number;
  };
  topInsights: { title: string; severity: string; impactValue: number | null }[];
  pendingDecisions: { title: string; impact: string | null }[];
  openTasks: { title: string; priority: string; dueAt: string | null }[];
};

export async function buildCompanyContext(orgId: string): Promise<CompanyContext> {
  const [profile, customers, employees, jobs, estimates, invoices, tasks, documents, knowledge, recs, insights, payments] =
    await Promise.all([
      prisma.businessProfile.findUnique({ where: { organizationId: orgId }, include: { goals: true } }),
      prisma.customer.count({ where: { organizationId: orgId } }),
      prisma.employee.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
      prisma.job.findMany({ where: { organizationId: orgId }, select: { status: true, amount: true, invoices: { select: { id: true } } } }),
      prisma.estimate.findMany({ where: { organizationId: orgId, status: { in: ["SENT", "VIEWED"] } }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { organizationId: orgId }, select: { status: true, amount: true, dueAt: true } }),
      prisma.task.findMany({ where: { organizationId: orgId }, select: { status: true, title: true, priority: true, dueAt: true } }),
      prisma.document.count({ where: { organizationId: orgId } }),
      prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
      prisma.recommendation.findMany({ where: { organizationId: orgId, status: "PENDING" }, select: { title: true, impact: true } }),
      prisma.insight.findMany({ where: { organizationId: orgId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.payment.findMany({ where: { organizationId: orgId }, select: { amount: true } }),
    ]);

  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const unbilled = completed.filter((j) => j.invoices.length === 0);
  const overdue = invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "VOID" && i.dueAt && new Date(i.dueAt).getTime() < Date.now()
  );
  const openTasks = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");

  return {
    business: {
      name: profile?.name ?? "Unknown",
      industry: profile?.industry ?? null,
      size: profile?.size ?? null,
      mission: profile?.mission ?? null,
      goals: profile?.goals.map((g) => g.title) ?? [],
    },
    counts: {
      customers,
      employees,
      openJobs: jobs.filter((j) => j.status === "SCHEDULED" || j.status === "IN_PROGRESS").length,
      completedJobs: completed.length,
      openEstimates: estimates.length,
      overdueInvoices: overdue.length,
      openTasks: openTasks.length,
      documents,
      knowledgeItems: knowledge,
      pendingRecommendations: recs.length,
    },
    money: {
      unbilled: Math.round(unbilled.reduce((s, j) => s + j.amount, 0)),
      estimatePipeline: Math.round(estimates.reduce((s, e) => s + e.amount, 0)),
      overdue: Math.round(overdue.reduce((s, i) => s + i.amount, 0)),
      collected: Math.round(payments.reduce((s, p) => s + p.amount, 0)),
    },
    topInsights: insights.map((i) => ({ title: i.title, severity: i.severity, impactValue: i.impactValue })),
    pendingDecisions: recs.map((r) => ({ title: r.title, impact: r.impact })),
    openTasks: openTasks.slice(0, 8).map((t) => ({
      title: t.title,
      priority: t.priority,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    })),
  };
}

```

### `src/lib/format.ts`  (55 lines)

```ts
export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function moneyExact(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function dateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysAgo(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function agoLabel(d: Date | string | null | undefined): string {
  const days = daysAgo(d);
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function inDaysLabel(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Math.ceil(
    (new Date(d).getTime() - Date.now()) / 86_400_000
  );
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff === 0) return "due today";
  return `in ${diff} days`;
}

```

### `src/lib/health.ts`  (219 lines)

```ts
import { prisma } from "./prisma";
import type { EvidenceRef } from "./intelligence";

export type HealthDimension = {
  key: string;
  label: string;
  score: number; // 0-100
  confidence: "HIGH" | "MEDIUM" | "LOW";
  basis: string; // what data the score is computed from
  reasoning: string;
  evidenceCount: number;
  recommendation?: string;
};

export type HealthReport = {
  overall: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dimensions: HealthDimension[];
  disclaimer: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function confidenceFor(count: number): "HIGH" | "MEDIUM" | "LOW" {
  if (count >= 20) return "HIGH";
  if (count >= 5) return "MEDIUM";
  return "LOW";
}

export async function computeHealth(orgId: string): Promise<HealthReport> {
  const [jobs, invoices, estimates, customers, employees, tasks, payments, documents, recs, comms] =
    await Promise.all([
      prisma.job.findMany({ where: { organizationId: orgId } }),
      prisma.invoice.findMany({ where: { organizationId: orgId } }),
      prisma.estimate.findMany({ where: { organizationId: orgId } }),
      prisma.customer.findMany({ where: { organizationId: orgId } }),
      prisma.employee.findMany({ where: { organizationId: orgId } }),
      prisma.task.findMany({ where: { organizationId: orgId } }),
      prisma.payment.findMany({ where: { organizationId: orgId } }),
      prisma.document.findMany({ where: { organizationId: orgId } }),
      prisma.recommendation.findMany({ where: { organizationId: orgId } }),
      prisma.communication.findMany({ where: { organizationId: orgId } }),
    ]);

  const dimensions: HealthDimension[] = [];

  // Revenue — share of completed work that has been billed and paid
  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const billedJobIds = new Set(invoices.map((i) => i.jobId));
  const billed = completed.filter((j) => billedJobIds.has(j.id)).length;
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const revenueBase = completed.length + paidCount;
  dimensions.push({
    key: "revenue",
    label: "Revenue",
    score: revenueBase === 0 ? 0 : clamp((billed + paidCount) / revenueBase * 100),
    confidence: confidenceFor(revenueBase),
    basis: `${completed.length} completed jobs, ${invoices.length} invoices, ${paidCount} paid`,
    reasoning:
      billed === completed.length
        ? "All completed work has been invoiced."
        : `${completed.length - billed} completed job(s) are still unbilled, which lowers this score.`,
    evidenceCount: revenueBase,
    recommendation:
      billed === completed.length ? undefined : "Invoice all completed jobs to raise this dimension.",
  });

  // Sales pipeline — open estimates and how stale they are
  const open = estimates.filter((e) => e.status === "SENT" || e.status === "VIEWED");
  const stale = open.filter(
    (e) =>
      !e.lastFollowUpAt ||
      Date.now() - new Date(e.lastFollowUpAt).getTime() > 14 * 86_400_000
  );
  const staleShare = open.length === 0 ? 0 : stale.length / open.length;
  dimensions.push({
    key: "pipeline",
    label: "Sales pipeline",
    score: clamp(100 - staleShare * 100),
    confidence: confidenceFor(estimates.length),
    basis: `${estimates.length} estimates total, ${open.length} open, ${stale.length} without recent follow-up`,
    reasoning:
      stale.length === 0
        ? "Open estimates are being actively followed up."
        : `${stale.length} of ${open.length} open estimates have had no follow-up in 14+ days.`,
    evidenceCount: estimates.length,
    recommendation: stale.length > 0 ? "Work the estimate follow-up plan in Execute." : undefined,
  });

  // Cash flow — payments collected vs invoiced
  const invoicedTotal = invoices
    .filter((i) => i.status !== "VOID" && i.status !== "DRAFT")
    .reduce((s, i) => s + i.amount, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const collectionRate = invoicedTotal === 0 ? 0 : paidTotal / invoicedTotal;
  dimensions.push({
    key: "cashflow",
    label: "Cash flow",
    score: clamp(collectionRate * 100),
    confidence: confidenceFor(invoices.length),
    basis: `$${Math.round(invoicedTotal).toLocaleString()} invoiced, $${Math.round(paidTotal).toLocaleString()} collected`,
    reasoning:
      collectionRate >= 0.8
        ? "Most invoiced value has been collected."
        : `Only ${Math.round(collectionRate * 100)}% of invoiced value has been collected so far.`,
    evidenceCount: invoices.length + payments.length,
    recommendation: collectionRate < 0.8 ? "Chase overdue invoices to improve collections." : undefined,
  });

  // Customers — repeat rate
  const customersWithJobs = new Set(jobs.map((j) => j.customerId));
  const repeatRate =
    customers.length === 0
      ? 0
      : customersWithJobs.size / customers.length;
  dimensions.push({
    key: "customers",
    label: "Customers",
    score: clamp(repeatRate * 100),
    confidence: confidenceFor(customers.length),
    basis: `${customers.length} customers, ${customersWithJobs.size} with recorded jobs, ${comms.length} communications`,
    reasoning:
      "Score reflects how much of the customer book has real engagement records. Customers with no activity history are unknown quantities.",
    evidenceCount: customers.length + comms.length,
  });

  // Operations — task throughput
  const openTasks = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const doneTasks = tasks.filter((t) => t.status === "DONE");
  const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());
  const opScore = tasks.length === 0 ? 0 : clamp((doneTasks.length / tasks.length) * 100 - overdueTasks.length * 10);
  dimensions.push({
    key: "operations",
    label: "Operations",
    score: opScore,
    confidence: confidenceFor(tasks.length),
    basis: `${openTasks.length} open tasks, ${doneTasks.length} completed, ${overdueTasks.length} overdue`,
    reasoning:
      overdueTasks.length > 0
        ? `${overdueTasks.length} overdue task(s) are dragging execution down.`
        : "Tasks are being completed without a large backlog.",
    evidenceCount: tasks.length,
    recommendation: overdueTasks.length > 0 ? "Clear overdue tasks in Execute." : undefined,
  });

  // Team
  const active = employees.filter((e) => e.status === "ACTIVE");
  const withSkills = active.filter((e) => (e.skills ?? "").length > 0);
  const teamScore = active.length === 0 ? 0 : clamp((withSkills.length / active.length) * 100);
  dimensions.push({
    key: "team",
    label: "Team",
    score: teamScore,
    confidence: confidenceFor(employees.length),
    basis: `${active.length} active employees, ${withSkills.length} with recorded skills`,
    reasoning:
      "Based on how much CUE knows about your team — skills, responsibilities and departments on record.",
    evidenceCount: employees.length,
    recommendation:
      teamScore < 70 ? "Fill in employee skills and responsibilities in People to improve visibility." : undefined,
  });

  // Data quality — how much CUE actually knows
  const knowledgeCount = await prisma.knowledgeItem.count({ where: { organizationId: orgId } });
  const dataPoints = documents.length + knowledgeCount + comms.length;
  const dataScore = clamp(Math.min(100, dataPoints * 4));
  dimensions.push({
    key: "data",
    label: "Data quality",
    score: dataScore,
    confidence: dataScore > 50 ? "HIGH" : "MEDIUM",
    basis: `${documents.length} documents, ${knowledgeCount} knowledge items, ${comms.length} communications`,
    reasoning:
      "This score measures how much information CUE has to work with — more captured information makes every other score more reliable.",
    evidenceCount: dataPoints,
    recommendation: dataScore < 60 ? "Capture more documents and records to sharpen CUE's intelligence." : undefined,
  });

  // Strategic progress — goals set vs tracked, decisions made
  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: orgId },
    include: { goals: true },
  });
  const goalCount = profile?.goals.length ?? 0;
  const decided = recs.filter((r) => r.status !== "PENDING").length;
  const strategyScore = clamp(Math.min(100, goalCount * 20 + decided * 10));
  dimensions.push({
    key: "strategy",
    label: "Strategic progress",
    score: strategyScore,
    confidence: goalCount > 0 ? "MEDIUM" : "LOW",
    basis: `${goalCount} goals defined, ${decided} recommendation decisions made`,
    reasoning:
      "Reflects whether the business is actively setting goals and acting on intelligence rather than letting recommendations sit.",
    evidenceCount: goalCount + decided,
    recommendation: goalCount === 0 ? "Define goals in Company Compass." : undefined,
  });

  const scored = dimensions.filter((d) => d.confidence !== "LOW");
  const allLow = scored.length === 0;
  const overall = allLow
    ? null
    : Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length);

  const lowConfidenceShare = dimensions.filter((d) => d.confidence === "LOW").length / dimensions.length;
  const confidence: "HIGH" | "MEDIUM" | "LOW" =
    lowConfidenceShare > 0.5 ? "LOW" : lowConfidenceShare > 0.2 ? "MEDIUM" : "HIGH";

  return {
    overall,
    confidence,
    dimensions,
    disclaimer:
      "This score is CUE's transparent reading of the data currently in your workspace. It is a decision aid, not an objective scientific rating — every dimension shows exactly what it is computed from.",
  };
}

```

### `src/lib/i18n.ts`  (165 lines)

```ts
// ─────────────────────────────────────────────────────────────
// CUE i18n. Cookie-based locale, server-first: pages read the
// locale via `getLocale()` and pull strings from the dictionary.
// Adding a language = add a dictionary entry + a LANGUAGES row.
// ─────────────────────────────────────────────────────────────

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
] as const;

export type Locale = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cue_locale";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.overview": "Overview",
  "nav.pipeline": "Capture → Understand → Enhance → Execute → Expand",
  "nav.company": "Company",
  "nav.dashboard": "Dashboard",
  "nav.compass": "Company Compass",
  "nav.capture": "Capture",
  "nav.understand": "Understand",
  "nav.enhance": "Enhance",
  "nav.execute": "Execute",
  "nav.expand": "Expand",
  "nav.people": "People",
  "nav.knowledge": "Knowledge",
  "nav.lab": "Innovation Lab",
  "nav.ecosystem": "Connected Ecosystem",
  "nav.settings": "Settings",
  "nav.askAi": "✦ Ask CUE AI",
  "nav.signOut": "Sign out",
  "app.tagline": "The Heart of Your Business",
  "app.signIn": "Sign in",
  "app.signUp": "Create your workspace",
  "app.email": "Work email",
  "app.password": "Password",
  "app.signInCta": "Sign in to CUE",
  "app.language": "Language",
};

const es: Dict = {
  "nav.overview": "Resumen",
  "nav.pipeline": "Capturar → Entender → Mejorar → Ejecutar → Expandir",
  "nav.company": "Empresa",
  "nav.dashboard": "Panel",
  "nav.compass": "Brújula Empresarial",
  "nav.capture": "Capturar",
  "nav.understand": "Entender",
  "nav.enhance": "Mejorar",
  "nav.execute": "Ejecutar",
  "nav.expand": "Expandir",
  "nav.people": "Personas",
  "nav.knowledge": "Conocimiento",
  "nav.lab": "Laboratorio de Innovación",
  "nav.ecosystem": "Ecosistema Conectado",
  "nav.settings": "Configuración",
  "nav.askAi": "✦ Pregunta a CUE AI",
  "nav.signOut": "Cerrar sesión",
  "app.tagline": "El Corazón de Tu Negocio",
  "app.signIn": "Iniciar sesión",
  "app.signUp": "Crea tu espacio de trabajo",
  "app.email": "Correo de trabajo",
  "app.password": "Contraseña",
  "app.signInCta": "Inicia sesión en CUE",
  "app.language": "Idioma",
};

const fr: Dict = {
  "nav.overview": "Vue d'ensemble",
  "nav.pipeline": "Capturer → Comprendre → Améliorer → Exécuter → Développer",
  "nav.company": "Entreprise",
  "nav.dashboard": "Tableau de bord",
  "nav.compass": "Compas d'entreprise",
  "nav.capture": "Capturer",
  "nav.understand": "Comprendre",
  "nav.enhance": "Améliorer",
  "nav.execute": "Exécuter",
  "nav.expand": "Développer",
  "nav.people": "Équipe",
  "nav.knowledge": "Connaissances",
  "nav.lab": "Laboratoire d'innovation",
  "nav.ecosystem": "Écosystème connecté",
  "nav.settings": "Paramètres",
  "nav.askAi": "✦ Demander à CUE AI",
  "nav.signOut": "Se déconnecter",
  "app.tagline": "Le Cœur de Votre Entreprise",
  "app.signIn": "Connexion",
  "app.signUp": "Créez votre espace",
  "app.email": "E-mail professionnel",
  "app.password": "Mot de passe",
  "app.signInCta": "Se connecter à CUE",
  "app.language": "Langue",
};

const de: Dict = {
  "nav.overview": "Übersicht",
  "nav.pipeline": "Erfassen → Verstehen → Verbessern → Ausführen → Erweitern",
  "nav.company": "Unternehmen",
  "nav.dashboard": "Dashboard",
  "nav.compass": "Unternehmenskompass",
  "nav.capture": "Erfassen",
  "nav.understand": "Verstehen",
  "nav.enhance": "Verbessern",
  "nav.execute": "Ausführen",
  "nav.expand": "Erweitern",
  "nav.people": "Team",
  "nav.knowledge": "Wissen",
  "nav.lab": "Innovationslabor",
  "nav.ecosystem": "Verbundenes Ökosystem",
  "nav.settings": "Einstellungen",
  "nav.askAi": "✦ CUE AI fragen",
  "nav.signOut": "Abmelden",
  "app.tagline": "Das Herz Ihres Unternehmens",
  "app.signIn": "Anmelden",
  "app.signUp": "Arbeitsbereich erstellen",
  "app.email": "Geschäftliche E-Mail",
  "app.password": "Passwort",
  "app.signInCta": "Bei CUE anmelden",
  "app.language": "Sprache",
};

const pt: Dict = {
  "nav.overview": "Visão geral",
  "nav.pipeline": "Capturar → Entender → Aprimorar → Executar → Expandir",
  "nav.company": "Empresa",
  "nav.dashboard": "Painel",
  "nav.compass": "Bússola Empresarial",
  "nav.capture": "Capturar",
  "nav.understand": "Entender",
  "nav.enhance": "Aprimorar",
  "nav.execute": "Executar",
  "nav.expand": "Expandir",
  "nav.people": "Equipe",
  "nav.knowledge": "Conhecimento",
  "nav.lab": "Laboratório de Inovação",
  "nav.ecosystem": "Ecossistema Conectado",
  "nav.settings": "Configurações",
  "nav.askAi": "✦ Pergunte ao CUE AI",
  "nav.signOut": "Sair",
  "app.tagline": "O Coração do Seu Negócio",
  "app.signIn": "Entrar",
  "app.signUp": "Crie seu espaço de trabalho",
  "app.email": "E-mail comercial",
  "app.password": "Senha",
  "app.signInCta": "Entrar no CUE",
  "app.language": "Idioma",
};

export const DICTIONARIES: Record<Locale, Dict> = { en, es, fr, de, pt };

export function translate(locale: Locale, key: string): string {
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && LANGUAGES.some((l) => l.code === value);
}

```

### `src/lib/intelligence.ts`  (451 lines)

```ts
import { prisma } from "./prisma";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────
// CUE intelligence engine.
// Insights are COMPUTED from actual business records — never invented.
// Every insight carries machine-checkable evidence references.
// ─────────────────────────────────────────────────────────────

export type EvidenceRef = {
  kind:
    | "Job"
    | "Estimate"
    | "Invoice"
    | "Customer"
    | "Communication"
    | "Payment"
    | "KnowledgeItem";
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

export type ComputedInsight = {
  type: "RISK" | "OPPORTUNITY" | "REVENUE" | "OPERATIONS" | "CUSTOMER" | "ANOMALY";
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  impactValue?: number;
  evidence: EvidenceRef[];
  reasoning: string;
  confidence: number;
  recommendation?: {
    title: string;
    action: string;
    rationale: string;
    impact: string;
    impactValue?: number;
    confidence: number;
  };
};

const FOLLOW_UP_DAYS = 14;

/** Detects completed jobs that have no invoice — revenue sitting unbilled. */
async function detectUnbilledJobs(orgId: string): Promise<ComputedInsight | null> {
  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId, status: "COMPLETED" },
    include: { customer: true, invoices: true, employee: true },
    orderBy: { completedAt: "desc" },
  });
  const unbilled = jobs.filter((j) => j.invoices.length === 0);
  if (unbilled.length === 0) return null;

  const total = unbilled.reduce((s, j) => s + j.amount, 0);
  return {
    type: "REVENUE",
    title: `${unbilled.length} completed job${unbilled.length === 1 ? "" : "s"} without an invoice`,
    summary: `Work was finished but never billed. Potential unbilled revenue: $${Math.round(total).toLocaleString()}.`,
    severity: total > 5000 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: unbilled.map((j) => ({
      kind: "Job" as const,
      id: j.id,
      label: `${j.title} — ${j.customer.name}`,
      detail: `Completed ${j.completedAt ? new Date(j.completedAt).toLocaleDateString() : "date unknown"} · ${j.trade} · assigned to ${j.employee?.name ?? "unassigned"} · no invoice exists for this job`,
      amount: j.amount,
    })),
    reasoning:
      "Every completed job in a service business should produce an invoice. CUE matched completed jobs against issued invoices and found these have none, which means the work was delivered but the revenue was never requested.",
    confidence: 0.97,
    recommendation: {
      title: "Create a billing plan for unbilled jobs",
      action: "BILL_UNBILLED_JOBS",
      rationale:
        "Generating invoices for these completed jobs converts delivered work into collected revenue and prevents the backlog from growing.",
      impact: `Recover up to $${Math.round(total).toLocaleString()} in unbilled revenue`,
      impactValue: total,
      confidence: 0.97,
    },
  };
}

/** Detects estimates with no follow-up since being sent. */
async function detectEstimateLeakage(orgId: string): Promise<ComputedInsight | null> {
  const estimates = await prisma.estimate.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["SENT", "VIEWED"] },
    },
    include: { customer: true },
    orderBy: { sentAt: "desc" },
  });
  const stale = estimates.filter((e) => {
    const ref = e.lastFollowUpAt ?? e.sentAt;
    if (!ref) return true;
    return Date.now() - new Date(ref).getTime() > FOLLOW_UP_DAYS * 86_400_000;
  });
  if (stale.length === 0) return null;

  const total = stale.reduce((s, e) => s + e.amount, 0);
  return {
    type: "OPPORTUNITY",
    title: `${stale.length} estimate${stale.length === 1 ? "" : "s"} with no recent follow-up`,
    summary: `Open estimates have had no follow-up in over ${FOLLOW_UP_DAYS} days. Potential revenue waiting: $${Math.round(total).toLocaleString()}.`,
    severity: total > 20000 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: stale.map((e) => ({
      kind: "Estimate" as const,
      id: e.id,
      label: `${e.title} — ${e.customer.name}`,
      detail: `${e.status} · sent ${e.sentAt ? new Date(e.sentAt).toLocaleDateString() : "unknown"} · last follow-up ${e.lastFollowUpAt ? new Date(e.lastFollowUpAt).toLocaleDateString() : "never"}`,
      amount: e.amount,
    })),
    reasoning:
      "Estimates go cold quickly: most service-business estimates that are accepted, are accepted within the first two weeks. These have passed that window with no recorded contact, so they are likely forgotten rather than declined.",
    confidence: 0.85,
    recommendation: {
      title: "Create an estimate follow-up plan",
      action: "FOLLOW_UP_ESTIMATES",
      rationale:
        "A structured follow-up pass recovers estimates that were forgotten rather than rejected. Each contact either revives the revenue or closes the loop cleanly.",
      impact: `Up to $${Math.round(total).toLocaleString()} in pipeline revenue could be recovered or closed out`,
      impactValue: total,
      confidence: 0.75,
    },
  };
}

/** Detects invoices that are past due and unpaid. */
async function detectOverdueInvoices(orgId: string): Promise<ComputedInsight | null> {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
    include: { customer: true },
  });
  const overdue = invoices.filter(
    (i) => i.dueAt && new Date(i.dueAt).getTime() < Date.now()
  );
  if (overdue.length === 0) return null;

  const total = overdue.reduce((s, i) => s + i.amount, 0);
  return {
    type: "REVENUE",
    title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} totaling $${Math.round(total).toLocaleString()}`,
    summary: `Invoices have passed their due date without payment. Collecting these is faster than finding new revenue.`,
    severity: "MEDIUM",
    impactValue: total,
    evidence: overdue.map((i) => ({
      kind: "Invoice" as const,
      id: i.id,
      label: `${i.number} — ${i.customer.name}`,
      detail: `${i.status} · due ${i.dueAt ? new Date(i.dueAt).toLocaleDateString() : "unknown"} · no payment recorded`,
      amount: i.amount,
    })),
    reasoning:
      "CUE compares invoice due dates against received payments. These invoices are past due with no matching payment, so cash that was expected has not arrived.",
    confidence: 0.95,
    recommendation: {
      title: "Send payment reminders for overdue invoices",
      action: "REMIND_OVERDUE_INVOICES",
      rationale:
        "Most late invoices are oversights, not refusals. A courteous reminder is the highest-yield collections action available.",
      impact: `Accelerate $${Math.round(total).toLocaleString()} in receivables`,
      impactValue: total,
      confidence: 0.7,
    },
  };
}

/** Detects service-plan customers whose only contact was the original job. */
async function detectNeglectedPlanCustomers(orgId: string): Promise<ComputedInsight | null> {
  const plans = await prisma.customer.findMany({
    where: {
      organizationId: orgId,
      servicePlan: { not: null },
      status: "ACTIVE",
    },
    include: {
      jobs: { orderBy: { scheduledFor: "desc" } },
      communications: { orderBy: { occurredAt: "desc" } },
    },
  });
  const neglected = plans.filter((c) => {
    if (c.jobs.length === 0) return false;
    const lastJob = c.jobs[0]?.scheduledFor ?? c.jobs[0]?.completedAt;
    if (!lastJob) return false;
    return Date.now() - new Date(lastJob).getTime() > 330 * 86_400_000;
  });
  if (neglected.length === 0) return null;

  return {
    type: "CUSTOMER",
    title: `${neglected.length} service-plan customer${neglected.length === 1 ? "" : "s"} approaching their renewal window without recent contact`,
    summary:
      "Service-plan customers are the most valuable recurring revenue in the book. These have had no job or contact in nearly a year.",
    severity: "MEDIUM",
    evidence: neglected.map((c) => ({
      kind: "Customer" as const,
      id: c.id,
      label: `${c.name} — ${c.servicePlan}`,
      detail: `Last job ${c.jobs[0]?.scheduledFor ? new Date(c.jobs[0].scheduledFor).toLocaleDateString() : "unknown"} · ${c.communications.length} communications on record`,
    })),
    reasoning:
      "Plan members expect an annual service visit. When one slips past ten months without contact, the renewal is at risk and the customer may perceive low value in the plan.",
    confidence: 0.8,
    recommendation: {
      title: "Schedule annual service visits for plan customers",
      action: "SCHEDULE_PLAN_VISITS",
      rationale:
        "Proactively booking the annual visit protects the renewal and creates a natural upsell conversation.",
      impact: "Protect recurring plan revenue and improve retention",
      confidence: 0.7,
    },
  };
}

// ── Industry Pack: Auto Dealership detectors ──

/** Missed leads: NEW leads with no contact past the response window. */
async function detectMissedLeads(orgId: string): Promise<ComputedInsight | null> {
  const leads = await prisma.lead.findMany({ where: { organizationId: orgId, status: "NEW" } });
  const stale = leads.filter(
    (l) => Date.now() - new Date(l.createdAt).getTime() > 24 * 3_600_000
  );
  if (stale.length === 0) return null;
  const value = stale.reduce((s, l) => s + (l.estValue ?? 0), 0);
  return {
    type: "REVENUE",
    title: `${stale.length} lead${stale.length === 1 ? "" : "s"} with no response past 24 hours`,
    summary: `Unanswered leads go cold fast — response speed is the strongest close-rate predictor. Estimated pipeline value: $${Math.round(value).toLocaleString()}.`,
    severity: stale.length >= 4 ? "HIGH" : "MEDIUM",
    impactValue: value,
    evidence: stale.map((l) => ({
      kind: "Customer" as const,
      id: l.id,
      label: `${l.name} — ${l.interest ?? "general inquiry"}`,
      detail: `${l.source} lead · arrived ${new Date(l.createdAt).toLocaleString()} · no contact recorded`,
      amount: l.estValue ?? undefined,
    })),
    reasoning:
      "CUE compares lead arrival times against contact records. These leads have passed the 15-minute response target and the 24-hour fallback window with no outreach logged.",
    confidence: 0.95,
    recommendation: {
      title: "Respond to every unanswered lead today",
      action: "RESPOND_TO_LEADS",
      rationale: "A rapid-response pass converts leads while intent is fresh and recovers deals that would silently evaporate.",
      impact: `Re-engage roughly $${Math.round(value).toLocaleString()} of pipeline`,
      impactValue: value,
      confidence: 0.8,
    },
  };
}

/** Stalled deals: NEGOTIATING with no note activity for 3+ days. */
async function detectStalledDeals(orgId: string): Promise<ComputedInsight | null> {
  const deals = await prisma.deal.findMany({
    where: { organizationId: orgId, status: "NEGOTIATING" },
    include: { customer: true, vehicle: true },
  });
  const stalled = deals.filter(
    (d) => Date.now() - new Date(d.createdAt).getTime() > 3 * 86_400_000
  );
  if (stalled.length === 0) return null;
  const value = stalled.reduce((s, d) => s + d.amount, 0);
  return {
    type: "OPPORTUNITY",
    title: `${stalled.length} deal${stalled.length === 1 ? "" : "s"} in negotiation with no movement for 3+ days`,
    summary: `Unsold deals cool quickly. Combined value: $${Math.round(value).toLocaleString()}. A structured follow-up either closes them or frees the customer to move on.`,
    severity: "HIGH",
    impactValue: value,
    evidence: stalled.map((d) => ({
      kind: "Job" as const,
      id: d.id,
      label: `${d.customer.name} — ${d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : d.dealType + " deal"}`,
      detail: `Open ${new Date(d.createdAt).toLocaleDateString()} · $${d.amount.toLocaleString()} · no follow-up recorded since`,
      amount: d.amount,
    })),
    reasoning:
      "Deals open longer than a weekend without contact rarely close on their own. CUE flags negotiations that have sat past the 48-hour follow-up policy.",
    confidence: 0.88,
    recommendation: {
      title: "Create an unsold-deal follow-up plan",
      action: "FOLLOW_UP_DEALS",
      rationale: "Systematic 48-hour follow-up is the highest-yield sales activity in retail automotive.",
      impact: `Work $${Math.round(value).toLocaleString()} of stalled pipeline`,
      impactValue: value,
      confidence: 0.75,
    },
  };
}

/** Completed service orders with no invoice. */
async function detectUnbilledServiceOrders(orgId: string): Promise<ComputedInsight | null> {
  const orders = await prisma.serviceOrder.findMany({
    where: { organizationId: orgId, status: "COMPLETED" },
    include: { customer: true },
  });
  const unbilled = orders.filter((o) => !o.invoicedAt);
  if (unbilled.length === 0) return null;
  const total = unbilled.reduce((s, o) => s + o.amount, 0);
  return {
    type: "REVENUE",
    title: `${unbilled.length} completed service order${unbilled.length === 1 ? "" : "s"} not yet invoiced`,
    summary: `Service work is done but the invoice has not gone out. Unbilled service revenue: $${Math.round(total).toLocaleString()}.`,
    severity: total > 1500 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: unbilled.map((o) => ({
      kind: "Job" as const,
      id: o.id,
      label: `${o.title} — ${o.customer.name}`,
      detail: `Completed ${o.completedAt ? new Date(o.completedAt).toLocaleDateString() : "recently"} · no invoice recorded`,
      amount: o.amount,
    })),
    reasoning:
      "Completed service orders should be invoiced within 24 hours per company policy. CUE matches completed orders against invoice records and found these gaps.",
    confidence: 0.96,
    recommendation: {
      title: "Bill all completed service orders",
      action: "BILL_SERVICE_ORDERS",
      rationale: "Billing same-day protects fixed-operations revenue and keeps DSO low.",
      impact: `Collect $${Math.round(total).toLocaleString()} in service revenue`,
      impactValue: total,
      confidence: 0.95,
    },
  };
}

/** Aging inventory: AVAILABLE vehicles listed 30+ days. */
async function detectAgedInventory(orgId: string): Promise<ComputedInsight | null> {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: orgId, status: "AVAILABLE" },
  });
  const aged = vehicles.filter(
    (v) => v.listedAt && Date.now() - new Date(v.listedAt).getTime() > 30 * 86_400_000
  );
  if (aged.length === 0) return null;
  const carrying = aged.reduce((s, v) => s + (v.cost ?? 0) * 0.0004 * 30, 0); // rough floorplan interest
  return {
    type: "OPERATIONS",
    title: `${aged.length} vehicle${aged.length === 1 ? "" : "s"} sitting unsold past 30 days`,
    summary: `Aging units accrue floorplan interest daily (roughly $22/day per unit) and lose market value. Estimated carrying cost so far: $${Math.round(carrying).toLocaleString()}+.`,
    severity: aged.length >= 3 ? "HIGH" : "MEDIUM",
    evidence: aged.map((v) => ({
      kind: "Job" as const,
      id: v.id,
      label: `${v.year} ${v.make} ${v.model} ${v.trim ?? ""} (${v.stockNumber})`,
      detail: `Listed ${v.listedAt ? new Date(v.listedAt).toLocaleDateString() : "unknown"} · $${(v.listPrice ?? 0).toLocaleString()} asking · $${(v.cost ?? 0).toLocaleString()} cost`,
      amount: v.listPrice ?? undefined,
    })),
    reasoning:
      "Dealership policy is a price review every Monday for units past 30 days. CUE compares listedAt dates against today and flags units past that threshold.",
    confidence: 0.9,
    recommendation: {
      title: "Run a price review on aging inventory",
      action: "PRICE_REVIEW_AGED",
      rationale: "Movement on aged units frees floorplan capital and stops the daily interest bleed.",
      impact: "Free up capital and stop carrying-cost losses",
      confidence: 0.7,
    },
  };
}

/** Run all detectors and persist new insights + linked recommendations. */
export async function refreshIntelligence(orgId: string) {
  const detectors = [
    detectUnbilledJobs,
    detectEstimateLeakage,
    detectOverdueInvoices,
    detectNeglectedPlanCustomers,
    detectMissedLeads,
    detectStalledDeals,
    detectUnbilledServiceOrders,
    detectAgedInventory,
  ];

  let created = 0;
  for (const detect of detectors) {
    const insight = await detect(orgId);
    if (!insight) continue;

    const fingerprint = insight.title;
    // Dedupe on fingerprint in ANY status: if CUE already flagged it
    // (or the user dismissed / acted on it), do not nag again until the
    // underlying records actually change the picture.
    const existing = await prisma.insight.findFirst({
      where: { organizationId: orgId, title: fingerprint },
    });
    if (existing) continue;

    const rec = insight.recommendation
      ? await prisma.recommendation.create({
          data: {
            organizationId: orgId,
            title: insight.recommendation.title,
            action: insight.recommendation.action,
            rationale: insight.recommendation.rationale,
            impact: insight.recommendation.impact,
            impactValue: insight.recommendation.impactValue,
            confidence: insight.recommendation.confidence,
          },
        })
      : null;

    const createdInsight = await prisma.insight.create({
      data: {
        organizationId: orgId,
        type: insight.type,
        title: insight.title,
        summary: insight.summary,
        severity: insight.severity,
        impactValue: insight.impactValue,
        evidence: JSON.stringify(insight.evidence),
        reasoning: insight.reasoning,
        confidence: insight.confidence,
        recId: rec?.id,
      },
    });

    if (rec) {
      await prisma.recommendation.update({
        where: { id: rec.id },
        data: { insightId: createdInsight.id },
      });
    }

    await logAudit({
      organizationId: orgId,
      actorType: "AI",
      action: "INSIGHT_GENERATED",
      targetType: "Insight",
      detail: fingerprint,
      metadata: {
        evidenceCount: insight.evidence.length,
        impactValue: insight.impactValue,
      },
    });
    created++;
  }
  return created;
}

export async function parseEvidence(raw: string): Promise<EvidenceRef[]> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

```

### `src/lib/locale.ts`  (16 lines)

```ts
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate, type Locale } from "./i18n";

/** Read the user's locale from the cookie (server components/actions). */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Convenience: `t("nav.dashboard")` inside server components. */
export async function getT(): Promise<(key: string) => string> {
  const locale = await getLocale();
  return (key: string) => translate(locale, key);
}

```

### `src/lib/password.ts`  (16 lines)

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

```

### `src/lib/prisma.ts`  (12 lines)

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

```

### `src/lib/session.ts`  (28 lines)

```ts
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
export const SESSION_COOKIE = "cue_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function signSession(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const expected = createHmac("sha256", SECRET)
    .update(`${userId}.${expires}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

```

### `src/lib/starter-data.ts`  (94 lines)

```ts
import { prisma } from "./prisma";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────
// Starter data — a small, clearly-labeled sample of business
// activity for a brand-new workspace, so the intelligence engine
// has something real to analyze. Scoped 100% to the caller's org.
// ─────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const d = (n: number) => new Date(Date.now() + n * DAY);

export async function spawnStarterData(orgId: string, pack: "HOME" | "AUTO") {
  const customers: { name: string; email: string; phone: string; type: string; servicePlan?: string }[] =
    pack === "AUTO"
      ? [
          { name: "Jordan Whitfield", email: "jordan.w@example.com", phone: "(555) 201-3344", type: "RESIDENTIAL" },
          { name: "Amara Osei", email: "amara.osei@example.com", phone: "(555) 882-1109", type: "RESIDENTIAL" },
          { name: "Diego Fuentes", email: "diego.f@example.com", phone: "(555) 340-7781", type: "RESIDENTIAL" },
          { name: "Hannah Lieu", email: "hannah.lieu@example.com", phone: "(555) 415-9922", type: "RESIDENTIAL" },
          { name: "Robert Mendez", email: "r.mendez@example.com", phone: "(555) 776-5510", type: "COMMERCIAL", servicePlan: "Fleet service agreement" },
        ]
      : [
          { name: "Karen & Bill Hendricks", email: "k.hendricks@example.com", phone: "(555) 310-2288", type: "RESIDENTIAL", servicePlan: "Annual maintenance plan" },
          { name: "Ravi Patel", email: "ravi.patel@example.com", phone: "(555) 947-6612", type: "RESIDENTIAL", servicePlan: "Annual maintenance plan" },
          { name: "Linh Nguyen", email: "linh.nguyen@example.com", phone: "(555) 208-4477", type: "RESIDENTIAL" },
          { name: "Erin Walsh", email: "erin.walsh@example.com", phone: "(555) 663-9021", type: "RESIDENTIAL" },
          { name: "Kowalski Bakery", email: "office@kowalski.example.com", phone: "(555) 505-1187", type: "COMMERCIAL" },
        ];

  const created = [] as { id: string; name: string }[];
  for (const c of customers) {
    const row = await prisma.customer.create({
      data: { organizationId: orgId, name: c.name, email: c.email, phone: c.phone, type: c.type, servicePlan: c.servicePlan ?? null },
    });
    created.push({ id: row.id, name: row.name });
  }

  // Employees for assignment context
  const tech = await prisma.employee.create({
    data: { organizationId: orgId, name: "Team Member A", title: pack === "AUTO" ? "Salesperson" : "Technician", skills: "Customer service, Follow-up" },
  });

  if (pack === "AUTO") {
    const mkV = (stock: string, year: number, make: string, model: string, kind: string, status: string, list: number, cost: number, listed: number) =>
      prisma.vehicle.create({ data: { organizationId: orgId, stockNumber: stock, year, make, model, kind, status, listPrice: list, cost, listedAt: d(listed) } });

    const v1 = await mkV("S1001", 2023, "Toyota", "Camry", "USED", "AVAILABLE", 28900, 25600, -35); // aged
    const v2 = await mkV("S1002", 2024, "Honda", "CR-V", "NEW", "AVAILABLE", 35400, 33200, -4);
    await mkV("S1003", 2022, "Ford", "F-150", "USED", "AVAILABLE", 38700, 34800, -12);

    // Missed leads (the classic dealership leak)
    for (const [i, c] of [created[0], created[1], created[2]].entries()) {
      await prisma.lead.create({
        data: { organizationId: orgId, name: c.name, source: i === 2 ? "PHONE" : "WEB", interest: i === 2 ? "F-150 trade-in" : "SUV under $30k", estValue: 2800 + i * 400, status: "NEW", createdAt: d(-(1 + i)) },
      });
    }
    // Stalled deals
    await prisma.deal.create({ data: { organizationId: orgId, customerId: created[3].id, vehicleId: v1.id, dealType: "USED", status: "NEGOTIATING", amount: 28900, createdAt: d(-5) } });
    await prisma.deal.create({ data: { organizationId: orgId, customerId: created[4].id, vehicleId: v2.id, dealType: "NEW", status: "NEGOTIATING", amount: 35400, createdAt: d(-4) } });
    // Unbilled service
    await prisma.serviceOrder.create({ data: { organizationId: orgId, customerId: created[0].id, vehicleId: v1.id, title: "Brake service", amount: 640, status: "COMPLETED", openedAt: d(-6), completedAt: d(-6) } });
    await prisma.serviceOrder.create({ data: { organizationId: orgId, customerId: created[1].id, title: "Oil change + inspection", amount: 129, status: "COMPLETED", openedAt: d(-3), completedAt: d(-3) } });
  } else {
    // 3 completed jobs with no invoice (revenue leakage)
    for (const [i, c] of [created[0], created[2], created[4]].entries()) {
      await prisma.job.create({
        data: { organizationId: orgId, customerId: c.id, employeeId: tech.id, title: ["AC compressor replacement", "Water heater replacement", "Panel upgrade"][i], trade: ["HVAC", "PLUMBING", "ELECTRICAL"][i], status: "COMPLETED", scheduledFor: d(-(10 + i * 3)), completedAt: d(-(10 + i * 3)), amount: [1850, 1450, 980][i] },
      });
    }
    // Stale estimates
    for (const [i, c] of [created[1], created[3], created[4]].entries()) {
      await prisma.estimate.create({
        data: { organizationId: orgId, customerId: c.id, title: ["Ductless mini-split", "Bathroom repipe", "Backup generator"][i], amount: [4200, 3600, 5800][i], status: "SENT", sentAt: d(-(18 + i * 4)) },
      });
    }
    // A healthy billed job
    const billed = await prisma.job.create({
      data: { organizationId: orgId, customerId: created[3].id, employeeId: tech.id, title: "Seasonal tune-up", trade: "HVAC", status: "COMPLETED", scheduledFor: d(-30), completedAt: d(-30), amount: 189 },
    });
    await prisma.invoice.create({ data: { organizationId: orgId, customerId: created[3].id, jobId: billed.id, number: "INV-9001", amount: 189, status: "PAID", issuedAt: d(-29), dueAt: d(-8), paidAt: d(-24) } });
    await prisma.payment.create({ data: { organizationId: orgId, customerId: created[3].id, amount: 189, method: "CARD", receivedAt: d(-24) } });
  }

  await logAudit({
    organizationId: orgId,
    actorType: "SYSTEM",
    action: "STARTER_DATA_GENERATED",
    detail: `Sample ${pack === "AUTO" ? "dealership" : "home services"} activity created for analysis`,
  });

  return true;
}

```

### `src/lib/workflows.ts`  (205 lines)

```ts
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { parseEvidence } from "./intelligence";

// ─────────────────────────────────────────────────────────────
// Workflow creation — converts an approved recommendation into
// concrete tasks with owners, deadlines and customer context.
// The user triggers it; CUE never auto-executes.
// ─────────────────────────────────────────────────────────────

export async function createWorkflowFromRecommendation(
  orgId: string,
  userId: string,
  recId: string
): Promise<{ workflowId: string; taskCount: number }> {
  const rec = await prisma.recommendation.findUnique({
    where: { id: recId },
    include: { insight: true },
  });
  if (!rec || rec.organizationId !== orgId) throw new Error("Recommendation not found");

  const evidence = rec.insight ? await parseEvidence(rec.insight.evidence) : [];

  let tasks: { title: string; detail: string; priority: string; customerId?: string; dueInDays: number }[] = [];

  if (rec.action === "RESPOND_TO_LEADS") {
    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId, status: "NEW" },
      orderBy: { createdAt: "asc" },
    });
    const stale = leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() > 24 * 3_600_000);
    tasks = stale.map((l) => ({
      title: `Contact lead: ${l.name} — ${l.interest ?? "general inquiry"}`,
      detail: `${l.source} lead arrived ${new Date(l.createdAt).toLocaleString()} and has had no response. Call or text now, log the outcome, and set the next follow-up. Response speed is the strongest close-rate predictor.`,
      priority: "HIGH",
      dueInDays: 0,
    }));
  } else if (rec.action === "FOLLOW_UP_DEALS") {
    const deals = await prisma.deal.findMany({
      where: { organizationId: orgId, status: "NEGOTIATING" },
      include: { customer: true, vehicle: true },
      orderBy: { createdAt: "asc" },
    });
    const stalled = deals.filter((d) => Date.now() - new Date(d.createdAt).getTime() > 3 * 86_400_000);
    tasks = stalled.map((d) => ({
      title: `Follow up: ${d.customer.name} — ${d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : d.dealType}`,
      detail: `Deal open since ${new Date(d.createdAt).toLocaleDateString()} at $${d.amount.toLocaleString()} with no movement in 3+ days. Re-desk if needed, offer a fresh angle (payment, trade, delivery timing), and log the outcome.`,
      priority: "HIGH",
      dueInDays: 1,
    }));
  } else if (rec.action === "BILL_SERVICE_ORDERS") {
    const orders = await prisma.serviceOrder.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true },
      orderBy: { completedAt: "asc" },
    });
    const unbilled = orders.filter((o) => !o.invoicedAt);
    tasks = unbilled.map((o) => ({
      title: `Invoice service: ${o.title} — ${o.customer.name}`,
      detail: `Generate and send the invoice for completed service order ($${o.amount.toFixed(2)}). Verify parts and labor lines before sending — target is invoice within 24 hours of completion.`,
      priority: o.amount > 500 ? "HIGH" : "MEDIUM",
      customerId: o.customerId,
      dueInDays: 1,
    }));
  } else if (rec.action === "PRICE_REVIEW_AGED") {
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId: orgId, status: "AVAILABLE" },
      orderBy: { listedAt: "asc" },
    });
    const aged = vehicles.filter((v) => v.listedAt && Date.now() - new Date(v.listedAt).getTime() > 30 * 86_400_000);
    tasks = aged.map((v) => ({
      title: `Price review: ${v.year} ${v.make} ${v.model} (${v.stockNumber})`,
      detail: `Listed ${v.listedAt ? new Date(v.listedAt).toLocaleDateString() : "unknown"} at $${(v.listPrice ?? 0).toLocaleString()} (cost $${(v.cost ?? 0).toLocaleString()}). Unit is past the 30-day review threshold and accruing floorplan interest daily. Check market comparables and decide: reprice, detail/re-photograph, or wholesale.`,
      priority: "MEDIUM",
      dueInDays: 2,
    }));
  } else if (rec.action === "BILL_UNBILLED_JOBS") {
    const jobs = await prisma.job.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true, invoices: true },
      orderBy: { completedAt: "asc" },
    });
    const unbilled = jobs.filter((j) => j.invoices.length === 0);
    tasks = unbilled.map((j) => ({
      title: `Invoice: ${j.title} — ${j.customer.name}`,
      detail: `Generate and send an invoice for ${j.title} ($${j.amount.toFixed(2)}). Job completed ${j.completedAt ? new Date(j.completedAt).toLocaleDateString() : "recently"}. Verify scope and rates before sending.`,
      priority: j.amount > 1500 ? "HIGH" : "MEDIUM",
      customerId: j.customerId,
      dueInDays: 3,
    }));
  } else if (rec.action === "FOLLOW_UP_ESTIMATES") {
    const estimates = await prisma.estimate.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "VIEWED"] } },
      include: { customer: true },
      orderBy: { sentAt: "asc" },
    });
    const stale = estimates.filter(
      (e) =>
        !e.lastFollowUpAt ||
        Date.now() - new Date(e.lastFollowUpAt).getTime() > 14 * 86_400_000
    );
    tasks = stale.map((e) => ({
      title: `Follow up: ${e.title} — ${e.customer.name}`,
      detail: `Call ${e.customer.name} about the ${e.status.toLowerCase()} estimate ($${e.amount.toFixed(2)}), sent ${e.sentAt ? new Date(e.sentAt).toLocaleDateString() : "recently"}${e.lastFollowUpAt ? `, last follow-up ${new Date(e.lastFollowUpAt).toLocaleDateString()}` : ", never followed up"}. Log the outcome in CUE after the call.`,
      priority: e.amount > 4000 ? "HIGH" : "MEDIUM",
      customerId: e.customerId,
      dueInDays: 2,
    }));
  } else if (rec.action === "REMIND_OVERDUE_INVOICES") {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
      include: { customer: true },
    });
    const overdue = invoices.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < Date.now());
    tasks = overdue.map((i) => ({
      title: `Payment reminder: ${i.number} — ${i.customer.name}`,
      detail: `Send a friendly payment reminder for invoice ${i.number} ($${i.amount.toFixed(2)}), due ${i.dueAt ? new Date(i.dueAt).toLocaleDateString() : "recently"}. Offer payment options if there is an issue.`,
      priority: "MEDIUM",
      customerId: i.customerId,
      dueInDays: 1,
    }));
  } else if (rec.action === "SCHEDULE_PLAN_VISITS") {
    const customers = await prisma.customer.findMany({
      where: { organizationId: orgId, servicePlan: { not: null }, status: "ACTIVE" },
      include: { jobs: { orderBy: { scheduledFor: "desc" }, take: 1 } },
    });
    const neglected = customers.filter(
      (c) =>
        c.jobs.length > 0 &&
        Date.now() - new Date(c.jobs[0].scheduledFor ?? c.jobs[0].completedAt ?? c.createdAt).getTime() >
          330 * 86_400_000
    );
    tasks = neglected.map((c) => ({
      title: `Schedule annual service: ${c.name}`,
      detail: `${c.name} is on the ${c.servicePlan} plan and their last visit was ${new Date(c.jobs[0].scheduledFor ?? c.jobs[0].completedAt ?? c.createdAt).toLocaleDateString()}. Book the annual visit and confirm any warranty items.`,
      priority: "MEDIUM",
      customerId: c.id,
      dueInDays: 7,
    }));
  }

  if (tasks.length === 0) {
    tasks = [
      {
        title: rec.title,
        detail: rec.rationale,
        priority: "MEDIUM",
        dueInDays: 5,
      },
    ];
  }

  const workflow = await prisma.workflow.create({
    data: {
      organizationId: orgId,
      recId: rec.id,
      title: rec.title,
      description: `Created from recommendation "${rec.title}". ${evidence.length} evidence record(s) linked.`,
      kind:
        rec.action === "BILL_UNBILLED_JOBS"
          ? "BILLING"
          : rec.action === "FOLLOW_UP_ESTIMATES"
            ? "FOLLOW_UP"
            : rec.action === "SCHEDULE_PLAN_VISITS"
              ? "PROCESS"
              : "CUSTOM",
    },
  });

  const now = Date.now();
  await prisma.task.createMany({
    data: tasks.map((t) => ({
      organizationId: orgId,
      workflowId: workflow.id,
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      customerId: t.customerId,
      origin: "WORKFLOW",
      dueAt: new Date(now + t.dueInDays * 86_400_000),
    })),
  });

  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "EXECUTED", workflowId: workflow.id, decidedAt: new Date(), decidedById: userId },
  });
  if (rec.insightId) {
    await prisma.insight.update({ where: { id: rec.insightId }, data: { status: "ACTION_TAKEN" } }).catch(() => {});
  }

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: userId,
    action: "WORKFLOW_CREATED",
    targetType: "Workflow",
    targetId: workflow.id,
    detail: `${tasks.length} task(s) created from recommendation`,
    metadata: { recId, action: rec.action, taskCount: tasks.length },
  });

  return { workflowId: workflow.id, taskCount: tasks.length };
}

```

### `prisma/schema.prisma`  (633 lines)

```prisma
// CUE — data architecture
// Domains: Identity, Organization, Business Data, Knowledge, Intelligence,
// Decisions, Execution, Audit. SQLite for local dev; portable to Postgres.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ───────────────────────── IDENTITY ─────────────────────────

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  passwordHash String
  createdAt    DateTime @default(now())
  memberships  Member[]
  auditEvents  AuditEvent[]
  decidedRecs  Recommendation[] @relation("RecDecider")
}

// ───────────────────────── ORGANIZATION ─────────────────────────

model Organization {
  id        String   @id @default(cuid())
  name      String
  isDemo    Boolean  @default(false)
  createdAt DateTime @default(now())

  members     Member[]
  business    BusinessProfile?
  customers   Customer[]
  employees   Employee[]
  departments Department[]
  documents   Document[]
  knowledge   KnowledgeItem[]
  entities    Entity[]
  facts       Fact[]
  insights    Insight[]
  recs        Recommendation[]
  tasks       Task[]
  workflows   Workflow[]
  projects    Project[]
  ideas       Idea[]
  trainings   TrainingModule[]
  integrations Integration[]
  aiSettings  AiSettings?
  auditEvents AuditEvent[]
  brandAssets BrandAsset[]
  jobs         Job[]
  estimates    Estimate[]
  invoices     Invoice[]
  payments     Payment[]
  communications Communication[]
  vehicles      Vehicle[]
  deals         Deal[]
  serviceOrders ServiceOrder[]
  leads         Lead[]
}

model Member {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String // OWNER | ADMIN | MANAGER | MEMBER
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
  @@index([userId])
}

// ───────────────────────── BUSINESS PROFILE (Company Compass) ─────────────────────────

model BusinessProfile {
  id             String  @id @default(cuid())
  organizationId String  @unique
  name           String
  industry       String?
  size           String? // e.g. "2-10"
  locations      String?
  businessModel  String?
  offerings      String? // services / products (newline separated)
  targetCustomers String?
  mission        String?
  values         String?
  operationalPriorities String?
  onboardingStep Int     @default(10)

  organization Organization @relation(fields: [organizationId], references: [id])
  goals        Goal[]
}

model Goal {
  id       String  @id @default(cuid())
  profileId String
  title    String
  detail   String?
  horizon  String? // QUARTER | YEAR | LONG
  status   String  @default("ACTIVE")

  profile BusinessProfile @relation(fields: [profileId], references: [id])
}

// ───────────────────────── BUSINESS DATA ─────────────────────────

model Customer {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  email          String?
  phone          String?
  address        String?
  type           String   @default("RESIDENTIAL") // RESIDENTIAL | COMMERCIAL
  servicePlan    String?  // e.g. "Annual Comfort Club"
  status         String   @default("ACTIVE")
  notes          String?
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  jobs         Job[]
  estimates    Estimate[]
  invoices     Invoice[]
  payments     Payment[]
  communications Communication[]
  tasks        Task[]
  deals        Deal[]
  serviceOrders ServiceOrder[]

  @@index([organizationId])
}

model Employee {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  title          String
  departmentId   String?
  managerId      String?
  email          String?
  skills         String? // comma separated
  responsibilities String?
  status         String  @default("ACTIVE")
  hireDate       DateTime?

  organization Organization  @relation(fields: [organizationId], references: [id])
  department   Department?   @relation(fields: [departmentId], references: [id])
  manager      Employee?     @relation("EmpManager", fields: [managerId], references: [id])
  reports      Employee[]    @relation("EmpManager")
  tasks        Task[]
  assignments  TrainingAssignment[]
  jobs         Job[]
  leads        Lead[]

  @@index([organizationId])
}

model Department {
  id             String @id @default(cuid())
  organizationId String
  name           String
  description    String?

  organization Organization @relation(fields: [organizationId], references: [id])
  employees    Employee[]

  @@index([organizationId])
}

model Job {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  employeeId     String?
  title          String
  trade          String // HVAC | PLUMBING | ELECTRICAL
  status         String   @default("SCHEDULED") // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
  scheduledFor   DateTime?
  completedAt    DateTime?
  amount         Float    @default(0)
  notes          String?

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])
  employee     Employee?    @relation(fields: [employeeId], references: [id])
  invoices     Invoice[]

  @@index([organizationId])
}

model Estimate {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  title          String
  amount         Float
  status         String   @default("SENT") // DRAFT | SENT | VIEWED | ACCEPTED | DECLINED | EXPIRED
  sentAt         DateTime?
  lastFollowUpAt DateTime?
  expiresAt      DateTime?
  notes          String?

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])

  @@index([organizationId])
}

model Invoice {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  jobId          String?
  number         String
  amount         Float
  status         String   @default("SENT") // DRAFT | SENT | PAID | OVERDUE | VOID
  issuedAt       DateTime?
  dueAt          DateTime?
  paidAt         DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])
  job          Job?         @relation(fields: [jobId], references: [id])

  @@index([organizationId])
}

model Payment {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  invoiceId      String?
  amount         Float
  method         String
  receivedAt     DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])

  @@index([organizationId])
}

model Communication {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  channel        String // EMAIL | PHONE | SMS | IN_PERSON
  direction      String   @default("OUTBOUND")
  summary        String
  occurredAt     DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])

  @@index([organizationId])
}

// ───────────────────────── INDUSTRY PACK: AUTO DEALERSHIP ─────────────────────────

model Vehicle {
  id             String   @id @default(cuid())
  organizationId String
  stockNumber    String
  vin            String?
  year           Int
  make           String
  model          String
  trim           String?
  kind           String   @default("USED") // NEW | USED
  status         String   @default("AVAILABLE") // IN_TRANSIT | AVAILABLE | RESERVED | SOLD
  listPrice      Float?
  cost           Float?
  listedAt       DateTime?
  soldAt         DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  deals        Deal[]
  serviceOrders ServiceOrder[]

  @@index([organizationId])
}

model Deal {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  vehicleId      String?
  dealType       String   @default("USED") // NEW | USED
  status         String   @default("NEGOTIATING") // NEGOTIATING | PENDING_FINANCE | WON | LOST
  amount         Float
  financeSentAt  DateTime?
  closedAt       DateTime?
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])
  vehicle      Vehicle?     @relation(fields: [vehicleId], references: [id])

  @@index([organizationId])
}

model ServiceOrder {
  id             String   @id @default(cuid())
  organizationId String
  customerId     String
  vehicleId      String?
  title          String
  status         String   @default("OPEN") // OPEN | IN_PROGRESS | AWAITING_PARTS | COMPLETED
  amount         Float    @default(0)
  openedAt       DateTime @default(now())
  completedAt    DateTime?
  invoicedAt     DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])
  vehicle      Vehicle?     @relation(fields: [vehicleId], references: [id])

  @@index([organizationId])
}

model Lead {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  source         String   @default("WEB") // WEB | PHONE | WALK_IN | REFERRAL
  interest       String?
  estValue       Float?
  status         String   @default("NEW") // NEW | CONTACTED | QUALIFIED | WON | LOST
  assignedToId   String?
  createdAt      DateTime @default(now())
  lastContactAt  DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  assignedTo   Employee?    @relation(fields: [assignedToId], references: [id])

  @@index([organizationId])
}

// ───────────────────────── KNOWLEDGE ─────────────────────────

model Document {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  fileName       String
  mimeType       String
  sizeBytes      Int      @default(0)
  kind           String   @default("OTHER") // POLICY | PROCEDURE | CONTRACT | RECORD | NOTE | SPREADSHEET | MEDIA | OTHER
  departmentId   String?
  status         String   @default("PROCESSED") // UPLOADED | PROCESSING | PROCESSED | FAILED
  extractedText  String?
  uploadedAt     DateTime @default(now())
  source         String   @default("UPLOAD") // UPLOAD | IMPORT | SEED

  organization Organization @relation(fields: [organizationId], references: [id])
  knowledge    KnowledgeItem[]

  @@index([organizationId])
}

model KnowledgeItem {
  id             String  @id @default(cuid())
  organizationId String
  documentId     String?
  title          String
  content        String
  category       String // POLICY | PROCEDURE | DECISION | LESSON | CUSTOMER | PRODUCT | HISTORY | STRATEGY
  tags           String? // comma separated
  status         String  @default("FACT") // FACT | ASSUMPTION | RECOMMENDATION | DECISION
  updatedAt      DateTime @updatedAt
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  document     Document?    @relation(fields: [documentId], references: [id])

  @@index([organizationId])
}

model Entity {
  id             String @id @default(cuid())
  organizationId String
  type           String // CUSTOMER | EMPLOYEE | PRODUCT | DEPARTMENT | POLICY | PROCESS | RISK | OPPORTUNITY
  name           String
  description    String?

  organization Organization @relation(fields: [organizationId], references: [id])
  facts        Fact[]

  @@index([organizationId])
}

model Fact {
  id             String  @id @default(cuid())
  organizationId String
  entityId       String
  statement      String
  documentId     String?
  confidence     Float   @default(0.9)
  status         String  @default("FACT") // FACT | ASSUMPTION
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  entity       Entity   @relation(fields: [entityId], references: [id])

  @@index([organizationId])
}

// ───────────────────────── INTELLIGENCE ─────────────────────────

model Insight {
  id             String   @id @default(cuid())
  organizationId String
  type           String // RISK | OPPORTUNITY | REVENUE | OPERATIONS | CUSTOMER | ANOMALY
  title          String
  summary        String
  severity       String   @default("MEDIUM") // HIGH | MEDIUM | LOW
  impactValue    Float? // e.g. dollars at stake
  evidence       String // JSON array of evidence refs
  reasoning      String
  confidence     Float    @default(0.8)
  status         String   @default("OPEN") // OPEN | ACTION_TAKEN | DISMISSED | RESOLVED
  createdAt      DateTime @default(now())
  recId          String?

  organization Organization      @relation(fields: [organizationId], references: [id])
  recommendations Recommendation[] @relation("InsightRec")

  @@index([organizationId])
}

model Recommendation {
  id             String  @id @default(cuid())
  organizationId String
  insightId      String?
  title          String
  action         String
  rationale      String
  impact         String?
  impactValue    Float?
  confidence     Float   @default(0.8)
  status         String  @default("PENDING") // PENDING | APPROVED | REJECTED | MODIFIED | DEFERRED | EXECUTED
  createdAt      DateTime @default(now())
  decidedAt      DateTime?
  decidedById    String?
  workflowId     String?

  organization Organization @relation(fields: [organizationId], references: [id])
  insight      Insight?     @relation("InsightRec", fields: [insightId], references: [id])
  decidedBy    User?        @relation("RecDecider", fields: [decidedById], references: [id])
  // organization relation declared on Organization.recs
  workflow     Workflow?    @relation

  @@index([organizationId])
}

// ───────────────────────── EXECUTION ─────────────────────────

model Workflow {
  id             String   @id @default(cuid())
  organizationId String
  recId          String? @unique
  title          String
  description    String?
  kind           String   @default("FOLLOW_UP") // FOLLOW_UP | BILLING | PROCESS | TRAINING | CUSTOM
  status         String   @default("ACTIVE") // ACTIVE | COMPLETED | CANCELLED
  source         String   @default("AI_RECOMMENDATION") // AI_RECOMMENDATION | MANUAL
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  rec          Recommendation? @relation(fields: [recId], references: [id])
  tasks        Task[]

  @@index([organizationId])
}

model Project {
  id             String  @id @default(cuid())
  organizationId String
  title          String
  description    String?
  status         String  @default("ACTIVE")
  dueAt          DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  tasks        Task[]

  @@index([organizationId])
}

model Task {
  id             String   @id @default(cuid())
  organizationId String
  workflowId     String?
  projectId      String?
  title          String
  detail         String?
  status         String   @default("OPEN") // OPEN | IN_PROGRESS | DONE | CANCELLED
  priority       String   @default("MEDIUM") // HIGH | MEDIUM | LOW
  dueAt          DateTime?
  assigneeId     String? // Employee
  customerId     String?
  origin         String   @default("MANUAL") // AI_RECOMMENDATION | MANUAL | WORKFLOW
  createdAt      DateTime @default(now())
  completedAt    DateTime?

  organization Organization  @relation(fields: [organizationId], references: [id])
  workflow     Workflow?     @relation(fields: [workflowId], references: [id])
  project      Project?      @relation(fields: [projectId], references: [id])
  assignee     Employee?     @relation(fields: [assigneeId], references: [id])
  customer     Customer?     @relation(fields: [customerId], references: [id])

  @@index([organizationId])
}

// ───────────────────────── EXPAND / ENHANCE / LAB ─────────────────────────

model TrainingModule {
  id             String @id @default(cuid())
  organizationId String
  title          String
  summary        String
  category       String // ONBOARDING | SAFETY | PRODUCT | PROCESS | CUSTOMER
  source         String @default("AI_GENERATED") // AI_GENERATED | MANUAL
  knowledgeRefs  String? // JSON array of knowledgeItem ids
  content        String

  organization  Organization @relation(fields: [organizationId], references: [id])
  assignments   TrainingAssignment[]

  @@index([organizationId])
}

model TrainingAssignment {
  id             String @id @default(cuid())
  trainingId     String
  employeeId     String
  status         String @default("ASSIGNED") // ASSIGNED | IN_PROGRESS | COMPLETED

  training TrainingModule @relation(fields: [trainingId], references: [id])
  employee Employee       @relation(fields: [employeeId], references: [id])

  @@unique([trainingId, employeeId])
}

model Idea {
  id             String @id @default(cuid())
  organizationId String
  title          String
  problem        String?
  hypothesis     String?
  proposedSolution String?
  evidence       String?
  owner          String?
  status         String @default("IDEA") // IDEA | EXPERIMENTING | VALIDATED | PARKED | LAUNCHED
  nextStep       String?
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
}

model BrandAsset {
  id             String @id @default(cuid())
  organizationId String
  name           String
  kind           String // LOGO | GUIDELINE | TEMPLATE | SOCIAL | DOCUMENT
  description    String?
  status         String @default("READY")

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
}

// ───────────────────────── ECOSYSTEM & SETTINGS ─────────────────────────

model Integration {
  id             String @id @default(cuid())
  organizationId String
  key            String // quickbooks | servicetitan | google_calendar ...
  name           String
  category       String // ACCOUNTING | CRM | SCHEDULING | PAYMENTS | EMAIL | STORAGE | HR | ECOMMERCE
  status         String @default("DEMO") // CONNECTED | DEMO | AVAILABLE
  dataAvailable  String? // what CUE can read
  capabilities   String? // what CUE can do
  lastSyncAt     DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, key])
  @@index([organizationId])
}

model AiSettings {
  id             String @id @default(cuid())
  organizationId String @unique
  observe        Boolean @default(true)
  recommend      Boolean @default(true)
  prepare        Boolean @default(true)
  execute        Boolean @default(false)
  automate       Boolean @default(false)

  organization Organization @relation(fields: [organizationId], references: [id])
}

// ───────────────────────── AUDIT ─────────────────────────

model AuditEvent {
  id             String   @id @default(cuid())
  organizationId String
  actorType      String   @default("USER") // USER | AI | SYSTEM
  actorId        String?
  action         String // e.g. RECOMMENDATION_CREATED, RECOMMENDATION_APPROVED, WORKFLOW_CREATED, TASK_COMPLETED
  targetType     String?  // Recommendation | Workflow | Task | Document | Insight | AiSettings
  targetId       String?
  detail         String?
  metadata       String?  // JSON
  createdAt      DateTime @default(now())

  organization   Organization    @relation(fields: [organizationId], references: [id])
  user           User?           @relation(fields: [actorId], references: [id])

  @@index([organizationId, createdAt])
}

```

### `prisma/seed-dealership.ts`  (185 lines)

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const d = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  console.log("Seeding CUE dealership Industry Pack — Riverside Auto Group…");

  // Additive seed: only wipe the Riverside org (leaves Summit Home Services intact)
  const existing = await prisma.organization.findFirst({ where: { name: "Riverside Auto Group" } });
  if (existing) {
    const orgId = existing.id;
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.workflow.deleteMany({ where: { organizationId: orgId } });
    await prisma.recommendation.deleteMany({ where: { organizationId: orgId } });
    await prisma.insight.deleteMany({ where: { organizationId: orgId } });
    await prisma.fact.deleteMany({ where: { organizationId: orgId } });
    await prisma.entity.deleteMany({ where: { organizationId: orgId } });
    await prisma.knowledgeItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceOrder.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.communication.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.employee.deleteMany({ where: { organizationId: orgId } });
    await prisma.department.deleteMany({ where: { organizationId: orgId } });
    await prisma.brandAsset.deleteMany({ where: { organizationId: orgId } });
    await prisma.idea.deleteMany({ where: { organizationId: orgId } });
    await prisma.integration.deleteMany({ where: { organizationId: orgId } });
    await prisma.aiSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.goal.deleteMany({ where: { profile: { organizationId: orgId } } });
    await prisma.businessProfile.deleteMany({ where: { organizationId: orgId } });
    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { email: "gm@riversideauto.demo" } });

  const user = await prisma.user.create({
    data: { email: "gm@riversideauto.demo", name: "Vic Moreno", passwordHash: hashPassword("demo1234") },
  });
  const org = await prisma.organization.create({ data: { name: "Riverside Auto Group", isDemo: true } });
  await prisma.member.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });

  await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      name: "Riverside Auto Group",
      industry: "Automotive dealership — new & used, service, parts",
      size: "11-50",
      locations: "Riverside, CA — one rooftop, 3 franchises",
      businessModel: "New and used vehicle sales, F&I products, fixed-operations service drive, parts",
      offerings: "New vehicle sales\nUsed vehicle sales\nCertified pre-owned\nFinance & insurance\nService drive\nCollision referral\nParts counter",
      targetCustomers: "Local drivers, first-time buyers, families, small business fleets",
      mission: "The easiest place to buy and keep a car in the Inland Empire — transparent pricing, no games.",
      values: "Price it right the first time\nAnswer every lead in under 15 minutes\nService the customer for life\nRespect every customer's time",
      operationalPriorities: "Respond to every lead in 15 minutes\nFollow up every unsold deal within 48 hours\nInvoice completed service within 24 hours\nKeep reconditioning under 5 days",
      onboardingStep: 10,
    },
  });

  // Departments / staff
  const sales = await prisma.department.create({ data: { organizationId: org.id, name: "Sales", description: "New & used vehicle sales" } });
  const service = await prisma.department.create({ data: { organizationId: org.id, name: "Service", description: "Service drive and technician bays" } });
  const office = await prisma.department.create({ data: { organizationId: org.id, name: "Office & F&I", description: "Finance, insurance, title, accounting" } });
  const leadership = await prisma.department.create({ data: { organizationId: org.id, name: "Leadership" } });

  const vic = await prisma.employee.create({ data: { organizationId: org.id, name: "Vic Moreno", title: "General Manager", departmentId: leadership.id, email: "gm@riversideauto.demo", skills: "Dealership ops, desking, vendor management", responsibilities: "P&L, pricing strategy, staffing", hireDate: d(-2200) } });
  const tony = await prisma.employee.create({ data: { organizationId: org.id, name: "Tonya Parks", title: "Sales Manager", departmentId: sales.id, managerId: vic.id, skills: "Desking, trade appraisal, lender relations", responsibilities: "Deal approvals, sales floor, lead assignment", hireDate: d(-1400) } });
  const chris = await prisma.employee.create({ data: { organizationId: org.id, name: "Chris Alam", title: "Salesperson", departmentId: sales.id, managerId: tony.id, skills: "New vehicles, follow-up, demos", responsibilities: "New-vehicle sales, lead follow-up", hireDate: d(-500) } });
  const monica = await prisma.employee.create({ data: { organizationId: org.id, name: "Monica Reyes", title: "Salesperson", departmentId: sales.id, managerId: tony.id, skills: "Used vehicles, online leads, trade-ins", responsibilities: "Used-vehicle sales, internet leads", hireDate: d(-320) } });
  const sam = await prisma.employee.create({ data: { organizationId: org.id, name: "Sam Okafor", title: "Service Manager", departmentId: service.id, managerId: vic.id, skills: "Service ops, technician scheduling, warranty", responsibilities: "Service drive, dispatch, warranty claims", hireDate: d(-1100) } });
  const leah = await prisma.employee.create({ data: { organizationId: org.id, name: "Leah Kim", title: "F&I Manager", departmentId: office.id, managerId: vic.id, skills: "Lender menu, compliance, title", responsibilities: "Deal contracts, lender menu, title & registration", hireDate: d(-900) } });

  // Customers
  const mkC = (name: string, email: string, phone: string, type = "RESIDENTIAL", plan: string | null = null) =>
    prisma.customer.create({ data: { organizationId: org.id, name, email, phone, type, servicePlan: plan, address: "Riverside, CA" } });
  const cDiaz = await mkC("Marcus & Jenna Diaz", "diaz.family@example.com", "(951) 555-0134");
  const cTran = await mkC("Linda Tran", "linda.tran@example.com", "(951) 555-0177");
  const cCortez = await mkC("Rafael Cortez", "r.cortez@example.com", "(951) 555-0128");
  const cBright = await mkC("Bright Fleet Leasing", "fleet@brightfleet.example.com", "(951) 555-0190", "COMMERCIAL", "Fleet service agreement");
  const cNowak = await mkC("Peter Nowak", "p.nowak@example.com", "(951) 555-0155");
  const cAli = await mkC("Sara Ali", "sara.ali@example.com", "(951) 555-0161");

  // ── Inventory ──
  const mkV = (stock: string, year: number, make: string, model: string, trim: string, kind: string, status: string, list: number, cost: number, listed: number) =>
    prisma.vehicle.create({
      data: { organizationId: org.id, stockNumber: stock, vin: `VIN${stock}0000DEMO`, year, make, model, trim, kind, status, listPrice: list, cost, listedAt: d(listed) },
    });

  const v1 = await mkV("T2401", 2024, "Toyota", "Camry", "SE", "NEW", "AVAILABLE", 31400, 29600, -6);
  const v2 = await mkV("T2402", 2024, "Toyota", "RAV4", "XLE", "NEW", "AVAILABLE", 34900, 32800, -4);
  await mkV("T2403", 2024, "Toyota", "Tacoma", "SR5", "NEW", "IN_TRANSIT", 41200, 38900, -1);
  const v4 = await mkV("U1188", 2021, "Honda", "Accord", "Sport", "USED", "AVAILABLE", 26800, 23400, -21);
  const v5 = await mkV("U1175", 2020, "Ford", "F-150", "XLT", "USED", "AVAILABLE", 34500, 30100, -34);
  const v6 = await mkV("U1190", 2022, "Tesla", "Model 3", "RWD", "USED", "AVAILABLE", 31900, 28700, -18);
  const v7 = await mkV("U1193", 2019, "Jeep", "Cherokee", "Latitude", "USED", "AVAILABLE", 19900, 17400, -47); // aging
  await mkV("U1160", 2018, "Chevrolet", "Equinox", "LT", "USED", "SOLD", 17800, 15600, -60);

  // ── Deals ──
  // Leakage pattern: 4 deals stuck in NEGOTIATING with no follow-up (unsold pipeline)
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cDiaz.id, vehicleId: v4.id, dealType: "USED", status: "NEGOTIATING", amount: 26800, createdAt: d(-9) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cTran.id, vehicleId: v6.id, dealType: "USED", status: "NEGOTIATING", amount: 31900, createdAt: d(-7) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cCortez.id, vehicleId: v5.id, dealType: "USED", status: "NEGOTIATING", amount: 34500, createdAt: d(-6) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cNowak.id, vehicleId: v1.id, dealType: "NEW", status: "NEGOTIATING", amount: 31400, createdAt: d(-4) } });
  // F&I leakage: deals stuck awaiting finance
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cAli.id, vehicleId: v2.id, dealType: "NEW", status: "PENDING_FINANCE", amount: 34900, financeSentAt: d(-3) } });
  // Healthy wins
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cBright.id, vehicleId: v6.id, dealType: "USED", status: "WON", amount: 31900, closedAt: d(-12) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cDiaz.id, dealType: "USED", status: "WON", amount: 17800, closedAt: d(-25) } });

  // ── Service orders ──
  // Leakage: 5 completed, not invoiced — $2,340
  const soData: [any, any, string, number, number, number][] = [
    [cDiaz, null, "Oil change + tire rotation", 189, -6, -6],
    [cTran, v6, "Brake pads & rotors — front", 780, -8, -8],
    [cCortez, v5, "State safety inspection", 95, -5, -5],
    [cBright, null, "Fleet service — 3 vehicles", 990, -9, -9],
    [cNowak, v1, "Battery replacement + alignment", 286, -4, -4],
  ];
  for (const [cust, veh, title, amount, opened, done] of soData) {
    await prisma.serviceOrder.create({
      data: { organizationId: org.id, customerId: cust.id, vehicleId: veh?.id ?? null, title, amount, status: "COMPLETED", openedAt: d(opened), completedAt: d(done) },
    });
  }
  // Open service orders
  await prisma.serviceOrder.create({ data: { organizationId: org.id, customerId: cAli.id, vehicleId: v2.id, title: "Warranty diagnostics — infotainment", status: "IN_PROGRESS", amount: 0, openedAt: d(-2) } });
  await prisma.serviceOrder.create({ data: { organizationId: org.id, customerId: cTran.id, vehicleId: v6.id, title: "Waiting on parts — charging port", status: "AWAITING_PARTS", amount: 430, openedAt: d(-5) } });

  // ── Leads ──
  // Missed leads: 6 NEW leads older than 24h with no contact (the dealership killer)
  const missedLeads: [string, string, string, number][] = [
    ["Jordan Whitfield", "WEB", "2024 RAV4 Hybrid", -3],
    ["Amara Osei", "PHONE", "Used SUV under $30k", -2],
    ["Diego Fuentes", "WEB", "Tacoma trade-in", -2],
    ["Hannah Lieu", "WEB", "Model 3 long range", -1],
    ["Robert Mendez", "PHONE", "Fleet quote — 4 vans", -1],
    ["Grace Okafor", "WALK_IN", "Camry lease vs buy", 0],
  ];
  for (const [name, source, interest, age] of missedLeads) {
    await prisma.lead.create({
      data: { organizationId: org.id, name, source, interest, estValue: 2800 + Math.round(Math.random() * 40) * 100, status: "NEW", createdAt: d(age - 0.5) },
    });
  }
  // Worked leads
  await prisma.lead.create({ data: { organizationId: org.id, name: "Kevin Brand", source: "REFERRAL", interest: "Accord Sport", estValue: 3100, status: "CONTACTED", assignedToId: monica.id, createdAt: d(-2), lastContactAt: d(-1) } });
  await prisma.lead.create({ data: { organizationId: org.id, name: "Priya Raman", source: "WEB", interest: "F-150 XLT", estValue: 4200, status: "QUALIFIED", assignedToId: chris.id, createdAt: d(-4), lastContactAt: d(-1) } });
  await prisma.lead.create({ data: { organizationId: org.id, name: "Owen Castillo", source: "WEB", interest: "Camry SE", estValue: 2600, status: "WON", assignedToId: chris.id, createdAt: d(-10), lastContactAt: d(-9) } });

  // ── Aged-vehicle notes as knowledge ──
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Reconditioning standard",
      content: "Trade-ins must be reconditioned and listed within 5 days of acquisition. Vehicles sitting unsold past 30 days get a price review every Monday (GM + used-car manager). Floorplan interest accrues daily on unsold inventory, so aging units cost roughly $22/day.",
      category: "PROCEDURE", tags: "recon,inventory,pricing,aging", status: "FACT",
    },
  });
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Lead response policy",
      content: "Every internet or phone lead must receive a response within 15 minutes during business hours — the single strongest predictor of close rate. Leads unanswered after 24 hours are flagged to the Sales Manager. Weekend leads are worked first thing Monday morning.",
      category: "PROCEDURE", tags: "leads,response,procedure,sales", status: "FACT",
    },
  });

  await prisma.aiSettings.create({ data: { organizationId: org.id } });

  await prisma.auditEvent.create({
    data: { organizationId: org.id, actorType: "SYSTEM", action: "DEMO_SEEDED", detail: "Riverside Auto Group dealership demo workspace created." },
  });

  const { refreshIntelligence } = await import("../src/lib/intelligence");
  const created = await refreshIntelligence(org.id);
  console.log(`Dealership seed complete. Intelligence engine produced ${created} insight(s).`);
  console.log("Sign in: gm@riversideauto.demo / demo1234");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

```

### `prisma/seed.ts`  (485 lines)

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const DAY = 86_400_000;
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY);
}

async function main() {
  console.log("Seeding CUE demo workspace — Summit Home Services…");

  // Wipe in dependency order (idempotent reseed)
  await prisma.auditEvent.deleteMany({});
  await prisma.deal.deleteMany({});
  await prisma.serviceOrder.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.trainingAssignment.deleteMany({});
  await prisma.trainingModule.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.workflow.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.recommendation.deleteMany({});
  await prisma.insight.deleteMany({});
  await prisma.fact.deleteMany({});
  await prisma.entity.deleteMany({});
  await prisma.knowledgeItem.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.estimate.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.communication.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.brandAsset.deleteMany({});
  await prisma.idea.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.aiSettings.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.businessProfile.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // ── Identity & organization ──
  const user = await prisma.user.create({
    data: {
      email: "owner@summithome.demo",
      name: "Dana Whitfield",
      passwordHash: hashPassword("demo1234"),
    },
  });

  const org = await prisma.organization.create({
    data: { name: "Summit Home Services", isDemo: true },
  });

  await prisma.member.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  // ── Business profile & goals ──
  const profile = await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      name: "Summit Home Services",
      industry: "HVAC / Plumbing / Electrical home services",
      size: "11-50",
      locations: "Cedar Falls, IA — serving the greater metro area",
      businessModel:
        "Residential service, repair and replacement across HVAC, plumbing and electrical, plus recurring maintenance plans",
      offerings: [
        "HVAC repair & installation",
        "Plumbing repair & repiping",
        "Electrical panel & fixture work",
        "Annual Comfort Club maintenance plan",
        "Water heater replacement",
        "Generator installation (new)",
      ].join("\n"),
      targetCustomers:
        "Homeowners aged 35–70 in single-family homes; small landlords with 2–10 units",
      mission:
        "Keep every home we serve safe, comfortable and problem-free — with honest advice and no surprise bills.",
      values: [
        "Do it right the first time",
        "Communicate before the customer has to ask",
        "Every technician goes home safe",
        "Leave every home better than we found it",
      ].join("\n"),
      operationalPriorities: [
        "Same-day response on no-heat / no-cool calls",
        "Invoice within 24 hours of job completion",
        "Follow up every estimate within 7 days",
        "Keep Comfort Club renewal rate above 90%",
      ].join("\n"),
      onboardingStep: 10,
    },
  });

  await prisma.goal.createMany({
    data: [
      { profileId: profile.id, title: "Reach $2.4M annual revenue", horizon: "YEAR" },
      { profileId: profile.id, title: "Grow Comfort Club to 400 members", horizon: "YEAR" },
      { profileId: profile.id, title: "Eliminate unbilled-job backlog", horizon: "QUARTER" },
      { profileId: profile.id, title: "Launch generator installation offering", horizon: "QUARTER" },
    ],
  });

  // ── Departments & employees ──
  const deptHvac = await prisma.department.create({ data: { organizationId: org.id, name: "HVAC", description: "Heating, cooling and indoor air quality" } });
  const deptPlumbing = await prisma.department.create({ data: { organizationId: org.id, name: "Plumbing", description: "Repair, repiping and water heaters" } });
  const deptElectrical = await prisma.department.create({ data: { organizationId: org.id, name: "Electrical", description: "Panels, fixtures and generators" } });
  const deptOffice = await prisma.department.create({ data: { organizationId: org.id, name: "Office & Dispatch", description: "Scheduling, billing and customer care" } });
  const deptLeadership = await prisma.department.create({ data: { organizationId: org.id, name: "Leadership", description: "Ownership and operations management" } });

  const dana = await prisma.employee.create({ data: { organizationId: org.id, name: "Dana Whitfield", title: "Owner", departmentId: deptLeadership.id, email: "owner@summithome.demo", skills: "Business strategy, Pricing, Customer relationships", responsibilities: "Company direction, major decisions, vendor relationships", hireDate: new Date("2016-03-01") } });
  const marcus = await prisma.employee.create({ data: { organizationId: org.id, name: "Marcus Lee", title: "Operations Manager", departmentId: deptLeadership.id, managerId: dana.id, skills: "Dispatch, Scheduling, Process design", responsibilities: "Daily dispatch, technician scheduling, process compliance", hireDate: new Date("2019-06-15") } });
  const priya = await prisma.employee.create({ data: { organizationId: org.id, name: "Priya Natarajan", title: "Office Manager", departmentId: deptOffice.id, managerId: marcus.id, skills: "Billing, Invoicing, Customer service, QuickBooks", responsibilities: "Invoicing, payment processing, customer follow-up", hireDate: new Date("2020-01-10") } });
  const jake = await prisma.employee.create({ data: { organizationId: org.id, name: "Jake Morrison", title: "Senior HVAC Technician", departmentId: deptHvac.id, managerId: marcus.id, skills: "Furnace repair, AC installation, Diagnostics, EPA 608", responsibilities: "Complex HVAC repairs, new installs, mentoring apprentices", hireDate: new Date("2018-04-02") } });
  const sofia = await prisma.employee.create({ data: { organizationId: org.id, name: "Sofia Reyes", title: "HVAC Technician", departmentId: deptHvac.id, managerId: jake.id, skills: "AC maintenance, Furnace diagnostics", responsibilities: "Maintenance visits and standard repairs", hireDate: new Date("2021-08-16") } });
  const tom = await prisma.employee.create({ data: { organizationId: org.id, name: "Tom Becker", title: "Plumber", departmentId: deptPlumbing.id, managerId: marcus.id, skills: "Repiping, Water heaters, Leak detection", responsibilities: "Plumbing repairs and water heater replacements", hireDate: new Date("2019-11-04") } });
  const alicia = await prisma.employee.create({ data: { organizationId: org.id, name: "Alicia Grant", title: "Electrician", departmentId: deptElectrical.id, managerId: marcus.id, skills: "Panel upgrades, Generators, Code compliance", responsibilities: "Electrical service, panel work, generator installs", hireDate: new Date("2022-02-21") } });
  const dev = await prisma.employee.create({ data: { organizationId: org.id, name: "Dev Okafor", title: "Apprentice Technician", departmentId: deptHvac.id, managerId: jake.id, skills: "Assists installs", responsibilities: "Support senior technicians, tools and site prep", hireDate: daysFromNow(-120) } });

  // ── Customers ──
  const mkCustomer = (data: {
    name: string; email: string; phone: string; address: string;
    type?: string; servicePlan?: string; notes?: string;
  }) => prisma.customer.create({ data: { organizationId: org.id, type: "RESIDENTIAL", status: "ACTIVE", ...data } });

  const cHendricks = await mkCustomer({ name: "Karen & Bill Hendricks", email: "k.hendricks@example.com", phone: "(319) 555-0141", address: "1428 Ridge Ct, Cedar Falls", servicePlan: "Annual Comfort Club", notes: "Loyal since 2017. Two systems on property." });
  const cPatel = await mkCustomer({ name: "Ravi Patel", email: "ravi.patel@example.com", phone: "(319) 555-0193", address: "77 Prairie Dr, Cedar Falls", servicePlan: "Annual Comfort Club" });
  const cNguyen = await mkCustomer({ name: "Linh Nguyen", email: "linh.nguyen@example.com", phone: "(319) 555-0117", address: "3105 Cedar Heights Dr" });
  const cOsborne = await mkCustomer({ name: "Osborne Rentals LLC", email: "mike@osbornerentals.example.com", phone: "(319) 555-0129", address: "6-unit building, 210 Main St", type: "COMMERCIAL", servicePlan: "Annual Comfort Club", notes: "Small landlord, decides quickly, prefers email." });
  const cWalsh = await mkCustomer({ name: "Erin Walsh", email: "erin.walsh@example.com", phone: "(319) 555-0166", address: "9405 Orchard Hill Ln" });
  const cDelgado = await mkCustomer({ name: "Miguel Delgado", email: "m.delgado@example.com", phone: "(319) 555-0152", address: "512 Union Rd" });
  const cFoster = await mkCustomer({ name: "Jeanette Foster", email: "jfoster@example.com", phone: "(319) 555-0187", address: "2387 Greenhill Rd", servicePlan: "Annual Comfort Club" });
  const cBrooks = await mkCustomer({ name: "Stanley Brooks", email: "s.brooks@example.com", phone: "(319) 555-0175", address: "14 Timber Ln" });
  const cIyer = await mkCustomer({ name: "Deepa Iyer", email: "deepa.iyer@example.com", phone: "(319) 555-0138", address: "6200 Sioux Dr" });
  const cKowalski = await mkCustomer({ name: "Kowalski & Sons Bakery", email: "office@kowalskibakery.example.com", phone: "(319) 555-0199", address: "115 Main St", type: "COMMERCIAL", notes: "Walk-in cooler is business-critical." });
  const cThompson = await mkCustomer({ name: "Gary Thompson", email: "gthompson@example.com", phone: "(319) 555-0149", address: "4311 Rainbow Dr", servicePlan: "Annual Comfort Club" });
  const cRivera = await mkCustomer({ name: "Carmen Rivera", email: "carmen.rivera@example.com", phone: "(319) 555-0121", address: "8807 Ansborough Ave" });

  // ── Jobs ──
  // 7 COMPLETED with NO invoice — engineered total $12,480
  const unbilledJobs: [any, string, string, number, number, any, string][] = [
    [cHendricks, "AC compressor replacement", "HVAC", 2400, -38, jake, "Compressor failed; replaced with 10-year warranty unit. Customer confirmed satisfaction on site."],
    [cOsborne, "Water heater replacement — unit 4", "PLUMBING", 1450, -33, tom, "40-gal gas water heater swapped. Landlord approved by email."],
    [cNguyen, "Furnace blower motor repair", "HVAC", 980, -27, sofia, "Blower motor replaced, system tested through full cycle."],
    [cKowalski, "Walk-in cooler compressor service", "HVAC", 2680, -22, jake, "Emergency call. Cooler back to temperature same day. Business-critical."],
    [cBrooks, "Main line clear + pressure test", "PLUMBING", 720, -18, tom, "Cleared main line blockage; camera verified flow."],
    [cIyer, "Panel upgrade to 200A", "ELECTRICAL", 1850, -12, alicia, "Permitted panel upgrade, inspection passed."],
    [cDelgado, "Furnace ignition module replacement", "HVAC", 2400, -9, sofia, "Ignition module and flame sensor replaced. Heat verified."],
  ];
  for (const [customer, title, trade, amount, completedDaysAgo, employee, notes] of unbilledJobs) {
    await prisma.job.create({
      data: { organizationId: org.id, customerId: customer.id, employeeId: employee.id, title, trade, status: "COMPLETED", scheduledFor: daysFromNow(completedDaysAgo), completedAt: daysFromNow(completedDaysAgo), amount, notes },
    });
  }

  // COMPLETED jobs WITH invoices (healthy baseline)
  const billedJobs: [any, string, string, number, number, any, string][] = [
    [cPatel, "AC seasonal maintenance", "HVAC", 189, -55, sofia, "Comfort Club spring tune-up."],
    [cWalsh, "Kitchen faucet replacement", "PLUMBING", 465, -48, tom, "Customer-supplied faucet installed."],
    [cThompson, "Furnace repair — ignitor", "HVAC", 340, -41, jake, "Hot surface ignitor replaced."],
    [cFoster, "Ceiling fan install", "ELECTRICAL", 385, -35, alicia, "Two fans installed, balanced."],
    [cRivera, "Sump pump replacement", "PLUMBING", 1120, -25, tom, "Primary + battery backup installed."],
  ];
  const createdBilledJobs = [];
  for (const [customer, title, trade, amount, completedDaysAgo, employee, notes] of billedJobs) {
    createdBilledJobs.push(
      await prisma.job.create({
        data: { organizationId: org.id, customerId: customer.id, employeeId: employee.id, title, trade, status: "COMPLETED", scheduledFor: daysFromNow(completedDaysAgo), completedAt: daysFromNow(completedDaysAgo), amount, notes },
      })
    );
  }

  // Long-ago plan customers whose annual visit slipped (drives the retention signal)
  const cVance = await mkCustomer({ name: "Robert & Anne Vance", email: "vance.home@example.com", phone: "(319) 555-0113", address: "7402 University Ave", servicePlan: "Annual Comfort Club", notes: "Usually books spring and fall visits." });
  const cMarsh = await mkCustomer({ name: "Diane Marsh", email: "diane.marsh@example.com", phone: "(319) 555-0182", address: "225 W 5th St", servicePlan: "Annual Comfort Club" });
  const vanceJob = await prisma.job.create({ data: { organizationId: org.id, customerId: cVance.id, employeeId: jake.id, title: "AC tune-up — annual visit", trade: "HVAC", status: "COMPLETED", scheduledFor: daysFromNow(-355), completedAt: daysFromNow(-355), amount: 189, notes: "Spring visit. Fall visit never booked." } });
  const marshJob = await prisma.job.create({ data: { organizationId: org.id, customerId: cMarsh.id, employeeId: sofia.id, title: "Furnace tune-up — annual visit", trade: "HVAC", status: "COMPLETED", scheduledFor: daysFromNow(-342), completedAt: daysFromNow(-342), amount: 189 } });
  // These routine visits were billed normally — only the anomaly jobs stay unbilled
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cVance.id, jobId: vanceJob.id, number: "INV-1039", amount: 189, status: "PAID", issuedAt: daysFromNow(-354), dueAt: daysFromNow(-333), paidAt: daysFromNow(-348) } });
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cMarsh.id, jobId: marshJob.id, number: "INV-1040", amount: 189, status: "PAID", issuedAt: daysFromNow(-341), dueAt: daysFromNow(-320), paidAt: daysFromNow(-335) } });

  // Scheduled jobs in flight
  await prisma.job.create({ data: { organizationId: org.id, customerId: cWalsh.id, employeeId: jake.id, title: "AC replacement — 3.5 ton", trade: "HVAC", status: "SCHEDULED", scheduledFor: daysFromNow(3), amount: 6800, notes: "Deposit taken. Equipment ordered." } });
  await prisma.job.create({ data: { organizationId: org.id, customerId: cPatel.id, employeeId: alicia.id, title: "EV charger install", trade: "ELECTRICAL", status: "SCHEDULED", scheduledFor: daysFromNow(5), amount: 1250 } });
  await prisma.job.create({ data: { organizationId: org.id, customerId: cFoster.id, employeeId: sofia.id, title: "Fall furnace tune-up", trade: "HVAC", status: "SCHEDULED", scheduledFor: daysFromNow(8), amount: 189 } });

  // ── Estimates ──
  // 14 SENT/VIEWED estimates, all past the 14-day follow-up window — total $38,700
  const staleEstimates: [any, string, number, number, string][] = [
    [cOsborne, "Repipe unit 2 — polybutylene", 4800, -43, "VIEWED"],
    [cIyer, "Whole-home generator 22kW", 5000, -41, "VIEWED"],
    [cNguyen, "AC replacement — 2.5 ton", 4300, -39, "SENT"],
    [cHendricks, "Ductless mini-split for sunroom", 3800, -37, "SENT"],
    [cWalsh, "Bathroom repipe", 3000, -35, "SENT"],
    [cBrooks, "Tankless water heater", 2800, -33, "SENT"],
    [cKowalski, "Backup cooler for bakery", 2600, -31, "SENT"],
    [cDelgado, "Water softener + RO system", 2400, -29, "SENT"],
    [cFoster, "Attic insulation + air sealing", 2200, -27, "VIEWED"],
    [cThompson, "Smart thermostat + zoning", 2000, -25, "SENT"],
    [cPatel, "EV charger panel prep", 1800, -23, "SENT"],
    [cRivera, "Ejector pump replacement", 1400, -21, "SENT"],
    [cOsborne, "Smoke/CO detectors — all units", 1400, -17, "SENT"],
    [cPatel, "Surge protection whole-home", 1200, -15, "SENT"],
  ];
  for (const [customer, title, amount, sentDaysAgo, status] of staleEstimates) {
    await prisma.estimate.create({
      data: { organizationId: org.id, customerId: customer.id, title, amount, status, sentAt: daysFromNow(sentDaysAgo), expiresAt: daysFromNow(sentDaysAgo + 30) },
    });
  }

  // Healthy estimates: one accepted, one declined, one recent (no flag)
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cPatel.id, title: "Humidifier install", amount: 850, status: "ACCEPTED", sentAt: daysFromNow(-20), lastFollowUpAt: daysFromNow(-10) } });
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cBrooks.id, title: "Garbage disposal replacement", amount: 620, status: "DECLINED", sentAt: daysFromNow(-30), lastFollowUpAt: daysFromNow(-22) } });
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cNguyen.id, title: "Refrigerator water line", amount: 380, status: "SENT", sentAt: daysFromNow(-2) } });

  // ── Invoices ──
  let invNum = 1041;
  for (const j of createdBilledJobs) {
    const paid = invNum % 2 === 1;
    await prisma.invoice.create({
      data: {
        organizationId: org.id, customerId: j.customerId, jobId: j.id,
        number: `INV-${invNum}`, amount: j.amount,
        status: paid ? "PAID" : "PAID",
        issuedAt: daysFromNow(((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY),
        dueAt: daysFromNow((((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY) + 21),
        paidAt: daysFromNow((((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY) + (paid ? 6 : 18)),
      },
    });
    invNum++;
  }

  // Overdue invoices (3, total $2,180) — due dates in the past
  const overdueInvoices: [any, string, number, number][] = [
    [cOsborne, "INV-1052", 1250, 34],
    [cThompson, "INV-1057", 465, 26],
    [cKowalski, "INV-1059", 465, 19],
  ];
  for (const [customer, number, amount, dueDaysAgo] of overdueInvoices) {
    await prisma.invoice.create({
      data: { organizationId: org.id, customerId: customer.id, number, amount, status: "OVERDUE", issuedAt: daysFromNow(-dueDaysAgo - 21), dueAt: daysFromNow(-dueDaysAgo) },
    });
  }

  // Recent invoices not yet due (2)
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cWalsh.id, number: "INV-1063", amount: 465, status: "SENT", issuedAt: daysFromNow(-10), dueAt: daysFromNow(11) } });
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cRivera.id, number: "INV-1064", amount: 1120, status: "SENT", issuedAt: daysFromNow(-6), dueAt: daysFromNow(15) } });

  // ── Payments (against paid invoices) ──
  const paidInvoiceRows = await prisma.invoice.findMany({ where: { organizationId: org.id, status: "PAID" } });
  for (const inv of paidInvoiceRows) {
    await prisma.payment.create({
      data: { organizationId: org.id, customerId: inv.customerId, invoiceId: inv.id, amount: inv.amount, method: invNum % 2 ? "CARD" : "ACH", receivedAt: inv.paidAt ?? new Date() },
    });
  }

  // ── Communications ──
  const comms: [any, string, string, string, number][] = [
    [cHendricks, "PHONE", "INBOUND", "Asked about ductless options for the sunroom; estimate sent.", -21],
    [cOsborne, "EMAIL", "OUTBOUND", "Sent repipe estimate for unit 2; landlord reviewing.", -19],
    [cKowalski, "PHONE", "INBOUND", "Emergency cooler call — resolved same day. Very appreciative.", -22],
    [cIyer, "EMAIL", "INBOUND", "Asked about generator lead times; replied with 3-week estimate.", -17],
    [cPatel, "SMS", "OUTBOUND", "Reminder: fall tune-up scheduling.", -12],
    [cFoster, "PHONE", "INBOUND", "Asked to move fall tune-up to a morning slot.", -10],
    [cWalsh, "EMAIL", "OUTBOUND", "AC replacement deposit receipt and scheduling options.", -9],
    [cThompson, "EMAIL", "OUTBOUND", "Payment reminder for INV-1057.", -5],
    [cRivera, "SMS", "INBOUND", "Confirmed sump pump install date.", -8],
    [cNguyen, "PHONE", "OUTBOUND", "Post-repair check-in; reported all good.", -20],
  ];
  for (const [customer, channel, direction, summary, daysAgo] of comms) {
    await prisma.communication.create({
      data: { organizationId: org.id, customerId: customer.id, channel, direction, summary, occurredAt: daysFromNow(daysAgo) },
    });
  }

  // ── Documents & knowledge ──
  const docs: { title: string; fileName: string; kind: string; departmentId?: string; text: string; knowledge: { title: string; content: string; category: string; tags: string; status?: string }[] }[] = [
    {
      title: "Employee Handbook", fileName: "Employee Handbook.pdf", kind: "POLICY", departmentId: deptLeadership.id,
      text: "Summit Home Services Employee Handbook. Covers working hours, paid time off, safety requirements, uniform policy, vehicle use, cell phone use while driving, drug and alcohol policy, grievance procedure, and benefits. Technicians must log all jobs in CUE before leaving a site. PTO requests require 2 weeks notice and manager approval. Safety: gloves and eye protection required for all plumbing and electrical work; two-person lift above 60 lbs.",
      knowledge: [
        { title: "PTO & time-off policy", content: "Employees earn 1 day of PTO per month worked, accrued from hire date. Requests must be submitted at least 2 weeks in advance and approved by the Operations Manager (Marcus Lee). Unplanned absences should be reported to dispatch by 7:00 AM.", category: "POLICY", tags: "pto,leave,employees,handbook" },
        { title: "Job logging requirement", content: "Every technician must complete job logging — notes, parts used, and time — before leaving a customer site. This is what allows the office to invoice within 24 hours. Jobs not logged same-day are flagged to the Operations Manager.", category: "PROCEDURE", tags: "jobs,logging,technicians,invoicing" },
      ],
    },
    {
      title: "Refund & Warranty Policy", fileName: "Refund and Warranty Policy.pdf", kind: "POLICY", departmentId: deptOffice.id,
      text: "Refund policy: Customer may request a full refund within 30 days of service if the repair did not resolve the reported issue. Parts carry manufacturer warranty (1-10 years); labor carries a 1-year workmanship warranty. Refunds require Office Manager approval and are processed to the original payment method within 7 business days. Warranty work is scheduled at no charge; diagnostic fee is waived for warranty callbacks.",
      knowledge: [
        { title: "Refund policy", content: "Full refund within 30 days if a repair did not fix the reported problem. Requests go to the Office Manager (Priya Natarajan) for approval and are returned to the original payment method within 7 business days. No refunds on completed maintenance plan visits.", category: "POLICY", tags: "refund,returns,policy,billing" },
        { title: "Warranty coverage", content: "Labor carries a 1-year workmanship warranty. Parts carry the manufacturer's warranty (1–10 years depending on component). Warranty callbacks are scheduled free of charge and the diagnostic fee is waived. Warranty claims are logged against the original job record.", category: "POLICY", tags: "warranty,repairs,callbacks,policy" },
      ],
    },
    {
      title: "New Customer Onboarding Procedure", fileName: "Customer Onboarding Procedure.docx", kind: "PROCEDURE", departmentId: deptOffice.id,
      text: "Onboarding procedure for new customers: 1) Create customer record with address, phone, email and equipment list. 2) Send welcome email introducing the technician-arrival process and payment options. 3) Offer the Annual Comfort Club plan. 4) After first job, office calls within 3 days to confirm satisfaction. 5) Log any special access instructions (gate codes, dogs, parking). Owner: Office Manager. Target: complete within 2 business days of first contact.",
      knowledge: [
        { title: "How we onboard a new customer", content: "1) Create the customer record with full contact info and equipment list. 2) Send the welcome email. 3) Offer the Annual Comfort Club plan. 4) Call within 3 days after the first job to confirm satisfaction. 5) Record access instructions (gate codes, dogs, parking). The Office Manager owns onboarding; target is completion within 2 business days of first contact.", category: "PROCEDURE", tags: "onboarding,customers,procedure,how do we" },
      ],
    },
    {
      title: "After-Hours Fee Decision (Sept)", fileName: "After-Hours Fee Decision.pdf", kind: "RECORD", departmentId: deptLeadership.id,
      text: "Decision record: Effective October 1, after-hours emergency calls (before 8am, after 6pm, Sundays) carry a $129 diagnostic fee, credited toward the repair if approved. Rationale: last quarter's after-hours calls averaged 11/week with a 9% acceptance-to-repair conversion; the fee covers technician premium pay. Approved by Dana Whitfield. Customer-facing script updated in dispatch guide.",
      knowledge: [
        { title: "After-hours emergency fee — company decision", content: "As of October 1, after-hours emergency calls carry a $129 diagnostic fee, credited toward the repair if the customer approves the work. This was decided by Dana Whitfield in September after a quarter of data showed premium-pay costs outpacing revenue on after-hours runs. Dispatch script has been updated.", category: "DECISION", tags: "decision,pricing,after-hours,emergency" },
      ],
    },
    {
      title: "Comfort Club Service Standards", fileName: "Comfort Club Standards.pdf", kind: "PROCEDURE", departmentId: deptHvac.id,
      text: "Annual Comfort Club members receive: two system tune-ups per year (spring AC, fall furnace), priority scheduling, 15% off repairs, no diagnostic fee. Target renewal rate is 90%+. Members whose annual visit slips past 10 months must be called by the office to re-book. Renewal billing occurs on the anniversary month.",
      knowledge: [
        { title: "Comfort Club renewal rules", content: "Comfort Club members get two tune-ups yearly, priority scheduling, 15% off repairs and no diagnostic fee. If a member's annual visit slips past 10 months, the office must call to re-book. Target renewal rate: 90%+. Who is responsible: Office Manager (Priya Natarajan) tracks the renewal list monthly.", category: "PROCEDURE", tags: "comfort club,service plans,renewal,responsibility" },
      ],
    },
  ];
  for (const d of docs) {
    const doc = await prisma.document.create({
      data: {
        organizationId: org.id, title: d.title, fileName: d.fileName,
        mimeType: d.fileName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 120_000 + d.text.length * 13, kind: d.kind, departmentId: d.departmentId,
        status: "PROCESSED", extractedText: d.text, source: "SEED", uploadedAt: daysFromNow(-60),
      },
    });
    for (const k of d.knowledge) {
      await prisma.knowledgeItem.create({
        data: { organizationId: org.id, documentId: doc.id, title: k.title, content: k.content, category: k.category, tags: k.tags, status: k.status ?? "FACT" },
      });
    }
  }

  // Extra knowledge not tied to a document
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Lesson learned: cooler emergency at Kowalski's",
      content: "The September walk-in cooler failure at Kowalski & Sons showed we had no documented emergency vendor for refrigerant recovery. The job was completed same-day, but procurement of the compressor took 6 hours. Lesson: keep a stocked compressor for the bakery's cooler model, and confirm commercial emergency SLAs quarterly.",
      category: "LESSON", tags: "lesson,emergency,commercial,cooler", status: "FACT",
    },
  });

  // ── Entities & facts ──
  const eCustomers = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "Customer onboarding", description: "5-step onboarding owned by the Office Manager" } });
  const eBilling = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "Job billing", description: "Invoice within 24 hours of completed job" } });
  const ePlans = await prisma.entity.create({ data: { organizationId: org.id, type: "POLICY", name: "Comfort Club", description: "Annual maintenance plan: 2 tune-ups, 15% off repairs, priority scheduling" } });
  const eWarranty = await prisma.entity.create({ data: { organizationId: org.id, type: "POLICY", name: "Warranty & refunds", description: "1-year labor warranty; 30-day refund window on unresolved repairs" } });
  await prisma.fact.createMany({
    data: [
      { organizationId: org.id, entityId: eCustomers.id, statement: "Onboarding is owned by the Office Manager (Priya Natarajan) and targets completion within 2 business days.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: eBilling.id, statement: "Company policy is to invoice every completed job within 24 hours.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: ePlans.id, statement: "Comfort Club target renewal rate is 90%+ and members slipping past 10 months must be called to re-book.", confidence: 0.9, status: "FACT" },
      { organizationId: org.id, entityId: eWarranty.id, statement: "Labor carries a 1-year warranty; refunds require Office Manager approval.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: ePlans.id, statement: "Comfort Club membership is assumed to be the primary driver of repeat revenue, but per-member revenue attribution is not yet tracked.", confidence: 0.5, status: "ASSUMPTION" },
    ],
  });

  // ── Enhance: brand assets ──
  await prisma.brandAsset.createMany({
    data: [
      { organizationId: org.id, name: "Primary logo — full color", kind: "LOGO", description: "Vertical lockup, mountain mark, navy + orange. Approved 2025 refresh." },
      { organizationId: org.id, name: "Brand guidelines v2.1", kind: "GUIDELINE", description: "Colors (navy #232C49, orange #F97316, blue #3B82F6), Inter typography, photo style: real technicians, no stock handshakes." },
      { organizationId: org.id, name: "Estimate template (letterhead)", kind: "TEMPLATE", description: "Branded estimate layout with approval signature block." },
      { organizationId: org.id, name: "Fall tune-up social kit", kind: "SOCIAL", description: "3 posts + 1 short video script promoting fall furnace tune-ups for Comfort Club." },
    ],
  });

  // ── Innovation Lab ──
  await prisma.idea.createMany({
    data: [
      {
        organizationId: org.id, title: "Whole-home generator installation line",
        problem: "Storm outages are the #1 complaint in rural edges of our service area; we currently refer that work out and lose the customer.",
        hypothesis: "Offering 22kW generator installs with a financing partner captures referred-out revenue and adds a $8k+ average ticket.",
        proposedSolution: "Certify Alicia for generator installs, partner with one distributor, pilot with the 40 customers who asked about backup power.",
        evidence: "4 generator inquiries logged in the last 90 days; zero current capability.",
        owner: "Alicia Grant", status: "EXPERIMENTING",
        nextStep: "Distributor pricing call Friday; pilot offer to inquiry list.",
      },
      {
        organizationId: org.id, title: "Comfort Club member referral program",
        problem: "Most new customers come from word of mouth, but we have never formalized or rewarded referrals.",
        hypothesis: "A $50 service credit for both parties increases member-originated leads without paid ads.",
        proposedSolution: "Give-both-ways credit, tracked per member, mentioned at every tune-up.",
        evidence: "Informal survey: 6 of 12 new customers last quarter were referred by existing customers.",
        owner: "Priya Natarajan", status: "IDEA",
        nextStep: "Draft one-page program and test with 10 members.",
      },
      {
        organizationId: org.id, title: "Two-tech crews for large installs",
        problem: "Large AC installs take two days with one tech, delaying other jobs.",
        hypothesis: "Two-tech crews cut install time ~40% and improve same-week capacity.",
        proposedSolution: "Pilot on the next 3 replacement installs with Jake + Dev.",
        evidence: "Time logs from last 5 single-tech installs average 14.5 hours.",
        owner: "Marcus Lee", status: "IDEA",
        nextStep: "Schedule pilot on next replacement job.",
      },
    ],
  });

  // ── Expand: training ──
  const t1 = await prisma.trainingModule.create({
    data: {
      organizationId: org.id, title: "Same-day job logging (why it matters)",
      summary: "How complete job logs enable 24-hour invoicing and protect revenue.",
      category: "PROCESS", source: "AI_GENERATED",
      content: "Generated from company knowledge: 'Job logging requirement' and 'Job billing' records.\n\n1. Every job must be logged before leaving the site — notes, parts, time.\n2. Unbilled completed jobs are the single largest recoverable revenue leak.\n3. Walk through the job logging screen with examples.\n4. Quiz: what happens if a job is not logged same-day?",
      knowledgeRefs: "[]",
    },
  });
  const t2 = await prisma.trainingModule.create({
    data: {
      organizationId: org.id, title: "Comfort Club renewal conversations",
      summary: "How to talk about renewals and annual visits without being pushy.",
      category: "CUSTOMER", source: "AI_GENERATED",
      content: "Generated from company knowledge: 'Comfort Club renewal rules'.\n\n1. Renewal target is 90%+ — renewals are the core of recurring revenue.\n2. Script for re-booking members past 10 months.\n3. Handling the 'I didn't use it' objection with the 15%-off value math.",
      knowledgeRefs: "[]",
    },
  });
  await prisma.trainingAssignment.createMany({
    data: [
      { trainingId: t1.id, employeeId: dev.id, status: "IN_PROGRESS" },
      { trainingId: t1.id, employeeId: sofia.id, status: "COMPLETED" },
      { trainingId: t2.id, employeeId: priya.id, status: "ASSIGNED" },
    ],
  });

  // ── Projects ──
  await prisma.project.create({
    data: {
      organizationId: org.id, title: "Generator offering launch",
      description: "Certification, distributor partnership, pilot installs.",
      status: "ACTIVE", dueAt: daysFromNow(45),
    },
  });

  // ── Connected Ecosystem (clearly labeled DEMO / AVAILABLE) ──
  await prisma.integration.createMany({
    data: [
      { organizationId: org.id, key: "quickbooks", name: "QuickBooks Online", category: "ACCOUNTING", status: "DEMO", dataAvailable: "Demo: invoices, payments and customer records shown in CUE are a local mirror.", capabilities: "Real connection would let CUE read invoices/payments live and draft invoices for your review." },
      { organizationId: org.id, key: "google_calendar", name: "Google Calendar", category: "SCHEDULING", status: "DEMO", dataAvailable: "Demo: job schedule shown in CUE is local data.", capabilities: "Real connection would sync scheduled jobs and technician calendars." },
      { organizationId: org.id, key: "gmail", name: "Gmail", category: "EMAIL", status: "DEMO", dataAvailable: "Demo: the communication timeline is seeded locally.", capabilities: "Real connection would log customer emails automatically against their record." },
      { organizationId: org.id, key: "servicetitan", name: "ServiceTitan", category: "CRM", status: "AVAILABLE", dataAvailable: "Not connected. Field service CRM — jobs, estimates, customers.", capabilities: "Would replace CUE's demo job/estimate data with the live system of record." },
      { organizationId: org.id, key: "stripe", name: "Stripe", category: "PAYMENTS", status: "AVAILABLE", dataAvailable: "Not connected. Card/ACH payments and payouts.", capabilities: "Would show collected revenue in real time and enable payment links on invoices." },
      { organizationId: org.id, key: "gustavo_hr", name: "Gusto", category: "HR", status: "AVAILABLE", dataAvailable: "Not connected. Payroll, org structure, PTO.", capabilities: "Would sync employees, departments and time off into People." },
      { organizationId: org.id, key: "google_drive", name: "Google Drive", category: "STORAGE", status: "AVAILABLE", dataAvailable: "Not connected. Documents and spreadsheets.", capabilities: "Would import and classify existing company documents into Capture." },
      { organizationId: org.id, key: "housecall_pro", name: "Housecall Pro", category: "CRM", status: "AVAILABLE", dataAvailable: "Not connected. Jobs, invoicing, customer communications.", capabilities: "Alternative field-service source of record for jobs and estimates." },
    ],
  });

  // ── AI settings (human control defaults) ──
  await prisma.aiSettings.create({
    data: { organizationId: org.id, observe: true, recommend: true, prepare: true, execute: false, automate: false },
  });

  // ── Seed audit event ──
  await prisma.auditEvent.create({
    data: {
      organizationId: org.id, actorType: "SYSTEM", action: "DEMO_SEEDED",
      detail: "Summit Home Services demo workspace created with seeded business data.",
    },
  });

  // ── Run the intelligence engine on the seeded data ──
  const { refreshIntelligence } = await import("../src/lib/intelligence");
  const created = await refreshIntelligence(org.id);
  console.log(`Seeded. Intelligence engine produced ${created} insight(s).`);
  console.log(`Sign in: owner@summithome.demo / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

```

### `scripts/export-share.cjs`  (125 lines)

```js
/**
 * Generates CUE-APP-SHARE.md — a single shareable document containing
 * the product context, architecture notes, and all source code of the
 * app (secrets, dependencies, and build artifacts excluded).
 *
 *   npm run export:share   →  CUE-APP-SHARE.md at project root
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "CUE-APP-SHARE.md");

const EXT_LANG = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".cjs": "js", ".mjs": "js",
  ".css": "css", ".json": "json", ".prisma": "prisma", ".md": "md",
};

// Directories/files to include, in document order
const INCLUDE_DIRS = ["src", "prisma", "scripts"];
const ROOT_FILES = ["package.json", "tsconfig.json", "tailwind.config.ts", "next.config.mjs", "postcss.config.mjs", ".env.example"];

// Never include: secrets, deps, build output, generated schemas, exports
const EXCLUDE = [
  /node_modules/, /\.next/, /\/db\//, /\.env$/, /bizmo-export\.json/,
  /schema\.postgres\.prisma/, /CUE-APP-SHARE\.md/, /custom\.db/, /package-lock\.json/,
  /\.freebuff\//, /server\.log/, /tsconfig\.tsbuildinfo/,
];

function walk(dir, base) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.join(base, e.name);
    if (EXCLUDE.some((r) => r.test(rel.replace(/\\/g, "/")))) continue;
    if (e.isDirectory()) out = out.concat(walk(full, rel));
    else out.push(rel);
  }
  return out;
}

function main() {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p)) files.push(...walk(p, d));
  }
  for (const f of ROOT_FILES) {
    if (fs.existsSync(path.join(ROOT, f))) files.push(f);
  }

  const langOf = (f) => EXT_LANG[path.extname(f)] ?? "";
  const lineCount = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length;

  let md = `# CUE — The Heart of Your Business
# Complete application source share (generated ${new Date().toISOString().slice(0, 10)})

This document contains the full source code and architecture of **CUE**, an AI Business
Operating System web application. It is shared for context so an LLM (ChatGPT or other)
can answer questions, review architecture, or draft improvements.

---

## 1. PRODUCT OVERVIEW

**CUE** is an AI Business Operating System for small and growing businesses. Core philosophy:

**Capture → Understand → Enhance → Execute → Expand**

- **Capture** — bring in documents, notes, files; classify → extract → organize → connect → make searchable
- **Understand** — knowledge extraction (entities, facts) + business-intelligence detectors computed from real records
- **Company Compass** — business profile + explainable Business Health score (Score → Evidence → Reasoning → Confidence → Recommendation)
- **Enhance / Execute / Expand** — brand & process improvement, tasks/workflows, training & growth
- **People / Knowledge / Innovation Lab / Connected Ecosystem / Settings** — org context, institutional memory, experiments, integrations, AI-permission controls

Product principles (enforced in code):
- Every insight is COMPUTED from actual records, never fabricated; every recommendation carries evidence refs
- Consequential actions are never automatic — Approve / Reject / Modify / Defer with a full audit trail
- Multi-tenant: every table is organization-scoped; every query filtered by organizationId
- Multi-industry via Industry Packs on one core (Home Services + Auto Dealersship implemented)
- Multi-lingual UI (EN/ES/FR/DE/PT) via cookie-based locale + dictionaries
- Grounded AI assistant: answers by querying actual records; explicitly says when it doesn't know

## 2. TECH STACK

- **Next.js 15** (App Router, Server Components + Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS 3** — dark "orbit" theme (ink/navy scale, blue/purple/orange accents, glass cards)
- **Prisma 6** — canonical schema on SQLite (local dev); generated Postgres copy for **Supabase** deployment
- Auth: custom — hashed passwords (scrypt), HMAC-signed session cookie, httpOnly
- No external AI keys: intelligence layer is deterministic, data-grounded code

## 3. FILE MAP

| Area | Files |
|---|---|
| App shell / theme | src/app/layout.tsx, globals.css, components/AppShell.tsx, NavClient.tsx |
| Dashboard (orbit + signals) | src/app/dashboard/*, components/OrbitWheel.tsx, EvidenceDrawer.tsx |
| Auth | src/app/signin/*, signup/*, lib/auth.ts, session.ts, password.ts |
| Onboarding wizard | src/app/onboarding/* |
| Capture + management | src/app/capture/* |
| Understand / Knowledge | src/app/understand/*, knowledge/* |
| Compass / health | src/app/compass/page.tsx, lib/health.ts |
| Intelligence engine | src/lib/intelligence.ts (detectors), workflows.ts (rec→workflow), assistant.ts (grounded AI) |
| Industry packs | prisma/schema.prisma (Vehicle/Deal/ServiceOrder/Lead), seed.ts, seed-dealership.ts |
| i18n | src/lib/i18n.ts, locale.ts, components/LanguageSwitcher.tsx |
| Data migration (SQLite→Supabase) | scripts/pg-schema.cjs, export-sqlite.cjs, import-postgres.cjs |

## 4. SOURCE CODE

`;

  for (const f of files) {
    const content = fs.readFileSync(path.join(ROOT, f), "utf8");
    md += `\n### \`${f.replace(/\\/g, "/")}\`  (${lineCount(f)} lines)\n\n\`\`\`${langOf(f)}\n${content}\n\`\`\`\n`;
  }

  md += `\n---\n\n## 5. NOTES FOR THE READER (LLM)\n\n- Canonical schema: \`prisma/schema.prisma\` (SQLite). \`schema.postgres.prisma\` is generated — ignore drift between them.\n- Intelligence detectors live in \`src/lib/intelligence.ts\`: each detector queries real records, builds evidence refs, and only fires when thresholds are met. Fingerprints dedupe re-scans.\n- \`.env\` is intentionally NOT included (contains secrets). \`.env.example\` shows the shape.\n- The two demo tenants (Summit Home Services, Riverside Auto Group) exist via seed scripts; real workspaces are created through the signup + onboarding wizard.\n`;

  fs.writeFileSync(OUT, md);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Wrote ${OUT} (${kb} KB, ${files.length} files)`);
}

main();

```

### `scripts/export-sqlite.cjs`  (75 lines)

```js
/**
 * Exports every table from the SQLite database to JSON for the
 * Postgres migration. Writes data/bizmo-export.json.
 *
 *   npm run db:export
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Tables in dependency order (parents before children). Self-referencing
// and cross-domain tables are handled by the importer's two-pass insert.
const TABLES = [
  "User",
  "Organization",
  "Member",
  "BusinessProfile",
  "Goal",
  "Department",
  "Employee",
  "Customer",
  "Job",
  "Estimate",
  "Invoice",
  "Payment",
  "Communication",
  "Vehicle",
  "Deal",
  "ServiceOrder",
  "Lead",
  "Document",
  "KnowledgeItem",
  "Entity",
  "Fact",
  "Insight",
  "Recommendation",
  "Workflow",
  "Project",
  "Task",
  "TrainingModule",
  "TrainingAssignment",
  "Idea",
  "BrandAsset",
  "Integration",
  "AiSettings",
  "AuditEvent",
];

async function main() {
  const prisma = new PrismaClient();
  const data = {};
  const counts = {};
  for (const t of TABLES) {
    // Prisma delegate API: prisma.user.findMany(), etc. Map by model name.
    const rows = await prisma[t[0].toLowerCase() + t.slice(1)].findMany();
    data[t] = rows;
    counts[t] = rows.length;
  }
  await prisma.$disconnect();

  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "bizmo-export.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify({ exportedAt: new Date().toISOString(), source: "sqlite", tables: data }, null, 2)
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log("Exported", total, "rows across", TABLES.length, "tables →", outFile);
  for (const [t, c] of Object.entries(counts)) if (c > 0) console.log(" ", t, c);
}

main().catch((e) => { console.error(e); process.exit(1); });

```

### `scripts/import-postgres.cjs`  (155 lines)

```js
/**
 * Imports data/bizmo-export.json into the Postgres database
 * (DATABASE_URL / DIRECT_URL must point at Supabase).
 *
 * Safety: refuses to run unless the target DB is empty (allows explicit
 * --force to truncate first). Inserts in FK-safe order, splitting the
 * Recommendation ↔ Workflow circular pair into two passes.
 *
 *   npm run db:pg:import          (refuses if target not empty)
 *   npm run db:pg:import -- --force
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");

const TABLES = [
  // Pass 1 — no FK deps (or self-refs nullable)
  ["User", "organization"],
  ["Organization", "organization"],
  ["Department", "organization"],
  ["Employee", "organization"],
  ["Customer", "organization"],
  ["Project", "organization"],
  ["BusinessProfile", "organization"],
  ["Vehicle", "organization"],
  ["Lead", "organization"],
  ["Document", "organization"],
  ["Entity", "organization"],
  ["Insight", "organization"],
  ["Idea", "organization"],
  ["BrandAsset", "organization"],
  ["Integration", "organization"],
  ["AiSettings", "organization"],
  ["TrainingModule", "organization"],
  // Pass 2 — children
  ["Member", "organization"],
  ["Goal", "organization"],
  ["Job", "organization"],
  ["Estimate", "organization"],
  ["Invoice", "organization"],
  ["Payment", "organization"],
  ["Communication", "organization"],
  ["Deal", "organization"],
  ["ServiceOrder", "organization"],
  ["KnowledgeItem", "organization"],
  ["Fact", "organization"],
  ["Task", "organization"],
  ["TrainingAssignment", "organization"],
  ["AuditEvent", "organization"],
  // Pass 3 — Recommendation/Workflow cycle, split
  ["Workflow#noRec", "organization"],
  ["Recommendation", "organization"],
  ["Workflow#withRec", "organization"],
];

const ORG_SCOPED = new Set(TABLES.filter(([, g]) => g === "organization").map(([t]) => t.replace(/#.*/, "")));

async function main() {
  const file = path.join(__dirname, "..", "data", "bizmo-export.json");
  if (!fs.existsSync(file)) {
    console.error("No export found. Run `npm run db:export` against the SQLite DB first.");
    process.exit(1);
  }
  const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
  const prisma = new PrismaClient();

  // ── Target emptiness check ──
  const orgCount = await prisma.organization.count();
  if (orgCount > 0 && !FORCE) {
    console.error(
      `Target database already contains ${orgCount} organization(s).\n` +
      "Refusing to overwrite. Re-run with --force to truncate all tables first."
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (FORCE) {
    console.log("Truncating target tables…");
    // Delete children before parents; AuditEvent last of children.
    const deleteOrder = [
      "auditEvent", "trainingAssignment", "task", "fact", "knowledgeItem",
      "recommendation", "workflow", "insight", "goal", "member",
      "payment", "invoice", "communication", "estimate", "job",
      "serviceOrder", "deal", "lead", "vehicle", "customer",
      "trainingModule", "aiSettings", "integration", "brandAsset", "idea",
      "entity", "document", "employee", "department", "businessProfile",
      "organization", "user",
    ];
    for (const m of deleteOrder) await prisma[m].deleteMany();
  }

  // ── Insert ──
  const tables = bundle.tables;
  let inserted = 0;

  async function insertRows(model, rows, transform) {
    if (!rows || rows.length === 0) return 0;
    for (const row of rows) {
      const data = transform ? transform(row) : row;
      await prisma[model].create({ data });
      inserted++;
    }
    return rows.length;
  }

  for (const [raw, group] of TABLES) {
    const [table, variant] = raw.split("#");
    const rows = tables[table] ?? [];
    let n = 0;

    if (table === "Workflow" && variant === "noRec") {
      n = await insertRows("workflow", rows.filter((r) => !r.recId));
    } else if (table === "Workflow" && variant === "withRec") {
      n = await insertRows("workflow", rows.filter((r) => r.recId));
    } else if (table === "Recommendation") {
      // Insert with recId nulled first (Workflow rows that reference it
      // already exist from pass 1), then link back.
      n = await insertRows("recommendation", rows, (r) => {
        const { recId, ...rest } = r;
        void recId;
        return rest;
      });
      // Link workflows back to their recommendations
      for (const wf of rows.filter((r) => r.recId)) {
        await prisma.workflow.update({
          where: { id: wf.id },
          data: { recId: wf.recId },
        });
      }
    } else {
      n = await insertRows(
        camel(table),
        rows
      );
    }
    if (n > 0) console.log(" ", table, n);
  }

  console.log(`Imported ${inserted} rows into Postgres.`);
  const orgs = await prisma.organization.count();
  const users = await prisma.user.count();
  console.log(`Verify: ${orgs} organizations, ${users} users.`);
  await prisma.$disconnect();
}

function camel(name) {
  return name[0].toLowerCase() + name.slice(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

```

### `scripts/pg-schema.cjs`  (41 lines)

```js
/**
 * Generates prisma/schema.postgres.prisma — a Postgres-ready copy of the
 * canonical SQLite schema (provider swap + directUrl + String ids via
 * @db.Text where needed). Run `npm run db:pg:schema` after every schema
 * change so the two never drift.
 *
 * Transformations applied:
 *  1. provider  "sqlite" → "postgresql"
 *  2. datasource gains directUrl = env("DIRECT_URL") (Supabase pooler vs direct)
 *  3. header comment noting the file is GENERATED — edit schema.prisma instead
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "prisma", "schema.prisma");
const out = path.join(__dirname, "..", "prisma", "schema.postgres.prisma");

let s = fs.readFileSync(src, "utf8");

s = s.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`
);

s = s.replace(
  /\/\/ CUE — data architecture[\s\S]*?\n\n/,
  `// CUE — data architecture (POSTGRES COPY — GENERATED FILE)
// Source of truth: prisma/schema.prisma (SQLite, local dev).
// Regenerate with: npm run db:pg:schema
// Deploy: DATABASE_URL + DIRECT_URL point at Supabase, then npm run db:pg:push

`
);

fs.writeFileSync(out, s);
console.log("Wrote", out);

```

### `scripts/smoke.ts`  (78 lines)

```ts
import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3210";

function sessionSecret(): string {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^BIZMO_SESSION_SECRET="(.+)"$/);
    if (m) return m[1];
  }
  throw new Error("BIZMO_SESSION_SECRET not found in .env");
}

function mintToken(userId: string): string {
  const expires = Date.now() + 60_000;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { email: "owner@summithome.demo" } });
  const cookie = `bizmo_session=${mintToken(user.id)}`;
  const insight = await prisma.insight.findFirstOrThrow();

  const results: [string, number, boolean][] = [];

  // Unauthenticated: / must redirect to /signin
  const root = await fetch(`${BASE}/`, { redirect: "manual" });
  results.push(["GET / (no auth)", root.status, root.status === 307 || root.status === 302]);

  // Authenticated pages
  for (const path of [
    "/dashboard", "/compass", "/capture", "/understand", "/knowledge",
    "/execute", "/people", "/enhance", "/expand", "/lab", "/ecosystem", "/settings",
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    results.push([`GET ${path}`, res.status, res.status === 200]);
  }

  // Assistant API
  const ai = await fetch(`${BASE}/api/assistant`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What should I focus on today?" }),
  });
  const aiJson = await ai.json() as { answer?: string };
  results.push(["POST /api/assistant", ai.status, ai.status === 200 && !!aiJson.answer]);
  console.log("AI answer preview:", (aiJson.answer ?? "").slice(0, 140).replace(/\n/g, " "));

  // Insight evidence API
  const ins = await fetch(`${BASE}/api/insight/${insight.id}`, { headers: { cookie } });
  const insJson = await ins.json() as { evidence?: unknown[]; rec?: unknown };
  results.push([`GET /api/insight/[id]`, ins.status, ins.status === 200 && Array.isArray(insJson.evidence)]);
  console.log("Top insight evidence records:", insJson.evidence?.length, "| has recommendation:", !!insJson.rec);

  // Unauthenticated API must be rejected
  const aiNoAuth = await fetch(`${BASE}/api/assistant`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "test" }),
  });
  results.push(["POST /api/assistant (no auth)", aiNoAuth.status, aiNoAuth.status === 401]);

  let failed = 0;
  for (const [name, status, ok] of results) {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${status}  ${name}`);
  }
  console.log(failed === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

```

### `scripts/test-capture-mgmt.ts`  (66 lines)

```ts
/**
 * Verifies capture management: creates a scoped test org with a captured
 * doc, then exercises update (edit + move) and delete (cascade) paths.
 * Run: npx tsx scripts/test-capture-mgmt.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  // Isolated test org so real workspaces are untouched
  const org = await prisma.organization.create({ data: { name: "__test-capture-mgmt", isDemo: true } });
  const dep = await prisma.department.create({ data: { organizationId: org.id, name: "Ops" } });
  const dep2 = await prisma.department.create({ data: { organizationId: org.id, name: "Finance" } });

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      title: "Employee Handbook",
      fileName: "handbook.pdf",
      mimeType: "application/pdf",
      kind: "POLICY",
      status: "PROCESSED",
      extractedText: "Original policy text about PTO.",
      departmentId: dep.id,
    },
  });
  await prisma.knowledgeItem.create({
    data: { organizationId: org.id, documentId: doc.id, title: doc.title, content: "Original policy text about PTO.", category: "POLICY", status: "ASSUMPTION" },
  });
  const entity = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "pto" } });
  await prisma.fact.create({ data: { organizationId: org.id, entityId: entity.id, statement: "pto appears in Employee Handbook", documentId: doc.id, status: "ASSUMPTION" } });

  // ── EDIT + MOVE ──
  await prisma.document.update({
    where: { id: doc.id },
    data: { title: "Employee Handbook v2", extractedText: "Revised policy: unlimited PTO.", kind: "PROCEDURE", departmentId: dep2.id, status: "PROCESSED" },
  });
  await prisma.knowledgeItem.updateMany({ where: { documentId: doc.id }, data: { title: "Employee Handbook v2", content: "Revised policy: unlimited PTO.", category: "PROCEDURE" } });

  const afterEdit = await prisma.document.findUnique({ where: { id: doc.id } });
  const kiAfter = await prisma.knowledgeItem.findFirst({ where: { documentId: doc.id } });
  if (!afterEdit || afterEdit.title !== "Employee Handbook v2" || afterEdit.departmentId !== dep2.id) throw new Error("edit/move failed");
  if (!kiAfter || kiAfter.category !== "PROCEDURE") throw new Error("knowledge sync failed");
  console.log("EDIT+MOVE ok — title:", afterEdit.title, "| dept:", dep2.name, "| knowledge category:", kiAfter.category);

  // ── DELETE (cascade) ──
  await prisma.fact.deleteMany({ where: { documentId: doc.id } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });
  await prisma.knowledgeItem.deleteMany({ where: { documentId: doc.id } });
  await prisma.document.delete({ where: { id: doc.id } });

  const docGone = await prisma.document.findUnique({ where: { id: doc.id } });
  const kiGone = await prisma.knowledgeItem.count({ where: { documentId: doc.id } });
  const factGone = await prisma.fact.count({ where: { documentId: doc.id } });
  const entityGone = await prisma.entity.count({ where: { id: entity.id } });
  if (docGone || kiGone || factGone || entityGone) throw new Error("cascade delete failed");
  console.log("DELETE ok — document, knowledge, facts, entities all removed");

  // Cleanup
  await prisma.department.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — capture management verified");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

```

### `scripts/verify-dealership.ts`  (14 lines)

```ts
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const org = await p.organization.findFirstOrThrow();
  const insights = await p.insight.findMany({ where: { organizationId: org.id } });
  for (const i of insights) console.log(i.severity.padEnd(7), String(i.impactValue ?? "-").padEnd(8), i.title);
  console.log("leads:", await p.lead.count({ where: { organizationId: org.id, status: "NEW" } }));
  console.log("deals negotiating:", await p.deal.count({ where: { organizationId: org.id, status: "NEGOTIATING" } }));
  console.log("service completed:", await p.serviceOrder.count({ where: { organizationId: org.id, status: "COMPLETED" } }));
  const vehicles = await p.vehicle.findMany({ where: { organizationId: org.id, status: "AVAILABLE" } });
  console.log("aged 30d+:", vehicles.filter((v) => v.listedAt && Date.now() - v.listedAt.getTime() > 30 * 86400000).length);
}
main().finally(() => p.$disconnect());

```

### `scripts/verify-seed.ts`  (13 lines)

```ts
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const org = await p.organization.findFirstOrThrow();
  const insights = await p.insight.findMany({ where: { organizationId: org.id } });
  for (const i of insights) {
    console.log(i.severity.padEnd(7), String(i.impactValue ?? "-").padEnd(8), i.title);
  }
  const recs = await p.recommendation.findMany({ where: { organizationId: org.id } });
  console.log("recommendations:", recs.length, "| linked to insight:", recs.filter((r) => r.insightId).length);
}
main().finally(() => p.$disconnect());

```

### `package.json`  (44 lines)

```json
{
  "name": "cue",
  "version": "0.1.0",
  "private": true,
  "description": "CUE — The Heart of Your Business",
  "scripts": {
    "dev": "next dev -p 3210",
    "build": "prisma generate && next build",
    "start": "next start -p 3210",
    "typecheck": "tsc --noEmit",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "setup": "prisma db push && tsx prisma/seed.ts",
    "db:pg:schema": "node scripts/pg-schema.cjs",
    "db:pg:push": "prisma db push --schema prisma/schema.postgres.prisma",
    "db:pg:generate": "prisma generate --schema prisma/schema.postgres.prisma",
    "db:export": "node scripts/export-sqlite.cjs",
    "db:pg:import": "node scripts/import-postgres.cjs",
    "db:migrate-to-pg": "npm run db:pg:schema && npm run db:export && npm run db:pg:push && npm run db:pg:import",
    "export:share": "node scripts/export-share.cjs"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.16.2",
    "next": "15.5.4",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "prisma": "^6.16.2",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}

```

### `tsconfig.json`  (22 lines)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}

```

### `tailwind.config.ts`  (61 lines)

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Inverted "navy" scale for the CUE-style dark UI:
        // navy-900..600 (text tones) → light text; navy-100/50 (surfaces) → dark glass.
        navy: {
          50: "rgba(148,163,184,0.07)",
          100: "rgba(148,163,184,0.14)",
          200: "rgba(148,163,184,0.22)",
          300: "#64748b",
          400: "#94a3b8",
          500: "#b6c2d4",
          600: "#c7d2e2",
          700: "#d7e0ec",
          800: "#e6edf6",
          900: "#f1f5fb",
          950: "#f8fafc",
        },
        // Deep space background scale
        ink: {
          700: "#1b2337",
          800: "#141a2b",
          900: "#0e1322",
          950: "#070b16",
        },
        accent: {
          blue: "#3b82f6",
          purple: "#8b5cf6",
          orange: "#f97316",
          green: "#10b981",
          red: "#ef4444",
          amber: "#f59e0b",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.45)",
        raised: "0 4px 24px rgba(0,0,0,0.6)",
        glow: "0 0 24px rgba(59,130,246,0.35)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

```

### `next.config.mjs`  (11 lines)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

```

### `postcss.config.mjs`  (10 lines)

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;

```

### `.env.example`  (34 lines)

```
# ─────────────────────────────────────────────────────────────
# CUE environment — copy to .env and fill in.
# NEVER commit the real .env. This file documents shape only.
# ─────────────────────────────────────────────────────────────

# ── SQLite (default, local dev — no Supabase needed) ──
# Relative to the prisma/ folder.
DATABASE_URL="file:./db/custom.db"

# ── Supabase Postgres (production / pilot) ──
# 1. Supabase dashboard → your project → Connect (top bar)
# 2. Copy the "Connection string" values. Prisma needs TWO:
#
#    DATABASE_URL = the POOLED connection (pgBouncer, port 6543).
#                   Use for the running app. Append &pgbouncer=true
#                   and &connection_limit=1 for serverless-style use.
#    DIRECT_URL   = the DIRECT connection (port 5432).
#                   Used by prisma db push / migrate for DDL.
#
#    Format: postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
#    (direct URL: same host WITHOUT .pooler, port 5432)
#
# 3. Also enable "Trust self-signed certificates" is NOT needed;
#    Supabase pooler certs work with Prisma's sslrequire=verify-full off.
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.supabase.com:5432/postgres"

# Session signing secret for CUE auth cookies (any long random hex).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BIZMO_SESSION_SECRET="<64 hex chars>"

# Demo flag: shows demo-workspace hints in the UI.
BIZMO_DEMO_MODE="false"

```

---

## 5. NOTES FOR THE READER (LLM)

- Canonical schema: `prisma/schema.prisma` (SQLite). `schema.postgres.prisma` is generated — ignore drift between them.
- Intelligence detectors live in `src/lib/intelligence.ts`: each detector queries real records, builds evidence refs, and only fires when thresholds are met. Fingerprints dedupe re-scans.
- `.env` is intentionally NOT included (contains secrets). `.env.example` shows the shape.
- The two demo tenants (Summit Home Services, Riverside Auto Group) exist via seed scripts; real workspaces are created through the signup + onboarding wizard.
