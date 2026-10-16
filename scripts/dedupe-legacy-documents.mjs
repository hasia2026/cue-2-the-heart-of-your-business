#!/usr/bin/env node
// Dedupe LEGACY duplicate document rows — artifacts from before the duplicate
// detector existed (content_hash landed later than the first capture flow).
//
// What counts as a duplicate pair (within one org):
//   1. Same content_hash (sha256 of file bytes / normalized note text) — when
//      one of the rows already carries one. Only rows OLDER than the hash
//      backfill below are involved, so this extends exact-match detection to
//      pre-hash captures.
//   2. Same title (case-insensitive) AND same extracted_text (exact) — the
//      legacy path where a re-run of an old seed or a re-paste landed as a
//      copy but neither row carries a hash yet.
//
// The OLDEST row in each group is kept (the original capture); the rest are
// deleted. knowledge_items.document_id is ON DELETE SET NULL, so extracted
// knowledge survives with a dropped source link, matching what deleting a
// duplicate in the UI does. Deletes and hash backfills are audited as SYSTEM
// events per affected org.
//
// Dry-run by default; --apply performs the deletes. Usage:
//   node --env-file=.env scripts/dedupe-legacy-documents.mjs [--apply]
import postgres from "postgres";
import { createHash } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

function hashContent(data) {
  return createHash("sha256").update(data).digest("hex").toUpperCase();
}
function normalizeTextHash(text) {
  return hashContent(text.toLowerCase().replace(/\s+/g, " "));
}

const orgs = (await sql`select id, name from organizations order by created_at`).map(
  (o) => ({ id: o.id, name: o.name }),
);

let totalDeleted = 0;
let totalBackfilled = 0;

for (const org of orgs) {
  const docs = (await sql`
    select id, title, extracted_text, content_hash, uploaded_at
    from documents where organization_id = ${org.id}
    order by uploaded_at asc`).map(
    (d) => ({
      id: d.id,
      title: String(d.title ?? ""),
      text: d.extracted_text == null ? null : String(d.extracted_text),
      hash: d.content_hash == null ? null : String(d.content_hash),
      uploaded_at: d.uploaded_at,
    }),
  );
  if (!docs.length) continue;

  // Backfill legacy rows: derive the same normalized-text hash the capture
  // flow computes so future re-pastes of the same note are detected as
  // duplicates going forward, not just by this one-off.
  const backfill = [];
  for (const d of docs) {
    if (d.hash === null && d.text && d.text.trim() !== "") {
      d.hash = normalizeTextHash(d.text);
      backfill.push(d);
    }
  }

  // Group by hash where present (only after backfill), else by title+text.
  const groups = new Map();
  for (const d of docs) {
    const key = d.hash
      ? `h:${d.hash}`
      : `t:${d.title.trim().toLowerCase()}|x:${(d.text ?? "").replace(/\s+/g, " ")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const victims = [];
  for (const [, groupRows] of groups) {
    if (groupRows.length < 2) continue;
    // Keep the oldest; delete the rest.
    victims.push(...groupRows.slice(1));
  }

  const deleteIds = victims.map((v) => v.id);
  console.log(`\n${org.name}: ${docs.length} doc(s), ${backfill.length} hash backfill(s), ${deleteIds.length} duplicate row(s)`);
  for (const v of victims.slice(0, 10)) {
    console.log(`  ✗ delete ${v.id} — "${v.title}" (uploaded ${v.uploaded_at?.toISOString?.() ?? v.uploaded_at})`);
  }
  if (victims.length > 10) console.log(`  …and ${victims.length - 10} more`);

  if (APPLY && (backfill.length || deleteIds.length)) {
    await sql.begin(async (tx) => {
      for (const d of backfill) {
        await tx`update documents set content_hash = ${d.hash} where id = ${d.id}`;
      }
      if (deleteIds.length) {
        await tx`delete from documents where id = any(${deleteIds})`;
        const withOrg = (backfill.length || deleteIds.length) > 0;
        if (withOrg) {
          await tx`
            insert into audit_events (organization_id, actor_type, action, detail, metadata)
            values (${org.id}, 'SYSTEM', 'DOCUMENT_LEGACY_DEDUPE',
              ${`Removed ${deleteIds.length} legacy duplicate document row(s), backfilled ${backfill.length} content hash(es)`},
              ${JSON.stringify({ deleted: deleteIds, backfilled: backfill.length })})`;
        }
      }
    });
    console.log(`  → applied (deleted ${deleteIds.length}, backfilled ${backfill.length})`);
  }
  totalDeleted += deleteIds.length;
  totalBackfilled += backfill.length;
}

console.log(`\n${totalDeleted} duplicate row(s), ${totalBackfilled} hash backfill(s) — ${APPLY ? "APPLIED" : "DRY RUN (pass --apply to execute)"}`);
await sql.end();
