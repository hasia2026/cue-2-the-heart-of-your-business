import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestGbp } from "@/lib/signals";
import { rateLimit } from "@/lib/ratelimit";

// ─────────────────────────────────────────────────────────────
// Inbound webhook for Google Business Profile reviews and
// messages (via Zapier/Make bridges or the GBP notifications
// API). Bearer auth with the org's ingest key.
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
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Accept {reviews:[…]}/{messages:[…]}/{items:[…]} or a single object.
 *  Items posted under a `messages` key default to kind MESSAGE. */
function extractItems(body: Loose) {
  const fromMessages = Array.isArray(body.messages);
  const raw = Array.isArray(body)
    ? body
    : Array.isArray(body.reviews) ? body.reviews
    : Array.isArray(body.messages) ? body.messages
    : Array.isArray(body.items) ? body.items
    : [body];
  const hasKind = (it: Loose) =>
    str(it.kind) === "MESSAGE" || str(it.channel) === "MESSAGE" || str(it.type) === "MESSAGE" ||
    str(it.kind) === "REVIEW" || str(it.channel) === "REVIEW" || str(it.type) === "REVIEW";
  return (raw as Loose[]).map((it) => ({
    externalId: str(it.externalId) ?? str(it.reviewId) ?? str(it.id),
    kind: (hasKind(it)
      ? (str(it.kind) ?? str(it.channel) ?? str(it.type))!.toUpperCase() === "MESSAGE" ? "MESSAGE" : "REVIEW"
      : fromMessages ? "MESSAGE" : "REVIEW") as "REVIEW" | "MESSAGE",
    authorName: str(it.authorName) ?? str(it.author) ?? str(it.reviewer) ?? str(it.display_name) ?? "Google user",
    rating: num(it.rating) ?? num(it.starRating) ?? num(it.stars),
    body: str(it.body) ?? str(it.text) ?? str(it.comment) ?? str(it.content) ?? str(it.message) ?? "",
    reviewerUrl: str(it.reviewerUrl) ?? str(it.url) ?? str(it.link),
    postedAt: str(it.postedAt) ?? str(it.createTime) ?? str(it.date) ?? str(it.timestamp),
  })).filter((it) => it.body);
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
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: CORS });
  }

  const items = extractItems(body);
  if (items.length === 0) {
    return NextResponse.json({ error: "No review/message content found in payload" }, { status: 400, headers: CORS });
  }

  const result = await ingestGbp(org.id, items);
  return NextResponse.json({ ok: true, organization: org.name, ...result }, { headers: CORS });
}
