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
  ["TrainingLesson", "organization"],
  ["MessageThread", "organization"],
  ["MarketWatch", "organization"],
  ["GbpReview", "organization"],
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
  ["PolicyAcknowledgment", "organization"],
  ["LessonQuiz", "organization"],
  ["LessonProgress", "organization"],
  ["ThreadParticipant", "organization"],
  ["Message", "organization"],
  ["MarketSignal", "organization"],
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
