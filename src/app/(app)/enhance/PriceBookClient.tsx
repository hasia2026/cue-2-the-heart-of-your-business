"use client";

import { useState, useTransition } from "react";
import { useLocale } from "@/components/useLocale";
import {
  createOffering,
  updateOfferingRates,
  createAssembly,
  deleteAssembly,
} from "./pricebook-actions";

export type Offering = {
  id: string;
  name: string;
  description: string | null;
  partsCost: number;
  rateStandalone: number;
  rateAddon: number;
  laborHours: number;
};
export type AssemblyLine = { offeringId: string; name: string; mode: "STANDALONE" | "ADDON" };
export type Assembly = {
  id: string;
  name: string;
  description: string | null;
  lines: AssemblyLine[];
};

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceBookClient({
  offerings: initialOfferings,
  assemblies: initialAssemblies,
  canEdit,
}: {
  offerings: Offering[];
  assemblies: Assembly[];
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [offerings, setOfferings] = useState(initialOfferings);
  const [assemblies, setAssemblies] = useState(initialAssemblies);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // --- new offering form state
  const [oName, setOName] = useState("");
  const [oDesc, setODesc] = useState("");
  const [oParts, setOParts] = useState("0");
  const [oRateStandalone, setORateStandalone] = useState("");
  const [oRateAddon, setORateAddon] = useState("");
  const [oHours, setOHours] = useState("1");

  // --- assembly builder state
  const [aName, setAName] = useState("");
  const [aDesc, setADesc] = useState("");
  const [picked, setPicked] = useState<AssemblyLine[]>([]);
  const [pickId, setPickId] = useState("");

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  function addOffering(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData();
    fd.set("name", oName); fd.set("description", oDesc);
    fd.set("partsCost", oParts); fd.set("rateStandalone", oRateStandalone);
    fd.set("rateAddon", oRateAddon); fd.set("laborHours", oHours);
    startTransition(async () => {
      const r = await createOffering(fd);
      if (r.ok) {
        // Optimistic local add so the new service shows without a factory reset.
        setOfferings((o) => [...o, {
          id: `new-${Date.now()}`, name: oName.trim(), description: oDesc.trim() || null,
          partsCost: Number(oParts) || 0, rateStandalone: Number(oRateStandalone) || 0,
          rateAddon: Number(oRateAddon) || 0, laborHours: Number(oHours) || 0,
        }]);
        setOName(""); setODesc(""); setOParts("0"); setORateStandalone(""); setORateAddon(""); setOHours("1");
        flash(t("pricebook.offeringAdded"), true);
      } else flash(r.error ?? "Failed", false);
    });
  }

  function reprice(offeringId: string, standalone: string, addon: string) {
    if (!canEdit) return;
    startTransition(async () => {
      const r = await updateOfferingRates(offeringId, Number(standalone) || 0, Number(addon) || 0);
      if (r.ok) flash(t("pricebook.ratesSaved"), true);
      else flash(r.error ?? "Failed", false);
    });
  }

  function buildAssembly(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData();
    fd.set("name", aName); fd.set("description", aDesc);
    picked.forEach((p) => { fd.append("offeringId", p.offeringId); fd.append("pricingMode", p.mode); });
    startTransition(async () => {
      const r = await createAssembly(fd);
      if (r.ok) {
        setAssemblies((a) => [...a, { id: `new-${Date.now()}`, name: aName.trim(), description: aDesc.trim() || null, lines: [...picked] }]);
        setAName(""); setADesc(""); setPicked([]); setPickId("");
        flash(t("pricebook.assemblySaved"), true);
      } else flash(r.error ?? "Failed", false);
    });
  }

  function removeAssembly(id: string) {
    if (!canEdit) return;
    startTransition(async () => {
      const r = await deleteAssembly(id);
      if (r.ok) { setAssemblies((a) => a.filter((x) => x.id !== id)); flash(t("pricebook.assemblyDeleted"), true); }
      else flash(r.error ?? "Failed", false);
    });
  }

  return (
    <section className="card p-6 space-y-6">
      <div>
        <h2 className="section-title">{t("pricebook.title")}</h2>
        <p className="muted mt-1 text-xs">{t("pricebook.sub")}</p>
      </div>
      {msg && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-cue-green/30 bg-emerald-500/10 text-emerald-200" : "border-cue-red/30 bg-red-500/10 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      {/* Services with dual labor rates */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-navy-300">
              <th className="py-2 text-start">{t("pricebook.service")}</th>
              <th className="py-2 text-end">{t("pricebook.parts")}</th>
              <th className="py-2 text-end">{t("pricebook.hours")}</th>
              <th className="py-2 text-end">{t("pricebook.rateStandalone")}</th>
              <th className="py-2 text-end">{t("pricebook.rateAddon")}</th>
            </tr>
          </thead>
          <tbody>
            {offerings.map((o) => (
              <OfferingRow key={o.id} o={o} canEdit={canEdit} busy={busy} onReprice={reprice} saveLabel={t("pricebook.saveRates")} />
            ))}
            {offerings.length === 0 && (
              <tr><td colSpan={5} className="muted py-3">{t("pricebook.noServices")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={addOffering} className="rounded-xl border border-white/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-3">{t("pricebook.addService")}</div>
          <div className="grid gap-2 md:grid-cols-3">
            <input aria-label="Service name" value={oName} onChange={(e) => setOName(e.target.value)} placeholder={t("pricebook.namePlaceholder")} className="input !py-1.5 text-xs" required />
            <input aria-label="Parts cost" value={oParts} onChange={(e) => setOParts(e.target.value)} className="input !py-1.5 text-xs" inputMode="decimal" />
            <input aria-label="Labor hours" value={oHours} onChange={(e) => setOHours(e.target.value)} className="input !py-1.5 text-xs" inputMode="decimal" />
            <input aria-label="Standalone rate" value={oRateStandalone} onChange={(e) => setORateStandalone(e.target.value)} placeholder="149" className="input !py-1.5 text-xs" inputMode="decimal" />
            <input aria-label="Add-on rate" value={oRateAddon} onChange={(e) => setORateAddon(e.target.value)} placeholder="119" className="input !py-1.5 text-xs" inputMode="decimal" />
            <input aria-label="Description" value={oDesc} onChange={(e) => setODesc(e.target.value)} placeholder={t("pricebook.descPlaceholder")} className="input !py-1.5 text-xs md:col-span-3" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary mt-2 !px-3 !py-1.5 text-xs">{t("pricebook.addServiceBtn")}</button>
        </form>
      )}

      {/* Assemblies */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-navy-300">{t("pricebook.assemblies")}</div>
        {assemblies.map((a) => {
          const total = a.lines.reduce((s, l) => {
            const off = offerings.find((o) => o.id === l.offeringId);
            if (!off) return s;
            const rate = l.mode === "ADDON" ? off.rateAddon : off.rateStandalone;
            return s + rate * (off.laborHours || 1) + (off.partsCost || 0);
          }, 0);
          const standalone = a.lines.reduce((s, l) => {
            const off = offerings.find((o) => o.id === l.offeringId);
            if (!off) return s;
            return s + off.rateStandalone * (off.laborHours || 1) + (off.partsCost || 0);
          }, 0);
          const savings = standalone - total;
          return (
            <div key={a.id} className="rounded-xl border border-white/[0.06] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-navy-100">{a.name}</span>
                <span className="badge-green ms-auto">bundle {usd(total)}</span>
                <span className="badge-blue">standalone {usd(standalone)}</span>
                {savings > 0 && <span className="badge-purple">customer saves {usd(savings)}</span>}
                {canEdit && (
                  <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => removeAssembly(a.id)}>{t("pricebook.delete")}</button>
                )}
              </div>
              {a.description && <div className="muted mt-1 text-xs">{a.description}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {a.lines.map((l, i) => (
                  <span key={`${l.offeringId}-${i}`} className={`badge ${l.mode === "ADDON" ? "badge-purple" : "badge-blue"}`}>
                    {l.name} · {l.mode === "ADDON" ? t("pricebook.addonRate") : t("pricebook.standaloneRate")}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {assemblies.length === 0 && <p className="muted text-xs">{t("pricebook.noAssemblies")}</p>}
      </div>

      {canEdit && (
        <form onSubmit={buildAssembly} className="rounded-xl border border-white/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-3">{t("pricebook.buildAssembly")}</div>
          <div className="grid gap-2 md:grid-cols-2">
            <input aria-label="Assembly name" value={aName} onChange={(e) => setAName(e.target.value)} placeholder={t("pricebook.assemblyNamePlaceholder")} className="input !py-1.5 text-xs" required />
            <select aria-label="Add a service line" value={pickId} onChange={(e) => {
              const off = offerings.find((o) => o.id === e.target.value);
              if (!off) return;
              setPicked((p) => [...p, { offeringId: off.id, name: off.name, mode: "STANDALONE" }]);
              setPickId("");
            }} className="input !py-1.5 text-xs">
              <option value="">{t("pricebook.pickService")}</option>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input aria-label="Assembly description" value={aDesc} onChange={(e) => setADesc(e.target.value)} placeholder={t("pricebook.assemblyDescPlaceholder")} className="input !py-1.5 text-xs md:col-span-2" />
          </div>
          {picked.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picked.map((l, i) => (
                <span key={`${l.offeringId}-${i}`} className="flex items-center gap-1">
                  <span className={`badge ${l.mode === "ADDON" ? "badge-purple" : "badge-blue"}`}>{l.name}</span>
                  <button type="button" className="btn-ghost !px-1.5 !py-0.5 text-[10px]"
                    onClick={() => setPicked((p) => p.map((x, j) => j === i ? { ...x, mode: x.mode === "ADDON" ? "STANDALONE" : "ADDON" } : x))}>
                    {l.mode === "ADDON" ? t("pricebook.toStandalone") : t("pricebook.toAddon")}
                  </button>
                  <button type="button" className="btn-ghost !px-1.5 !py-0.5 text-[10px]"
                    onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}>✕</button>
                </span>
              ))}
            </div>
          )}
          <button type="submit" disabled={busy || picked.length === 0} className="btn-primary mt-2 !px-3 !py-1.5 text-xs">{t("pricebook.buildAssemblyBtn")}</button>
        </form>
      )}
    </section>
  );
}

function OfferingRow({
  o, canEdit, busy, onReprice, saveLabel,
}: {
  o: Offering; canEdit: boolean; busy: boolean; saveLabel: string;
  onReprice: (id: string, standalone: string, addon: string) => void;
}) {
  const [standalone, setStandalone] = useState(String(o.rateStandalone));
  const [addon, setAddon] = useState(String(o.rateAddon));
  const dirty = Number(standalone) !== o.rateStandalone || Number(addon) !== o.rateAddon;
  return (
    <tr className="border-t border-white/[0.06]">
      <td className="py-2">
        <div className="font-medium text-navy-100">{o.name}</div>
        {o.description && <div className="muted text-xs">{o.description}</div>}
      </td>
      <td className="py-2 text-end text-xs text-navy-300">{usd(o.partsCost)}</td>
      <td className="py-2 text-end text-xs text-navy-300">{o.laborHours}</td>
      <td className="py-2 text-end">
        {canEdit ? (
          <input aria-label={`${o.name} standalone rate`} value={standalone}
            onChange={(e) => setStandalone(e.target.value)}
            className="input !px-2 !py-1 !w-20 text-xs text-end" inputMode="decimal" />
        ) : <span className="text-xs">{usd(o.rateStandalone)}</span>}
      </td>
      <td className="py-2 text-end">
        {canEdit ? (
          <input aria-label={`${o.name} add-on rate`} value={addon}
            onChange={(e) => setAddon(e.target.value)}
            className="input !px-2 !py-1 !w-20 text-xs text-end" inputMode="decimal" />
        ) : <span className="text-xs">{usd(o.rateAddon)}</span>}
      </td>
      {canEdit && (
        <td className="py-2 text-end">
          {dirty && (
            <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy}
              onClick={() => onReprice(o.id, standalone, addon)}>{saveLabel}</button>
          )}
        </td>
      )}
    </tr>
  );
}
