"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { refreshIntelligence } from "@/lib/intelligence";

// ─────────────────────────────────────────────────────────────
// CSV / DMS report import. Dealership DMS platforms (CDK,
// Reynolds, Dealertrack…) all export CSV. The user uploads the
// report; CUE parses, dedupes, and turns rows into real records,
// then runs the intelligence scan over them. No integration
// project required — the pilot works on exports from day one.
// ─────────────────────────────────────────────────────────────

export type ImportResult = {
  ok: boolean;
  message: string;
  counts: { vehicles: number; leads: number; customers: number };
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const rows = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = parseFloat(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export async function importCsv(formData: FormData): Promise<ImportResult> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const file = formData.get("file") as File | null;
  const kindRaw = String(formData.get("kind") ?? "auto");
  if (!file || file.size === 0) {
    return { ok: false, message: "Choose a CSV file first.", counts: { vehicles: 0, leads: 0, customers: 0 } };
  }
  const text = await file.text();
  const { rows } = parseCsv(text);
  if (rows.length === 0) {
    return { ok: false, message: "No data rows found in that file.", counts: { vehicles: 0, leads: 0, customers: 0 } };
  }

  const counts = { vehicles: 0, leads: 0, customers: 0 };

  for (const r of rows) {
    const get = (...names: string[]): string => {
      for (const n of names) {
        const key = Object.keys(r).find((k) => k.includes(n));
        if (key && r[key]) return r[key];
      }
      return "";
    };

    // ── Vehicle rows ──
    const stock = get("stock", "vin");
    const make = get("make");
    const model = get("model");
    if (stock && make && model) {
      const exists = await prisma.vehicle.findFirst({ where: { organizationId: orgId, stockNumber: stock } });
      if (!exists) {
        const year = parseInt(get("year"), 10) || new Date().getFullYear();
        const listed = get("listeddate", "dateinstock", "indate");
        await prisma.vehicle.create({
          data: {
            organizationId: orgId,
            stockNumber: stock,
            vin: get("vin") || null,
            year,
            make,
            model,
            kind: get("type", "newused").toUpperCase().startsWith("N") ? "NEW" : "USED",
            status: get("status").toUpperCase().includes("SOLD") ? "SOLD" : "AVAILABLE",
            listPrice: num(get("price", "listprice", "asking")),
            cost: num(get("cost", "invoice")),
            listedAt: listed && !Number.isNaN(Date.parse(listed)) ? new Date(listed) : null,
          },
        });
        counts.vehicles++;
      }
      continue;
    }

    // ── Lead rows ──
    const leadName = get("leadname", "customername", "name", "prospect");
    if (leadName) {
      const dup = await prisma.lead.findFirst({
        where: { organizationId: orgId, name: leadName, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      });
      if (!dup) {
        const created = get("createddate", "date", "received");
        const estVal = num(get("value", "estvalue", "dealvalue"));
        await prisma.lead.create({
          data: {
            organizationId: orgId,
            name: leadName,
            source: (get("source", "leadsource") || "WEB").toUpperCase().slice(0, 12),
            interest: get("interest", "vehicle", "request") || null,
            estValue: estVal,
            status: get("status", "leadstatus").toUpperCase() === "CONTACTED" ? "CONTACTED" : "NEW",
            createdAt: created && !Number.isNaN(Date.parse(created)) ? new Date(created) : new Date(),
          },
        });
        counts.leads++;
        // Also create/link a customer record for follow-up context
        const custExists = await prisma.customer.findFirst({ where: { organizationId: orgId, name: leadName } });
        if (!custExists) {
          await prisma.customer.create({
            data: { organizationId: orgId, name: leadName, email: get("email") || null, phone: get("phone", "cell") || null, type: "RESIDENTIAL" },
          });
          counts.customers++;
        }
      }
      continue;
    }
  }

  // Run the intelligence scan over the imported data
  let insightsCreated = 0;
  if (counts.vehicles + counts.leads > 0) {
    insightsCreated = await refreshIntelligence(orgId);
  }

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "CSV_IMPORTED",
    detail: `${file.name}: ${counts.vehicles} vehicles, ${counts.leads} leads, ${counts.customers} customers imported — ${insightsCreated} new insight(s)`,
    metadata: { fileName: file.name, ...counts, insightsCreated, kind: kindRaw },
  });

  return {
    ok: true,
    message: `Imported ${counts.vehicles} vehicles · ${counts.leads} leads · ${counts.customers} customers. Intelligence scan found ${insightsCreated} new insight${insightsCreated === 1 ? "" : "s"}.`,
    counts,
  };
}
