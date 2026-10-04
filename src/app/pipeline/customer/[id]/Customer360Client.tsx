"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money, agoLabel } from "@/lib/format";
import { isRtl, type Locale } from "@/lib/i18n";
import { logCustomerContactAction } from "../../actions";

type Customer = {
  id: string; name: string; email: string | null; phone: string | null;
  type: string; servicePlan: string | null; address: string | null; createdAt: string;
};
type Vehicle = { id: string; year: number; make: string; model: string; trim: string | null; stockNumber: string; status: string };
type Order = { id: string; title: string; status: string; amount: number; openedAt: string; completedAt: string | null };
type Invoice = { id: string; number: string; amount: number; status: string; issuedAt: string | null; paidAt: string | null };
type Comm = { id: string; channel: string; direction: string; summary: string; occurredAt: string };
type Deal = { id: string; status: string; amount: number; vehicle: string | null; createdAt: string };

const CHANNELS = [
  { key: "PHONE", label: "📞 Call" },
  { key: "EMAIL", label: "✉ Email" },
  { key: "SMS", label: "💬 Text" },
  { key: "IN_PERSON", label: "🤝 In person" },
] as const;

export default function Customer360Client({
  locale, customer, vehicles, orders, invoices, comms, deals, leadId,
}: {
  locale: Locale; customer: Customer; vehicles: Vehicle[]; orders: Order[];
  invoices: Invoice[]; comms: Comm[]; deals: Deal[]; leadId: string | null;
}) {
  const rtl = isRtl(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<string>("PHONE");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [summary, setSummary] = useState("");

  const owed = invoices.filter((i) => i.status !== "PAID" && i.status !== "VOID").reduce((s, i) => s + i.amount, 0);
  const lifetime = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0)
    + deals.filter((d) => d.status === "WON").reduce((s, d) => s + d.amount, 0);

  async function saveContact() {
    if (summary.trim().length < 2) return;
    setBusy(true);
    try {
      await logCustomerContactAction(customer.id, { channel, direction, summary });
      setSummary("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={rtl ? "rtl-main" : ""}>
      <div className="flex items-center gap-2 text-xs text-navy-300 mb-2">
        <Link href="/pipeline" className="hover:text-navy-700">← Pipeline</Link>
        <span>/</span>
        <span>Customer</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-navy-900">{customer.name}</h1>
        <span className="badge-low">{customer.type}</span>
        {customer.servicePlan && <span className="badge-blue">{customer.servicePlan}</span>}
      </div>
      <div className="text-sm text-navy-400 mb-5">
        {customer.email ?? "no email"} · {customer.phone ?? "no phone"}
        {customer.address ? ` · ${customer.address}` : ""} · customer since {new Date(customer.createdAt).toLocaleDateString()}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-lg font-bold text-accent-blue">{money(lifetime)}</div>
          <div className="text-xs text-navy-400">lifetime value</div>
        </div>
        <div className="card p-4">
          <div className={`text-lg font-bold ${owed > 0 ? "text-accent-orange" : "text-navy-900"}`}>{money(owed)}</div>
          <div className="text-xs text-navy-400">still owed</div>
        </div>
        <div className="card p-4">
          <div className="text-lg font-bold text-navy-900">{orders.length}</div>
          <div className="text-xs text-navy-400">service visits</div>
        </div>
        <div className="card p-4">
          <div className="text-lg font-bold text-navy-900">{comms.length}</div>
          <div className="text-xs text-navy-400">logged touches</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* One-click contact logging */}
          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-navy-900">Log a touch</div>
            <div className="flex gap-1.5 flex-wrap">
              {CHANNELS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setChannel(c.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${channel === c.key ? "border-accent-blue/50 text-white bg-accent-blue/15" : "border-navy-50 text-navy-400 hover:text-navy-700"}`}
                >
                  {c.label}
                </button>
              ))}
              <button
                onClick={() => setDirection(direction === "OUTBOUND" ? "INBOUND" : "OUTBOUND")}
                className="ml-auto text-[11px] text-navy-400 hover:text-navy-700 px-2"
              >
                {direction === "OUTBOUND" ? "we reached out →" : "← they contacted us"}
              </button>
            </div>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="input"
              placeholder="e.g. Reminder call — 30k service due, booked for Friday 9am…"
            />
            <button disabled={busy || summary.trim().length < 2} onClick={saveContact} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
              Log contact
            </button>
          </div>

          {/* Communication timeline */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 px-1">Communication timeline</div>
            {comms.length === 0 ? (
              <div className="card p-5 text-center text-navy-300 text-sm">No touches logged yet.</div>
            ) : (
              comms.map((c) => (
                <div key={c.id} className="card p-3.5 flex gap-3">
                  <span className="text-lg">{c.channel === "PHONE" ? "📞" : c.channel === "EMAIL" ? "✉" : c.channel === "SMS" ? "💬" : "🤝"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-navy-300">{c.direction === "INBOUND" ? "they said" : "we said"} · {agoLabel(c.occurredAt)}</div>
                    <p className="text-sm text-navy-700 mt-0.5">{c.summary}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-5">
          {leadId && (
            <Link href={`/pipeline/lead/${leadId}`} className="card card-hover p-4 block">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-1">In pipeline</div>
              <div className="text-sm text-blue-300">Open the originating lead →</div>
            </Link>
          )}

          {vehicles.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Vehicles</div>
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-2 py-1.5 border-b border-navy-50 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-navy-700">{v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}</div>
                    <div className="text-[11px] text-navy-300">stock {v.stockNumber}</div>
                  </div>
                  <span className="ml-auto badge-low">{v.status}</span>
                </div>
              ))}
            </div>
          )}

          {deals.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Deals</div>
              {deals.map((d) => (
                <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-navy-50 last:border-0">
                  <span className="badge-low">{d.status}</span>
                  <span className="text-xs text-navy-500 truncate">{d.vehicle ?? "—"}</span>
                  <span className="ml-auto text-sm font-semibold text-accent-blue">{money(d.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {orders.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Service orders</div>
              {orders.map((o) => (
                <div key={o.id} className="py-1.5 border-b border-navy-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.status === "COMPLETED" ? "bg-blue-400/15 text-blue-300" : "bg-white/10 text-navy-400"}`}>{o.status}</span>
                    <span className="ml-auto text-sm text-navy-700">{o.amount > 0 ? money(o.amount) : "—"}</span>
                  </div>
                  <div className="text-xs text-navy-500 mt-0.5">{o.title} · {agoLabel(o.openedAt)}</div>
                </div>
              ))}
            </div>
          )}

          {invoices.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Invoices</div>
              {invoices.map((i) => (
                <div key={i.id} className="flex items-center gap-2 py-1.5 border-b border-navy-50 last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${i.status === "PAID" ? "bg-blue-400/15 text-blue-300" : i.status === "OVERDUE" ? "bg-red-400/15 text-red-300" : "bg-white/10 text-navy-400"}`}>{i.status}</span>
                  <span className="text-xs text-navy-500">{i.number}</span>
                  <span className="ml-auto text-sm text-navy-700">{money(i.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
