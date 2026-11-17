import Link from "next/link";

/** Shared footer for every public page: product, company, legal and contact. */
export default function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-bold text-white">CUE</div>
          <p className="muted mt-2 max-w-xs text-xs">
            The AI Business Operating System. CUE finds the money your business already
            earned — and waits for your approval before it acts.
          </p>
          <p className="muted mt-3 text-xs">Built by HASI Technologies.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-300">Product</div>
          <ul className="mt-3 space-y-2 text-navy-300">
            <li><Link href="/#loop" className="hover:text-white">How it works</Link></li>
            <li><Link href="/#pricing" className="hover:text-white">Pricing</Link></li>
            <li><Link href="/compare" className="hover:text-white">Compare</Link></li>
            <li><Link href="/score" className="hover:text-white">Revenue Leak Score</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-300">Company</div>
          <ul className="mt-3 space-y-2 text-navy-300">
            <li><Link href="/book" className="hover:text-white">Book a scan</Link></li>
            <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-5xl border-t border-white/[0.06] px-4 py-4 text-xs text-navy-300/60">
        © 2026 HASI Technologies · CUE is a product of HASI Technologies.
      </div>
    </footer>
  );
}
