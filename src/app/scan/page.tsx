import PublicHeader from "@/components/PublicHeader";
import { LogoMark } from "@/components/NavClient";
import ScanForm from "./ScanForm";

export const metadata = {
  title: "Book your free 20-minute leak scan — CUE",
  description:
    "A real 20-minute scan call on YOUR recent jobs, quotes and invoices. No demo numbers, no pitch — and if we don't find $1,000 in documented leaks, the pilot is free.",
};

/**
 * Flyer QR destination. Deliberately NOT a link to the live app demo: the
 * flyer promises scans of the prospect's own records, so this page books the
 * call and captures contact details instead of showing anyone else's store.
 */
export default function ScanPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center justify-center">
            <div className="cue-halo inline-flex">
              <LogoMark className="h-14 w-14" />
            </div>
          </div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-navy-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cue-orange" /> Free · 20 minutes · your numbers, not a demo
          </div>
          <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl">
            Find the money already <span className="bg-gradient-to-r from-cue-orange to-cue-red bg-clip-text text-transparent">leaking</span> out of your shop.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-navy-300">
            On the call, we run CUE live against last month's completed jobs, quote requests, and invoices you export
            or photograph. Every dollar traces to a real record you can open. If we don't find{" "}
            <strong className="text-white">$1,000 in documented leakage</strong>, the pilot is free — and you keep
            every finding either way.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <ScanForm />

          <div className="space-y-4">
            <div className="card p-6">
              <div className="text-xs uppercase tracking-widest text-cue-blue">How the 20 minutes go</div>
              <ul className="mt-3 space-y-3 text-sm text-navy-300">
                <li className="flex gap-3"><span className="font-bold text-white">1 ·</span> You export or photograph one month of jobs / invoices (5 minutes, and we help live).</li>
                <li className="flex gap-3"><span className="font-bold text-white">2 ·</span> CUE mines it while we talk: unbilled completed work, quotes nobody followed up, missed agreement offers.</li>
                <li className="flex gap-3"><span className="font-bold text-white">3 ·</span> You get the leak list with dollar amounts and the records attached — yours to keep, free.</li>
              </ul>
            </div>
            <div className="card p-6">
              <div className="text-xs uppercase tracking-widest text-cue-green">What this is not</div>
              <ul className="mt-3 space-y-3 text-sm text-navy-300">
                <li className="flex gap-3"><span className="text-white">✗</span> Not a demo store's numbers — only your own records.</li>
                <li className="flex gap-3"><span className="text-white">✗</span> Not a pitch deck — the call IS the scan.</li>
                <li className="flex gap-3"><span className="text-white">✗</span> Not a data grab — read-only, exports deleted after the pilot, nothing sold or shared.</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="muted mt-6 text-center text-xs">
          Prefer to start without a call? Take the free <a className="text-violet-300 underline" href="/score">Revenue Leak Score</a> — 60 seconds, 5 questions.
        </p>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-navy-300/60">
        <LogoMark className="me-1 inline h-4 w-4" /> CUE — The Heart of Your Business · Built by HASI Technologies
      </footer>
    </div>
  );
}
