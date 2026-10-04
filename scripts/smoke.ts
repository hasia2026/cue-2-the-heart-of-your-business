import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3210";

function sessionSecret(): string {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^BIZMO_SESSION_SECRET="(.+)"$/);
    if (m) return m[1];
  }
  throw new Error("BIZMO_SESSION_SECRET not found in .env");
}

function mintToken(userId: string): string {
  const expires = Date.now() + 60_000;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { email: "owner@summithome.demo" } });
  const cookie = `bizmo_session=${mintToken(user.id)}`;
  const insight = await prisma.insight.findFirstOrThrow();

  const results: [string, number, boolean][] = [];

  // Unauthenticated: / must redirect to /signin
  const root = await fetch(`${BASE}/`, { redirect: "manual" });
  results.push(["GET / (no auth)", root.status, root.status === 307 || root.status === 302]);

  // Authenticated pages
  for (const path of [
    "/dashboard", "/compass", "/capture", "/understand", "/knowledge",
    "/execute", "/people", "/enhance", "/expand", "/lab", "/ecosystem", "/settings",
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    results.push([`GET ${path}`, res.status, res.status === 200]);
  }

  // Assistant API
  const ai = await fetch(`${BASE}/api/assistant`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What should I focus on today?" }),
  });
  const aiJson = await ai.json() as { answer?: string };
  results.push(["POST /api/assistant", ai.status, ai.status === 200 && !!aiJson.answer]);
  console.log("AI answer preview:", (aiJson.answer ?? "").slice(0, 140).replace(/\n/g, " "));

  // Insight evidence API
  const ins = await fetch(`${BASE}/api/insight/${insight.id}`, { headers: { cookie } });
  const insJson = await ins.json() as { evidence?: unknown[]; rec?: unknown };
  results.push([`GET /api/insight/[id]`, ins.status, ins.status === 200 && Array.isArray(insJson.evidence)]);
  console.log("Top insight evidence records:", insJson.evidence?.length, "| has recommendation:", !!insJson.rec);

  // Unauthenticated API must be rejected
  const aiNoAuth = await fetch(`${BASE}/api/assistant`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "test" }),
  });
  results.push(["POST /api/assistant (no auth)", aiNoAuth.status, aiNoAuth.status === 401]);

  let failed = 0;
  for (const [name, status, ok] of results) {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${status}  ${name}`);
  }
  console.log(failed === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
