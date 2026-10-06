"use client";

import { useMemo, useState } from "react";
import { captureDocument } from "../capture/actions";

type Veh = { id: string; label: string; cost: number; days: number; listPrice: number };
type Mode = "job" | "vehicle" | "product";
type IndKey = "pitch.indAuto" | "pitch.indService" | "pitch.indSalon" | "pitch.indOther";

const IND_MODE: Record<string, Mode> = {
  AUTO_DEALERSHIP: "vehicle",
  SALON: "product",
  BEAUTY: "product",
  SPA: "product",
  RETAIL: "product",
};

function defaultMode(industry: string): Mode {
  return IND_MODE[industry.toUpperCase()] ?? "job";
}

function industryLabelKey(industry: string): IndKey {
  const i = industry.toUpperCase();
  if (i.includes("AUTO") || i.includes("DEALER")) return "pitch.indAuto";
  if (i.includes("SALON") || i.includes("BEAUTY") || i.includes("SPA") || i.includes("RETAIL")) return "pitch.indSalon";
  if (i.includes("SERVICE") || i.includes("CONTRACT") || i.includes("HVAC") || i.includes("PLUMB")) return "pitch.indService";
  return "pitch.indOther";
}

export default function PricingStudio({ industry, vehicles, labels }: {
  industry: string; vehicles: Veh[]; labels: Record<string, string>;
}) {
  const t = (k: string) => labels[k] ?? k;
  const [mode, setMode] = useState<Mode>(defaultMode(industry));
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [fail, setFail] = useState(false);

  const [margin, setMargin] = useState(30);
  const [vehId, setVehId] = useState("");
  const [cost, setCost] = useState(0);
  const [recon, setRecon] = useState(500);
  const [days, setDays] = useState(45);
  const [market, setMarket] = useState(0);
  const [hours, setHours] = useState(4);
  const [rate, setRate] = useState(95);
  const [parts, setParts] = useState(250);
  const [fees, setFees] = useState(0);
  const [overhead, setOverhead] = useState(15);
  const [unitCost, setUnitCost] = useState(12);
  const [timeMin, setTimeMin] = useState(45);
  const [staffRate, setStaffRate] = useState(40);

  const usd = (v: number, dec = 2) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v);

  const pick = (id: string) => {
    setVehId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setCost(v.cost);
      setDays(v.days);
    }
  };

  const r = useMemo(() => {
    if (mode === "vehicle") {
      const base = cost + recon;
      const trimPct = days > 60 ? Math.min(12, Math.ceil((days - 60) / 5)) : 0;
      const raw = base * (1 + (margin + market) / 100);
      const suggest = Math.round(raw * (1 - trimPct / 100));
      return {
        suggest,
        floor: Math.round(base),
        extra: usd(Math.max(0, suggest - base), 0),
        why: [
          t("pricing.whyBase").replace("{x}", usd(base, 0)),
          t("pricing.whyMargin").replace(/\{pct\}/g, String(margin)),
          ...(market !== 0
            ? [t("pricing.whyMarket").replace("{pct}", String(market)).replace("{x}", usd(base * (market / 100), 0))]
            : []),
          days > 60
            ? t("pricing.whyAging").replace("{days}", String(days)).replace("{pct}", String(trimPct))
            : t("pricing.whyNoAging").replace("{days}", String(days)),
          t("pricing.whyFloor"),
        ],
      };
    }
    const direct = mode === "job" ? hours * rate + parts + fees : unitCost + (timeMin / 60) * staffRate;
    const oh = direct * (overhead / 100);
    const total = direct + oh;
    const m = Math.min(95, margin);
    const price = total / (1 - m / 100);
    const per = mode === "job" ? hours : timeMin / 60;
    return {
      suggest: Math.round(price * 100) / 100,
      floor: Math.round(total * 100) / 100,
      extra: per > 0 ? usd(price / per) : "—",
      why: [
        t("pricing.whyBase").replace("{x}", usd(direct)),
        t("pricing.whyOverhead").replace("{pct}", String(overhead)).replace("{x}", usd(oh)),
        t("pricing.whyMargin").replace(/\{pct\}/g, String(m)),
        t("pricing.whyFloor"),
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cost, recon, days, margin, market, hours, rate, parts, fees, overhead, unitCost, timeMin, staffRate]);

  async function capture() {
    if (busy) return;
    setBusy(true);
    setFail(false);
    try {
      const label = mode === "vehicle" ? t("pricing.tabVehicle") : mode === "job" ? t("pricing.tabJob") : t("pricing.tabProduct");
      const fd = new FormData();
      fd.set("note", `${label}: ${usd(r.suggest, 2)} — ${r.why.join(" ")}`);
      await captureDocument(fd);
      setCaptured(t("pricing.captured"));
    } catch {
      setFail(true);
      setCaptured(t("capture.failed"));
    } finally {
      setBusy(false);
    }
  }

  const num = (label: string, v: number | string, set: (n: number) => void, step = "1") => (
    <div>
      <label className="label">{label}</label>
      <input type="number" step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="input" />
    </div>
  );

  const tab = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`rounded-xl px-3 py-1.5 text-sm transition ${mode === m ? "bg-violet-500/20 font-semibold text-violet-200 shadow-glow" : "text-navy-100/70 hover:bg-white/[0.05] hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title">{t("pricing.title")}</h2>
        <span className="badge-purple">{t("pricing.defaultFor")}: {t(industryLabelKey(industry))}</span>
        <span className="muted ms-auto text-xs">{t("pricing.subtitle")}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tab("job", t("pricing.tabJob"))}
        {tab("vehicle", t("pricing.tabVehicle"))}
        {tab("product", t("pricing.tabProduct"))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "vehicle" && (
            <>
              <div className="sm:col-span-2">
                <label className="label">{t("pricing.pickVehicle")}</label>
                <select value={vehId} onChange={(e) => pick(e.target.value)} className="input">
                  <option value="">{t("pricing.pickManual")}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.label} — {v.days}d</option>
                  ))}
                </select>
                {vehicles.length > 0 && (
                  <p className="muted mt-1 text-xs">{t("pricing.invLoaded").replace("{n}", String(vehicles.length))}</p>
                )}
              </div>
              {num(t("pricing.vehicleCost"), cost, setCost, "100")}
              {num(t("pricing.recon"), recon, setRecon, "50")}
              {num(t("pricing.daysOnLot"), days, setDays)}
              {num(t("pricing.targetMargin"), margin, setMargin)}
              <div>
                <label className="label">{t("pricing.marketAdj")}</label>
                <input type="range" min={-10} max={10} value={market} onChange={(e) => setMarket(Number(e.target.value))} className="w-full accent-cue-blue" />
                <div className="flex justify-between text-[10px] text-navy-300/70"><span>-10</span><span>{market}</span><span>+10</span></div>
                <p className="muted mt-1 text-xs">{t("pricing.marketHint")}</p>
              </div>
            </>
          )}
          {mode === "job" && (
            <>
              {num(t("pricing.laborHours"), hours, setHours, "0.5")}
              {num(t("pricing.laborRate"), rate, setRate)}
              {num(t("pricing.parts"), parts, setParts, "10")}
              {num(t("pricing.fees"), fees, setFees, "5")}
              {num(t("pricing.overhead"), overhead, setOverhead)}
              {num(t("pricing.targetMargin"), margin, setMargin)}
            </>
          )}
          {mode === "product" && (
            <>
              {num(t("pricing.unitCost"), unitCost, setUnitCost, "0.5")}
              {num(t("pricing.timeMin"), timeMin, setTimeMin, "5")}
              {num(t("pricing.staffRate"), staffRate, setStaffRate)}
              {num(t("pricing.overhead"), overhead, setOverhead)}
              {num(t("pricing.targetMargin"), margin, setMargin)}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-5">
          <div className="text-xs uppercase tracking-widest text-violet-300">{t("pricing.suggest")}</div>
          <div className="mt-1 text-3xl font-bold text-white">{usd(r.suggest, mode === "vehicle" ? 0 : 2)}</div>
          <div className="mt-3 space-y-1 text-sm text-navy-100">
            <div className="flex justify-between"><span className="text-navy-300">{t("pricing.floor")}</span><span>{usd(r.floor, mode === "vehicle" ? 0 : 2)}</span></div>
            <div className="flex justify-between">
              <span className="text-navy-300">{mode === "vehicle" ? t("pricing.gross") : t("pricing.effRate")}</span>
              <span className="text-emerald-300">{r.extra}</span>
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.08] pt-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-navy-300">{t("pricing.why")}</div>
            <ul className="mt-2 space-y-1.5 text-xs text-navy-300">
              {r.why.map((w, i) => (
                <li key={i} className="flex gap-2"><span className="text-violet-300">•</span><span>{w}</span></li>
              ))}
            </ul>
          </div>
          <button onClick={capture} disabled={busy} className="btn-primary mt-4 w-full">
            {busy ? t("capture.processing") : t("pricing.capture")}
          </button>
          {captured && (
            <p className={`mt-2 text-xs ${fail ? "text-red-300" : "text-emerald-300"}`}>{captured}</p>
          )}
        </div>
      </div>
    </section>
  );
}
