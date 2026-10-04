import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { randomBytes } from "crypto";

// ─────────────────────────────────────────────────────────────
// POST /api/uploads/sign — hands the browser a short-lived signed
// upload URL so large files (training videos) go STRAIGHT to
// Supabase Storage, bypassing the ~4.5MB serverless request-body
// ceiling entirely. Requires Supabase Storage env config; returns
// 503 with a clear reason when running in LOCAL mode.
//
// Body: { fileName, contentType, sizeBytes, kind?: "training" }
// → { uploadUrl, token, publicUrl, kind }
// ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const ALLOWED_VIDEO = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
const MAX_BYTES = 500 * 1024 * 1024; // 500MB

export async function POST(req: Request) {
  const session = await requireSession();
  if (!rateLimit(`upload:sign:${session.user.id}`, 20, 60).ok) {
    return NextResponse.json({ error: "Too many upload requests — try again in a minute." }, { status: 429 });
  }

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "cue-uploads";
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Direct uploads need Supabase Storage configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Fall back to the file form for now." },
      { status: 503 }
    );
  }

  let body: { fileName?: string; contentType?: string; sizeBytes?: number; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const fileName = (body.fileName ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const contentType = body.contentType ?? "application/octet-stream";
  const sizeBytes = Number(body.sizeBytes ?? 0);
  const kind = body.kind === "training" ? "training" : "files";

  if (!fileName) return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "File must be between 1 byte and 500MB" }, { status: 400 });
  }
  if (kind === "training" && !ALLOWED_VIDEO.includes(contentType) && !contentType.startsWith("video/")) {
    return NextResponse.json({ error: "Training uploads must be video files" }, { status: 400 });
  }

  // Create the DB row only after the client confirms; here we just
  // reserve an unguessable object path scoped to the org.
  const objectPath = `${kind}/${session.organizationId}/${Date.now()}-${randomBytes(8).toString("hex")}-${fileName}`;

  // Signed upload URL (Supabase: createSignedUploadUrl) via REST.
  const signRes = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!signRes.ok) {
    const errBody = await signRes.text().catch(() => "");
    return NextResponse.json({ error: `Storage sign failed: ${errBody.slice(0, 200)}` }, { status: 502 });
  }
  const signed = (await signRes.json()) as { url?: string; token?: string };
  if (!signed.url || !signed.token) {
    return NextResponse.json({ error: "Storage sign returned no URL" }, { status: 502 });
  }

  return NextResponse.json({
    uploadUrl: `${url}/storage/v1${signed.url}`,
    token: signed.token,
    publicUrl: `${url}/storage/v1/object/public/${bucket}/${objectPath}`,
    objectPath,
  });
}
