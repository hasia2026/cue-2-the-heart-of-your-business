"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importCsv, type ImportResult } from "./import-actions";

export default function ImportClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await importCsv(fd);
      setResult(res);
      if (res.ok) {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Import failed — check the file and try again.", counts: { vehicles: 0, leads: 0, customers: 0 } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="section-title">Import from a CSV / DMS report</h2>
        <span className="badge-low">no integration needed</span>
      </div>
      <p className="muted text-sm mb-4">
        Export a report from your DMS (CDK, Reynolds, Dealertrack) or any spreadsheet and drop it here. CUE matches the columns automatically, skips duplicates, and runs its intelligence scan on what arrives.
      </p>

      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-end">
        <div>
          <label className="label" htmlFor="csvfile">CSV file</label>
          <input id="csvfile" name="file" type="file" accept=".csv,text/csv" required className="input file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:text-navy-700" />
        </div>
        <div>
          <label className="label" htmlFor="kind">Report type</label>
          <select id="kind" name="kind" className="input">
            <option value="auto">Auto-detect columns</option>
            <option value="inventory">Inventory (vehicles)</option>
            <option value="leads">Leads / CRM</option>
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Importing…" : "Import"}
        </button>
      </form>

      <details className="mt-4 text-xs text-navy-400">
        <summary className="cursor-pointer hover:text-navy-600">What columns does CUE look for?</summary>
        <div className="mt-2 grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-navy-50 p-3">
            <div className="font-semibold text-navy-600 mb-1">Vehicles</div>
            stock#/VIN · make · model · year · price · cost · listed date · status
          </div>
          <div className="rounded-lg border border-navy-50 p-3">
            <div className="font-semibold text-navy-600 mb-1">Leads</div>
            name · source · interest/vehicle · value · status · date · email · phone
          </div>
        </div>
        <p className="mt-2">Column names vary by DMS — CUE matches loosely (e.g. &ldquo;Stock #&rdquo;, &ldquo;StockNum&rdquo;, &ldquo;STOCK_NO&rdquo; all work). Extra columns are ignored.</p>
      </details>

      {result && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${result.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
          {result.message}
        </div>
      )}
    </section>
  );
}
