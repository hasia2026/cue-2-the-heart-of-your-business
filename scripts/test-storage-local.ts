/**
 * Verifies the LOCAL storage backend end-to-end (put → file exists → delete).
 * Safe to run anywhere: npx tsx scripts/test-storage-local.ts
 */
import { putObject, deleteObject, storageBackend } from "../src/lib/storage";
import fs from "fs";
import path from "path";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  process.env.STORAGE_BACKEND = "local";
  assert(storageBackend() === "LOCAL", "forced LOCAL backend");

  const orgId = "__test-storage-org";
  const stored = await putObject(orgId, "training", "demo video.mp4", Buffer.from("fake-video-bytes"), "video/mp4");
  assert(stored.backend === "LOCAL" && stored.url.startsWith("/uploads/training/"), `stored at ${stored.url}`);
  const abs = path.join(process.cwd(), "public", stored.url.replace(/^\//, ""));
  assert(fs.existsSync(abs), "file exists on disk under public/");
  assert(fs.readFileSync(abs).toString() === "fake-video-bytes", "content round-trips");

  await deleteObject({ url: stored.url, backend: "LOCAL" });
  assert(!fs.existsSync(abs), "deleteObject removes the file");

  // Clean the org dir if empty
  const dir = path.dirname(abs);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  console.log("PASS — LOCAL storage round-trip verified");
}
main().catch((e) => { console.error(e); process.exit(1); });
