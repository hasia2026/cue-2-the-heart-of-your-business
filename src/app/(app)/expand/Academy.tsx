"use client";

import { useEffect, useState } from "react";
import type { DictKey } from "@/lib/i18n";
import { captureDocument } from "../capture/actions";

type TrackKey = "auto" | "service" | "salon";
type PitchKey = "pitch.indAuto" | "pitch.indService" | "pitch.indSalon" | "pitch.indOther";

function trackFor(industry: string): TrackKey {
  const i = industry.toUpperCase();
  if (i.includes("AUTO") || i.includes("DEALER")) return "auto";
  if (i.includes("SALON") || i.includes("BEAUTY") || i.includes("SPA") || i.includes("RETAIL")) return "salon";
  return "service";
}

type CloseKey = "pitch.autoClose" | "pitch.serviceClose" | "pitch.salonClose" | "pitch.genericClose";

function pitchKeys(industry: string): { ind: PitchKey; close: CloseKey } {
  const i = industry.toUpperCase();
  if (i.includes("AUTO") || i.includes("DEALER")) return { ind: "pitch.indAuto", close: "pitch.autoClose" };
  if (i.includes("SALON") || i.includes("BEAUTY") || i.includes("SPA") || i.includes("RETAIL"))
    return { ind: "pitch.indSalon", close: "pitch.salonClose" };
  if (i.includes("SERVICE") || i.includes("CONTRACT") || i.includes("HVAC") || i.includes("PLUMB"))
    return { ind: "pitch.indService", close: "pitch.serviceClose" };
  return { ind: "pitch.indOther", close: "pitch.genericClose" };
}

export default function Academy({ industry, mission, customers, offerings, labels }: {
  industry: string; mission: string; customers: string; offerings: string; labels: Record<string, string>;
}) {
  const t = (k: string) => labels[k] ?? k;
  const [track, setTrack] = useState<TrackKey>(trackFor(industry));
  const [done, setDone] = useState<string[]>([]);
  const [pitch, setPitch] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem("cue.training.done") ?? "[]") as string[]);
    } catch { /* ignore */ }
  }, []);

  function toggle(key: string) {
    const next = done.includes(key) ? done.filter((d) => d !== key) : [...done, key];
    setDone(next);
    try { localStorage.setItem("cue.training.done", JSON.stringify(next)); } catch { /* ignore */ }
  }

  const lessons = [1, 2, 3].map((i) => ({
    key: `${track}.l${i}`,
    title: t(("training." + track + ".l" + i + "t") as DictKey),
    body: t(("training." + track + ".l" + i + "b") as DictKey),
  }));
  const completed = lessons.filter((l) => done.includes(l.key)).length;

  function generate() {
    const top3 = offerings.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ");
    const pk = pitchKeys(industry);
    setPitch(
      `${t("pitch.opening").replace("{mission}", mission || "—").replace("{customers}", customers || "—").replace("{offerings}", top3 || "—")}\n\n${t(pk.close)}`,
    );
    setCopied(false);
    setCaptured(null);
  }

  async function copy() {
    if (!pitch) return;
    try { await navigator.clipboard.writeText(pitch); setCopied(true); } catch { /* ignore */ }
  }

  async function savePitch() {
    if (!pitch) return;
    try {
      const fd = new FormData();
      fd.set("note", `Pitch (${t(pitchKeys(industry).ind)}): ${pitch}`);
      await captureDocument(fd);
      setCaptured(t("pitch.saved"));
    } catch {
      setCaptured(t("capture.failed"));
    }
  }

  const trackTab = (k: TrackKey, label: string) => (
    <button
      key={k}
      onClick={() => setTrack(k)}
      className={`rounded-xl px-3 py-1.5 text-sm transition ${track === k ? "bg-emerald-500/20 font-semibold text-emerald-200" : "text-navy-100/70 hover:bg-white/[0.05] hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title">{t("training.title")}</h2>
        <span className="muted ms-auto text-xs">{t("training.subtitle")}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {trackTab("auto", t("training.auto.title"))}
        {trackTab("service", t("training.service.title"))}
        {trackTab("salon", t("training.salon.title"))}
        <span className="ms-auto text-xs text-emerald-300">{t("training.progress")}: {completed}/3</span>
      </div>

      <p className="muted mt-2 text-sm">{t(("training." + track + ".desc") as DictKey)}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {lessons.map((l) => {
          const isDone = done.includes(l.key);
          return (
            <div key={l.key} className={`rounded-xl border p-4 ${isDone ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/[0.06]"}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 text-sm ${isDone ? "text-emerald-300" : "text-navy-300"}`}>{isDone ? "✓" : "○"}</span>
                <div>
                  <div className="text-sm font-semibold text-white">{l.title}</div>
                  <p className="muted mt-1 text-xs leading-relaxed">{l.body}</p>
                </div>
              </div>
              <button onClick={() => toggle(l.key)} className="btn-ghost mt-3 !py-1 !text-xs">
                {isDone ? t("training.done") : t("training.markDone")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.06] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="font-semibold text-white">{t("pitch.title")}</div>
            <p className="muted text-xs">{t("pitch.subtitle")}</p>
          </div>
          <button onClick={generate} className="btn-primary ms-auto">{t("pitch.generate")}</button>
        </div>
        {pitch && (
          <div className="mt-4">
            <div className="whitespace-pre-line rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-navy-100">{pitch}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={copy} className="btn-ghost !py-1.5 !text-xs">{copied ? t("pitch.copied") : t("pitch.copy")}</button>
              <button onClick={savePitch} className="btn-ghost !py-1.5 !text-xs">{t("pitch.capture")}</button>
              {captured && <span className="self-center text-xs text-emerald-300">{captured}</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
