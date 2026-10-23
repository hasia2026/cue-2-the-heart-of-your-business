import { headers } from "next/headers";
import { sql } from "@/lib/db";
import PublicHeader from "@/components/PublicHeader";
import { LogoMark } from "@/components/NavClient";
import { createPartnerAction } from "./actions";
import { pilotInboxEmail } from "@/lib/leads";

export const metadata = {
  title: "CUE Partner Program — earn 50% recurring revenue",
  description:
    "Share CUE with businesses you know. Earn 50% of every subscription payment for as long as your referral stays subscribed — split automatically by Stripe.",
};

const PERKS = [
  ["50% recurring", "Not a one-time bounty. Half of every monthly payment, for as long as your referral stays subscribed."],
  ["Lifetime attribution", "One business = one partner. The first link they sign up through credits you permanently."],
  ["Automatic split", "Stripe Connect splits each payment at purchase time — no manual invoices, no waiting on us."],
  ["Fair clawback", "If a customer is refunded, the matching commission is reversed too. Everyone stays whole."],
] as const;

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; err?: string; onboarded?: string }>;
}) {
  const { code, err, onboarded } = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3210";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.APP_URL ?? `${proto}://${host}`;

  const partner = code
    ? (await sql`select name, code, stripe_onboarded, commission_pct from partners where code = ${code} and status = 'ACTIVE'`)[0]
    : null;

  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="text-center">
        <div className="cue-halo mx-auto mb-5 inline-flex">
          <LogoMark className="h-14 w-14" />
        </div>
        <div className="eyebrow mb-3">Partner program</div>
        <h1 className="page-title text-3xl md:text-4xl">
          Introduce CUE. Earn <span className="hero-gradient">50% forever.</span>
        </h1>
        <p className="muted mx-auto mt-3 max-w-xl">
          You know businesses that are leaking money. CUE finds and recovers it.
          Bring them in and share half of every subscription payment — for as long
          as they stay, split automatically at purchase by Stripe.
        </p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {PERKS.map(([title, desc]) => (
          <div key={title} className="card p-5">
            <div className="font-semibold text-white">{title}</div>
            <p className="muted mt-1 text-xs">{desc}</p>
          </div>
        ))}
      </div>

      {partner ? (
        <div className="card mt-10 p-6">
          <div className="section-title mb-1">Your partner link, {partner.name.split(" ")[0]}</div>
          <p className="muted mb-4 text-xs">
            Commission: {partner.commission_pct}% of every payment · code <span className="text-violet-300">{partner.code}</span>
          </p>

          <label className="label" htmlFor="reflink">Your unique link — share it anywhere</label>
          <input id="reflink" readOnly value={`${origin}/signup?ref=${partner.code}`} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a className="btn-primary" href={`/api/partners/connect?code=${partner.code}`}>
              {partner.stripe_onboarded ? "Manage payout account (Stripe)" : "Connect Stripe to get paid"}
            </a>
            <a className="btn-ghost" href={`/signup?ref=${partner.code}`}>Preview the signup page →</a>
          </div>
          {onboarded ? (
            <p className="mt-3 text-xs text-emerald-300">Stripe onboarding finished — future referred subscriptions split automatically.</p>
          ) : err === "stripe" ? (
            <p className="mt-3 text-xs text-amber-300">
              Stripe payouts aren&apos;t wired up on this deployment yet (missing STRIPE_SECRET_KEY). Your link still works and attribution is already tracked.
            </p>
          ) : (
            <p className="muted mt-3 text-xs">
              One-time Stripe setup (about 2 minutes). After that, every payment from your referrals splits 50/50 automatically.
            </p>
          )}
        </div>
      ) : (
        <div className="card mt-10 p-6">
          <div className="section-title mb-4">Get your link</div>
          <form action={createPartnerAction} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" name="name" required className="input" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="email">Payout email</label>
              <input id="email" name="email" type="email" required className="input" autoComplete="email" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary w-full sm:w-auto">Create my partner link</button>
            </div>
          </form>
          <p className="muted mt-3 text-xs">
            Already registered? Use the same email and we&apos;ll show your link again.
          </p>
        </div>
      )}

      <p className="muted mt-8 text-center text-xs">
        Questions? <a className="text-violet-300 underline" href={`mailto:${pilotInboxEmail()}?subject=CUE%20partner%20program`}>{pilotInboxEmail()}</a>
      </p>
    </div>
    </>
  );
}
