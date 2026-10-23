"use client";

import { useState } from "react";

export default function ScanForm() {
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shop: shop.trim(),
          phone: phone.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          source: "FLYER",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setState("ok");
    } catch (err) {
      setState("err");
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (state === "ok") {
    return (
      <div className="card p-7 text-center">
        <div className="text-4xl mb-2">✓</div>
        <h2 className="text-xl font-semibold text-white">You're in the queue.</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          A real person (not a bot) will text or call <strong className="text-white">{phone.trim()}</strong> within one
          business day to lock a time. The call is 20 minutes: we run CUE live against{" "}
          <strong className="text-emerald-300">your</strong> recent jobs, quotes and invoices — you see your own leaks,
          not a demo store's numbers.
        </p>
        <p className="muted mt-3 text-xs">Bring nothing. If we don't find $1,000 in documented leaks, the pilot is free — and you keep every finding either way.</p>
      </div>
    );
  }

  return (
    <div className="card p-7">
      <h2 className="text-xl font-semibold text-white">Book the free scan call</h2>
      <p className="muted mt-1 text-sm">
        Three fields — enough to reach you, nothing else. We never share, sell, or keep your exports after the pilot.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label className="label" htmlFor="scan-name">Your name</label>
          <input id="scan-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex Rivera" />
        </div>
        <div>
          <label className="label" htmlFor="scan-shop">Shop / store name</label>
          <input id="scan-shop" required maxLength={200} value={shop} onChange={(e) => setShop(e.target.value)} className="input" placeholder="Rivera Air Conditioning" />
        </div>
        <div>
          <label className="label" htmlFor="scan-phone">Mobile phone (we'll text you)</label>
          <input id="scan-phone" required maxLength={40} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(555) 555-0123" />
        </div>
        <div>
          <label className="label" htmlFor="scan-email">Email (optional)</label>
          <input id="scan-email" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@yourshop.com" />
        </div>
        {state === "err" && msg && (
          <div className="rounded-xl border border-cue-red/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{msg}</div>
        )}
        <button disabled={state === "busy"} className="btn-primary w-full">
          {state === "busy" ? "Saving…" : "Get my free 20-min scan call →"}
        </button>
        <p className="text-center text-[11px] text-navy-300/60">
          Read-only exports · shown only to you · deleted after the pilot
        </p>
      </form>
    </div>
  );
}
