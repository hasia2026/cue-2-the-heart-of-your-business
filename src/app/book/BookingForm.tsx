"use client";

import { useMemo, useState } from "react";

const TIMES = ["10:00 AM", "1:30 PM", "3:30 PM"];

function nextWeekdays(count: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
  }
  return out;
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);

export default function BookingForm() {
  const days = useMemo(() => nextWeekdays(8), []);
  const [slot, setSlot] = useState<{ key: string; label: string } | null>(null);
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [confirmation, setConfirmation] = useState<"sent" | "skipped" | "failed" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    if (!slot) {
      setState("err");
      setMsg("Pick a day and time that works for you.");
      return;
    }
    setState("busy");
    setMsg(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shop: shop.trim(),
          phone: phone.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          source: "WEB",
          preferredTime: `${slot.label} (requested)`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConfirmation(data.confirmation === "sent" ? "sent" : data.confirmation === "failed" ? "failed" : "skipped");
      setState("ok");
    } catch (err) {
      setState("err");
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (state === "ok") {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">✓</div>
        <h2 className="text-xl font-semibold text-white">Slot requested.</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          We have you down for <strong className="text-white">{slot?.label}</strong>.{" "}
          {confirmation === "sent" ? (
            <>
              A confirmation email with this slot and the next steps is on its way to{" "}
              <strong className="text-white">{email.trim()}</strong>. If that time has just gone,
              we&apos;ll offer the nearest one.
            </>
          ) : confirmation === "failed" ? (
            <>
              We saved your request, but the confirmation email could not be sent. We&apos;ll still
              confirm by email or text within one business hour.
            </>
          ) : (
            <>
              A real person will confirm by email or text within one business hour — if that time
              has just gone, we will offer the nearest one.
            </>
          )}
        </p>
        <p className="muted mt-3 text-xs">20 minutes · your own records · no pitch deck.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-white">Pick a time</h2>
      <p className="muted mt-1 text-sm">Next business days, 20 minutes each. Times shown in your local time.</p>

      <div className="mt-4 space-y-2">
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          return (
            <div key={key} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2">
              <span className="w-24 text-sm text-navy-100">{fmt(d)}</span>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((time) => {
                  const label = `${fmt(d)} at ${time}`;
                  const active = slot?.key === `${key}-${time}`;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSlot({ key: `${key}-${time}`, label })}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-violet-400/60 bg-violet-500/25 text-white"
                          : "border-white/10 text-navy-300 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label className="label" htmlFor="book-name">Your name</label>
          <input id="book-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex Rivera" />
        </div>
        <div>
          <label className="label" htmlFor="book-shop">Business name</label>
          <input id="book-shop" required maxLength={200} value={shop} onChange={(e) => setShop(e.target.value)} className="input" placeholder="Rivera Air Conditioning" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="book-phone">Phone (we&apos;ll text)</label>
            <input id="book-phone" required maxLength={40} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(555) 555-0123" />
          </div>
          <div>
            <label className="label" htmlFor="book-email">Email (for confirmation)</label>
            <input id="book-email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@yourshop.com" />
          </div>
        </div>
        {state === "err" && msg && (
          <div className="rounded-xl border border-cue-red/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{msg}</div>
        )}
        <button disabled={state === "busy"} className="btn-primary w-full">
          {state === "busy" ? "Requesting…" : slot ? `Request ${slot.label} →` : "Pick a time above →"}
        </button>
        <p className="text-center text-[11px] text-navy-300/60">
          Read-only exports · shown only to you · deleted after the pilot
        </p>
      </form>
    </div>
  );
}
