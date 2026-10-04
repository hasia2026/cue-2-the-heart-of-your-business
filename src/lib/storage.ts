import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// File storage. Two backends:
//   • LOCAL    — public/uploads (dev; wiped by redeploys)
//   • SUPABASE — Supabase Storage via the REST API (production;
//                survives redeploys, works on serverless/Vercel)
// Selected automatically: Supabase when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are both set, unless STORAGE_BACKEND
// overrides. Objects live in a public bucket under an unguessable
// path (orgId + random id), so public URLs stay private-in-practice.
// ─────────────────────────────────────────────────────────────

export type StoredObject = { url: string; key: string; backend: "LOCAL" | "SUPABASE" };

export function storageBackend(): "LOCAL" | "SUPABASE" {
  const forced = process.env.STORAGE_BACKEND;
  if (forced === "supabase") return "SUPABASE";
  if (forced === "local") return "LOCAL";
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE" : "LOCAL";
}

function supabaseConfig(): { url: string; serviceKey: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "cue-uploads";
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey, bucket };
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
}

/** Ensure the bucket exists (idempotent). 409 = already exists. */
async function ensureBucket(cfg: { url: string; serviceKey: string; bucket: string }): Promise<void> {
  await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: cfg.bucket, public: true }),
  }).then(async (res) => {
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    // "Bucket already exists" is success for our purposes
    if (!/exists|409|duplicate/i.test(body)) {
      throw new Error(`Supabase bucket create failed (${res.status}): ${body.slice(0, 200)}`);
    }
  });
}

/** Store an uploaded file. Returns the public URL to persist in the DB. */
export async function putObject(orgId: string, kind: string, fileName: string, data: Buffer, contentType: string): Promise<StoredObject> {
  const key = `${kind}/${orgId}/${Date.now()}-${randomBytes(8).toString("hex")}-${safeName(fileName)}`;
  const backend = storageBackend();

  if (backend === "SUPABASE") {
    const cfg = supabaseConfig();
    if (!cfg) throw new Error("Supabase storage not configured");
    await ensureBucket(cfg);
    const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Supabase upload failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return { url: `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${key}`, key, backend };
  }

  // LOCAL
  const dir = path.join(process.cwd(), "public", "uploads", kind, orgId);
  fs.mkdirSync(dir, { recursive: true });
  const local = path.join(dir, `${Date.now()}-${randomBytes(6).toString("hex")}-${safeName(fileName)}`);
  fs.writeFileSync(local, data);
  const rel = `/uploads/${kind}/${orgId}/${path.basename(local)}`.replace(/\\/g, "/");
  return { url: rel, key: rel, backend };
}

/** Remove a previously stored object (best-effort; never throws). */
export async function deleteObject(stored: StoredObject | { url: string; backend?: string }): Promise<void> {
  try {
    const cfg = supabaseConfig();
    const isSupabaseUrl = stored.url.includes("/storage/v1/object/");
    if (cfg && (stored.backend === "SUPABASE" || isSupabaseUrl)) {
      const m = stored.url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
      if (!m) return;
      await fetch(`${cfg.url}/storage/v1/object/${m[1]}/${m[2]}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cfg.serviceKey}` },
      });
    } else if (stored.url.startsWith("/uploads/")) {
      const local = path.join(process.cwd(), "public", stored.url);
      if (fs.existsSync(local)) fs.unlinkSync(local);
    }
  } catch {
    // best effort only
  }
}
