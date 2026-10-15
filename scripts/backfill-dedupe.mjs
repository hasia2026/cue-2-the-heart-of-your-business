#!/usr/bin/env node
// One-off backfill: add dedupe keys to the seeded demo insights so the
// leave-behind grouping (by evidence->>'dedupe') covers seed rows too.
// usage: node --env-file=.env scripts/backfill-dedupe.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const MAP = [
  ["7 completed service orders never invoiced", "unbilled_service"],
  ["14 web/phone leads have had no follow-up", "stale_leads"],
  ["5 used units past the 60-day aging threshold", "aging_inventory"],
];
for (const [title, dedupe] of MAP) {
  const [row] = await sql`select evidence from insights where title = ${title} limit 1`;
  if (!row) { console.log("skip (not found):", title); continue; }
  // Detector insights store evidence as { dedupe, items: [...] }. Wrap bare
  // seed arrays into that shape; leave anything already an object alone.
  const raw = row.evidence;
  const next = Array.isArray(raw)
    ? { dedupe, items: raw }
    : raw && typeof raw === "object" && !raw.dedupe
      ? { ...raw, dedupe }
      : raw;
  const r = await sql`update insights set evidence = ${sql.json(next)} where title = ${title}`;
  console.log(`updated ${r.count}: ${title} -> ${dedupe}`);
}
await sql.end();
console.log("backfill done");
