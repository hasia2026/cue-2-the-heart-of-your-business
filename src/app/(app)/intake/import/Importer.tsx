"use client";

import { useCallback, useRef, useState } from "react";
import type { CsvParse, CsvPreview, CsvCommit, CsvIssue } from "./actions";

// Three-step CSV import: pick target → confirm column mapping → validate →
// commit. The server owns parsing/validation/inserts; the client only holds
// the user's decision-making (which file, which column feeds which field).

type Kind = "CUSTOMERS" | "VEHICLES" | "INVOICES" | "SERVICE_ORDERS" | "AGREEMENTS";

/** Paste fallback alongside the file picker — same parse path as a dropped
 *  file, and the path clipboard exports usually arrive through anyway. */
function PasteBox({ onUse }: { onUse: (text: string, name?: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-xl border border-white/[0.06] p-4">
      <label className="text-xs uppercase tracking-widest text-navy-300" htmlFor="csv-paste">…or paste CSV text</label>
      <textarea
        id="csv-paste"
        className="input mt-2 font-mono text-xs"
        rows={5}
        placeholder={"stock,year,make,model,list price\nU-9001,2024,Toyota,Corolla,23990"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="btn-ghost !px-3 !py-1.5 text-xs"
          disabled={!text.trim()}
          onClick={() => onUse(text, "pasted.csv")}
        >
          Use pasted text
        </button>
      </div>
    </div>
  );
}

const KIND_META: { id: Kind; title: string; blurb: string; icon: string }[] = [
  { id: "VEHICLES", title: "Vehicles", blurb: "Plate lists / DMS inventory exports", icon: "🚗" },
  { id: "CUSTOMERS", title: "Customers", blurb: "Customer rosters from your CRM export", icon: "🧑" },
  { id: "SERVICE_ORDERS", title: "Completed jobs", blurb: "Work-order history — every completed call becomes a record with its date, home and invoice amount", icon: "🔧" },
  { id: "AGREEMENTS", title: "Service plans", blurb: "Maintenance-agreement members become recurring plans the detectors watch", icon: "📅" },
  { id: "INVOICES", title: "Invoices", blurb: "Billing exports — unknown customers can be created on import", icon: "🧾" },
];

/** Industry-aware target list, ordered so the pack's main entity leads. */
function kindsForPack(pack: string | null): Kind[] {
  if (pack === "HOME_SERVICES") return ["CUSTOMERS", "SERVICE_ORDERS", "AGREEMENTS", "INVOICES"];
  if (pack === "AUTO_DEALERSHIP") return ["VEHICLES", "CUSTOMERS", "INVOICES", "SERVICE_ORDERS"];
  return ["CUSTOMERS", "VEHICLES", "INVOICES", "SERVICE_ORDERS", "AGREEMENTS"];
}

export default function Importer({
  canImport,
  pack = null,
  initialKind = null,
}: {
  canImport: boolean;
  pack?: string | null;
  initialKind?: Kind | null;
}) {
  const allowed = kindsForPack(pack);
  const startKind: Kind = initialKind && KIND_META.some((k) => k.id === initialKind && allowed.includes(initialKind))
    ? initialKind
    : allowed[0];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<Kind>(startKind);
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [parse, setParse] = useState<CsvParse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // field → header
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [commit, setCommit] = useState<CsvCommit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createCustomers, setCreateCustomers] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 2_000_000) {
      setError("That file is over 2 MB — split it or trim columns before importing.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPreview(null);
    setCommit(null);
    setBusy(true);
    try {
      const { csvParseAction } = await import("./actions");
      const res = await csvParseAction(kind, text);
      setParse(res);
      setMapping(Object.fromEntries(Object.entries(res.mapping)) as Record<string, string>);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [kind]);

  async function runPreview() {
    if (!parse) return;
    setBusy(true);
    setError(null);
    try {
      const { csvPreviewAction } = await import("./actions");
      const res = await csvPreviewAction(kind, csv, mapping, { createMissingCustomers: createCustomers });
      setPreview(res);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const { csvCommitAction } = await import("./actions");
      const res = await csvCommitAction(kind, csv, mapping, { createMissingCustomers: createCustomers });
      setCommit(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setCsv("");
    setFileName("");
    setParse(null);
    setMapping({});
    setPreview(null);
    setCommit(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const fields = parse?.fields ?? [];
  const headers = parse?.headers ?? [];
  const errorsByRow = new Map<number, CsvIssue[]>();
  for (const i of preview?.errors ?? []) {
    const list = errorsByRow.get(i.index) ?? [];
    list.push(i);
    errorsByRow.set(i.index, list);
  }

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 text-xs text-navy-300">
        {[1, 2, 3].map((n, i) => (
          <li key={n} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>→</span>}
            <span className={`rounded-full px-2.5 py-1 ${step >= n ? "bg-cue-blue/20 text-cue-blue" : "bg-white/[0.05]"}`}>
              {n === 1 ? "Choose & upload" : n === 2 ? "Map columns" : "Review & import"}
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {allowed.map((id) => {
              const k = KIND_META.find((x) => x.id === id)!;
              return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  kind === k.id
                    ? "border-cue-blue/60 bg-cue-blue/15"
                    : "border-white/[0.06] hover:border-violet-400/40 hover:bg-violet-500/10"
                }`}
              >
                <div className="text-xl">{k.icon}</div>
                <div className="mt-1 font-medium text-navy-100">{k.title}</div>
                <div className="muted text-xs">{k.blurb}</div>
              </button>
              );
            })}
          </div>

          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-6 py-10 text-center transition hover:border-cue-blue/50 hover:bg-cue-blue/5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void loadFile(f);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              disabled={!canImport || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
              }}
            />
            <span className="text-2xl">📄</span>
            <span className="text-sm text-navy-100">
              {busy ? "Reading…" : "Drop a CSV here or click to choose a file"}
            </span>
            <span className="muted text-xs">{fileName || `${kind.charAt(0)}${kind.slice(1).toLowerCase()} export — up to 2 MB`}</span>
          </label>
          {!canImport && (
            <p className="muted text-xs">Importing is for Owners, Admins, and Managers.</p>
          )}

          <PasteBox onUse={(text, name) => void loadFile(new File([text], name ?? "pasted.csv", { type: "text/csv" }))} />
        </section>
      )}

      {step === 2 && parse && (
        <section className="space-y-3">
          <p className="text-sm">
            <strong className="text-navy-100">{fileName}</strong> — {parse.total} row(s), {headers.length} column(s).{" "}
            Map each field to a column from your file, then validate.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-navy-100">
                    {f.label}
                    {f.required && <span className="ms-1 text-red-300">*</span>}
                  </div>
                </div>
                <select
                  className="input !py-1.5 text-xs max-w-[220px]"
                  value={mapping[f.name] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.name]: e.target.value }))}
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={reset}>Start over</button>
            <button type="button" className="btn-primary !px-4 text-sm" disabled={busy} onClick={() => void runPreview()}>
              {busy ? "Validating…" : "Validate rows"}
            </button>
          </div>
          {(kind === "INVOICES" || kind === "SERVICE_ORDERS" || kind === "AGREEMENTS") && (
            <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 accent-cue-blue"
                checked={createCustomers}
                onChange={(e) => setCreateCustomers(e.target.checked)}
              />
              <span>
                <span className="text-sm text-navy-100">Create customers that aren&apos;t in CUE yet</span>
                <span className="muted block text-xs">
                  When on, rows for an unknown customer get a new customer record — no prior customers import needed.
                </span>
              </span>
            </label>
          )}
        </section>
      )}

      {step === 3 && preview && (
        <section className="space-y-3">
          {commit ? (
            <div className="rounded-xl border border-cue-green/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              ✓ Imported <strong>{commit.imported}</strong> {kind.toLowerCase()} record(s)
              {commit.customersCreated > 0 && <> — created <strong>{commit.customersCreated}</strong> new customer(s)</>}
              {commit.skipped > 0 && <> — skipped {commit.skipped} row(s) that still failed validation</>}. They&apos;re live in{" "}
              {kind === "VEHICLES" ? "your vehicles" : kind === "CUSTOMERS" ? "your customers" : "your invoices"} — the
              detectors read them from now on.
              <div className="mt-2">
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={reset}>Import another file</button>
              </div>
            </div>
          ) : (
            <>
              <div className={`rounded-xl border px-4 py-3 text-sm ${
                preview.blocked === 0
                  ? "border-cue-green/30 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-200"
              }`}>
                {preview.blocked === 0
                  ? `✓ All ${preview.valid} row(s) look good — ready to import into ${kind.toLowerCase()}.`
                  : `${preview.valid} row(s) ready · ${preview.blocked} blocked (problems listed below). Blocked rows are skipped on import.`}
              </div>
              {preview.customersToCreate.length > 0 && (
                <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
                  Will create {preview.customersToCreate.length} new customer(s): {preview.customersToCreate.join(", ")}
                </div>
              )}
              {preview.errors.slice(0, 50).map((e, i) => (
                <div key={`${e.index}-${i}`} className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  Row {e.index + 1}{e.field ? ` · ${e.field}` : ""}: {e.message}
                </div>
              ))}
              {preview.errors.length > 50 && (
                <p className="muted text-xs">…and {preview.errors.length - 50} more issue(s).</p>
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-ghost !px-4 !py-2 text-xs" disabled={busy} onClick={() => setStep(2)}>Adjust mapping</button>
                <button type="button" className="btn-primary !px-4 text-sm" disabled={busy} onClick={() => void runCommit()}>
                  {busy ? "Importing…" : `Import ${preview.valid} row(s)`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}
    </div>
  );
}
