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
  "TrainingLesson",
  "LessonQuiz",
  "LessonProgress",
  "TrainingAssignment",
  "MessageThread",
  "ThreadParticipant",
  "Message",
  "PolicyAcknowledgment",
  "MarketWatch",
  "GbpReview",
  "MarketSignal",
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
