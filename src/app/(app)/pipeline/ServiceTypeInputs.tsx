"use client";

import { useState, useTransition } from "react";
import { setLeadServiceType, setDealServiceType } from "./detail-actions";

// Inline service-type labeler for leads + deals on Pipeline. A datalist keeps
// the org's own taxonomy (auto-filled from org history server-side) instead
// of a hardcoded enum — an HCP owner can track "recurring dial-in" while a
// dealership tracks "EV charger" without either being told the vocabulary.

export const COMMON_TYPES = [
  "Diagnostic", "Replacement", "Maintenance", "Panel swap",
  "EV charger", "Upgrade", "Warranty", "Other",
] as const;

export function LeadServiceType({
  leadId,
  value,
  suggestions,
  canEdit,
}: {
  leadId: string;
  value: string | null;
  suggestions: string[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(value ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  if (!canEdit) return value ? <span className="badge-purple">{value}</span> : null;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        list={`lead-types-${leadId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if ((value ?? "") === draft.trim()) return;
          startTransition(async () => {
            const r = await setLeadServiceType(leadId, draft);
            if (!r.ok) setMsg(r.error ?? "Failed");
            else { setMsg("✓"); setTimeout(() => setMsg(null), 1500); }
          });
        }}
        placeholder="+ type"
        aria-label="Lead service type"
        className="input !px-2 !py-0.5 !w-28 text-xs"
      />
      <datalist id={`lead-types-${leadId}`}>
        {[...new Set([...suggestions, ...COMMON_TYPES])].map((t) => <option key={t} value={t} />)}
      </datalist>
      {pending && <span className="text-xs text-navy-300/60">…</span>}
      {msg && <span className="text-xs text-emerald-300">{msg}</span>}
    </span>
  );
}

export function DealServiceType({
  dealId,
  value,
  suggestions,
  canEdit,
}: {
  dealId: string;
  value: string | null;
  suggestions: string[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(value ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  if (!canEdit) return value ? <span className="badge-purple">{value}</span> : null;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        list={`deal-types-${dealId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if ((value ?? "") === draft.trim()) return;
          startTransition(async () => {
            const r = await setDealServiceType(dealId, draft);
            if (!r.ok) setMsg(r.error ?? "Failed");
            else { setMsg("✓"); setTimeout(() => setMsg(null), 1500); }
          });
        }}
        placeholder="+ type"
        aria-label="Deal service type"
        className="input !px-2 !py-0.5 !w-28 text-xs"
      />
      <datalist id={`deal-types-${dealId}`}>
        {[...new Set([...suggestions, ...COMMON_TYPES])].map((t) => <option key={t} value={t} />)}
      </datalist>
      {pending && <span className="text-xs text-navy-300/60">…</span>}
      {msg && <span className="text-xs text-emerald-300">{msg}</span>}
    </span>
  );
}
