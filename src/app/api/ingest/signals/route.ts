import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestSignals, type IngestItem } from "@/lib/signals";
import { rateLimit } from "@/lib/ratelimit";

// ─────────────────────────────────────────────────────────────
// Inbound webhook for social-listening tools (Brand24, Mention,
// Buska, RSS-to-webhook bridges, Zapier…). Bearer auth with the
// org's ingest key. Tolerant of loose payloads — the most common
// field names all work.
// ─────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type Loose = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Accept a single item or an array, under many common field shapes. */
function extractItems(body: Loose): IngestItem[] {
  const raw = Array.isArray(body)
    ? body
    : Array.isArray(body.items) ? body.items
    : Array.isArray(body.alerts) ? body.alerts
    : Array.isArray(body.posts) ? body.posts
    : Array.isArray(body.results) ? body.results
    : [body];
  return (raw as Loose[]).map((it) => ({
    source: str(it.source) ?? str(it.channel) ?? undefined,
    externalId: str(it.externalId) ?? str(it.id) ?? str(it.post_id) ?? str(it.alertId),
    externalUrl: str(it.externalUrl) ?? str(it.url) ?? str(it.link) ?? str(it.permalink),
    author: str(it.author) ?? str(it.username) ?? str(it.user) ?? str(it.author_name),
    title: str(it.title) ?? str(it.name) ?? str(it.headline),
    content: str(it.content) ?? str(it.text) ?? str(it.body) ?? str(it.message) ?? str(it.description) ?? str(it.snippet) ?? "",
    publishedAt: str(it.publishedAt) ?? str(it.published_at) ?? str(it.createdAt) ?? str(it.date) ?? str(it.timestamp),
  })).filter((it) => it.content);
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Missing bearer key" }, { status: 401, headers: CORS });
  }
  const org = await prisma.organization.findUnique({ where: { ingestKey: key }, select: { id: true, name: true } });
  if (!org) {
    return NextResponse.json({ error: "Invalid ingest key" }, { status: 401, headers: CORS });
  }
  // Webhook flood guard: 60 posts/min per ingest key.
  const rl = rateLimit(`ingest:${org.id}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { ...CORS, "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body: Loose;
  try {
    body = await req.json();
  } catch {
    // Fallback: RSS-style bridges sometimes post text/plain
    const text = await req.text().catch(() => "");
    body = { content: text };
  }

  const items = extractItems(body);
  if (items.length === 0) {
    return NextResponse.json({ error: "No signal content found in payload" }, { status: 400, headers: CORS });
  }

  const result = await ingestSignals(org.id, items);
  return NextResponse.json({ ok: true, organization: org.name, ...result }, { headers: CORS });
}
