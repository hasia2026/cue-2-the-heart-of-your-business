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
