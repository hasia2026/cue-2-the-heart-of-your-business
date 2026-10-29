"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ImportGuide } from "@/lib/import-guides";

// The guided path from "ask the business for an export" to structured rows.
// One card, one decision at a time: who to ask → what to ask for → what it
// becomes. The copy button hands the owner a ready request script to forward.

export default function ImportGuide({ guide }: { guide: ImportGuide }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const script = useMemo(() => {
    // The request script doesn't embed the workspace-specific business name on
    // this card — the owner fills the sign-off when forwarding it.
    const items = guide.items
      .map((i, n) => `${n + 1}. ${i.ask} — export from ${i.where} (${i.columns ? `columns like ${i.columns}` : "standard columns"})`)
      .join("\n");
    return (
      `Hi — we're switching to CUE as our business operating system. To bring our history over, could you export these reports and send them back?\n\n` +
      items +
      `\n\nCSV is ideal (in Excel: File → Save As → CSV). Nothing else is needed — import takes minutes and everything stays private to our workspace.`
    );
  }, [guide]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (permissions/http) — the textarea fallback below still shows the text.
      setOpen(true);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="section-title">Turn a spreadsheet into records</h2>
        <span className="badge-blue">{guide.pack === "AUTO_DEALERSHIP" ? "Dealership guide" : guide.pack === "HOME_SERVICES" ? "Home-services guide" : "Business guide"}</span>
      </div>
      <p className="muted mt-1 text-sm">{guide.pitch}</p>

      <ol className="mt-4 space-y-2 text-sm">
        {guide.items.map((i, n) => (
          <li key={i.kindParam} className="rounded-xl border border-white/[0.06] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-low">{n + 1}</span>
              <strong className="text-navy-100">{i.ask}</strong>
              <Link
                href={`/intake/import?kind=${i.kindParam}`}
                className="ms-auto btn-ghost !px-3 !py-1.5 text-xs"
              >
                Import as {i.becomes} →
              </Link>
            </div>
            <div className="muted mt-1 text-xs">
              <span className="text-navy-300">Where:</span> {i.where}
              {i.columns && <> · <span className="text-navy-300">Columns:</span> {i.columns}</>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !px-4 text-sm" onClick={() => void copy()}>
          {copied ? "✓ Copied — paste it in your email" : "Copy the request script"}
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide script" : "Preview the script"}
        </button>
        <Link href="/intake/import" className="ms-auto text-xs text-cue-blue hover:underline">
          Or import a file you already have →
        </Link>
      </div>
      {open && (
        <textarea
          className="input mt-2 font-mono text-xs"
          rows={8}
          readOnly
          value={script}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <p className="muted mt-2 text-xs">
        Excel spreadsheets are fine — save as CSV first (File → Save As → CSV). Rows are org-scoped, deduped, and audited.
      </p>
    </section>
  );
}
