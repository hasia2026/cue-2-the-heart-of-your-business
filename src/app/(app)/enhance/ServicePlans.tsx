"use client";

// Service Plans (spec §4) — catalog editor + copyable links + submission
// inbox, shown in Enhance next to Brand Studio. Editing surfaces honor the
// same role gate as the price book (canEdit = not a MEMBER).
import { useState, useTransition } from "react";

type Plan = {
  id: string; name: string; blurb: string | null;
  annualValue: number; visitsPerYear: number | null;
  featured: boolean; active: boolean;
};
type Signup = {
  id: string; planName: string; contactName: string;
  contactEmail: string | null; contactPhone: string | null;
  address: string | null; message: string | null;
  source: string; sourceRef: string | null;
  customerMatched: boolean; customerName: string | null;
  status: string; submittedAt: string;
};
type Action = (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
type DecideAction = (fd: FormData) => Promise<void>;

export default function ServicePlans({
  plans, signups, plansUrl, localeUrls, canEdit, planErr, actions,
}: {
  plans: Plan[];
  signups: Signup[];
  plansUrl: string;
  localeUrls: Record<string, string>;
  canEdit: boolean;
  planErr?: string | null;
  actions: { savePlan: Action; deletePlan: Action; convertSignup: DecideAction; dismissSignup: DecideAction };
}) {
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function run(a: Action, fd: FormData) {
    startTransition(async () => {
      setMsg(null);
      const res = await a(fd);
      setMsg(res.ok ? "Saved ✓" : res.error ?? "Something went wrong.");
    });
  }

  const pending = signups.filter((s) => s.status === "PENDING");
  const decided = signups.filter((s) => s.status !== "PENDING");

  return (
    <div className="space-y-5">
      {/* ── Links card ── */}
      <section>
        <h2 className="section-title mb-3">Service plans & sign-up links</h2>
        <div className="card p-4">
          <p className="muted text-xs mb-2">
            Customer-facing sign-up page. Every quote and digest email carries a tracked button
            once at least one plan is active — these are the same links, ready to paste.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-white/[0.06] px-2 py-1 text-xs text-cue-green break-all">{plansUrl}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(plansUrl).then(() => setMsg("Link copied ✓"))}
              className="btn-ghost !px-2 !py-1 text-xs"
            >
              Copy link
            </button>
          </div>
          <div className="muted mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>Locale links:</span>
            {Object.entries(localeUrls).map(([l, u]) => (
              <button key={l} type="button" onClick={() => navigator.clipboard.writeText(u).then(() => setMsg(`${l.toUpperCase()} link copied ✓`))} className="badge badge-low cursor-pointer">
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Catalog editor ── */}
      <section>
        <h3 className="eyebrow mb-2">Plan catalog</h3>
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                {p.featured && <span className="badge badge-blue">featured</span>}
                {!p.active ? <span className="badge badge-low">off</span>
                  : <span className="badge badge-low text-cue-green">live on /plans</span>}
                <div className="ms-auto flex items-center gap-2">
                  <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="btn-ghost !px-2 !py-1 text-xs">
                    {openId === p.id ? "Close" : "Edit"}
                  </button>
                </div>
              </div>
              <p className="muted mt-1 text-xs">{p.blurb ?? "—"}</p>
              <p className="text-sm text-white">
                ${p.annualValue.toLocaleString()}/yr{p.visitsPerYear != null ? ` · ${p.visitsPerYear} visits/yr` : ""}
              </p>

              {openId === p.id && canEdit && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  <form
                    action={(fd) => {
                      fd.set("id", p.id);
                      run(actions.savePlan, fd);
                    }}
                    className="grid gap-2 md:grid-cols-2"
                  >
                    <label>
                      <span className="label">Name</span>
                      <input name="name" defaultValue={p.name} required maxLength={120} className="input" />
                    </label>
                    <label>
                      <span className="label">Annual price ($)</span>
                      <input name="annualValue" type="number" min="0" step="1" defaultValue={p.annualValue} className="input" />
                    </label>
                    <label className="md:col-span-2">
                      <span className="label">Short blurb (shown on the public page)</span>
                      <input name="blurb" defaultValue={p.blurb ?? ""} maxLength={400} className="input" />
                    </label>
                    <label>
                      <span className="label">Visits per year (optional)</span>
                      <input name="visitsPerYear" type="number" min="1" step="1" defaultValue={p.visitsPerYear ?? ""} className="input" />
                    </label>
                    <div className="flex items-end gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="featured" defaultChecked={p.featured} className="h-4 w-4 accent-violet-500" /> Featured
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4 accent-violet-500" /> Active
                      </label>
                    </div>
                    <div className="flex items-center gap-2 md:col-span-2">
                      <button className="btn-primary text-xs" disabled={busy}>Save plan</button>
                      <button
                        type="button"
                        onClick={() => {
                          const fd = new FormData(); fd.set("id", p.id);
                          run(actions.deletePlan, fd);
                        }}
                        className="btn-ghost text-xs text-red-300"
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ))}
          {plans.length === 0 && (
            <div className="card p-5 muted">
              No plans yet — add one below and the quote/digest emails pick the CTA up automatically.
            </div>
          )}

          {canEdit && (
            <form
              action={(fd) => run(actions.savePlan, fd)}
              className="card p-4 grid gap-2 md:grid-cols-2"
            >
              <div className="md:col-span-2"><span className="eyebrow">Add a plan</span></div>
              <label>
                <span className="label">Name</span>
                <input name="name" required maxLength={120} className="input" placeholder="Home Protection plan" />
              </label>
              <label>
                <span className="label">Annual price ($)</span>
                <input name="annualValue" type="number" min="0" step="1" defaultValue={0} className="input" />
              </label>
              <label className="md:col-span-2">
                <span className="label">Short blurb</span>
                <input name="blurb" maxLength={400} className="input" placeholder="Two tune-ups a year, priority scheduling, 15% off repairs." />
              </label>
              <label>
                <span className="label">Visits per year (optional)</span>
                <input name="visitsPerYear" type="number" min="1" step="1" className="input" />
              </label>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="featured" defaultChecked className="h-4 w-4 accent-violet-500" /> Featured
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-violet-500" /> Active
                </label>
              </div>
              <button className="btn-primary text-xs md:col-span-2 w-full md:w-auto" disabled={busy}>Add plan</button>
            </form>
          )}
        </div>
      </section>

      {/* ── Submission inbox ── */}
      <section>
        <h3 className="eyebrow mb-2">{pending.length ? `Requests waiting (${pending.length})` : "Sign-up requests"}</h3>
        {planErr && (
          <p className="mb-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300" role="alert">{planErr}</p>
        )}
        {msg && <p className="muted mb-2 text-xs" role="status">{msg}</p>}
        <div className="space-y-2">
          {pending.map((s) => (
            <SignupRow key={s.id} s={s} canEdit={canEdit} actions={actions} />
          ))}
          {pending.length === 0 && (
            <div className="card p-4 muted text-sm">
              Nothing pending. New sign-ups appear here the moment a customer submits from an email link or /plans page.
            </div>
          )}

          {decided.length > 0 && (
            <details className="mt-2">
              <summary className="muted cursor-pointer text-xs">Decided ({decided.length})</summary>
              <div className="mt-2 space-y-2">
                {decided.map((s) => (
                  <SignupRow key={s.id} s={s} canEdit={false} actions={actions} />
                ))}
              </div>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

function SignupRow({
  s, canEdit, actions,
}: {
  s: Signup;
  canEdit: boolean;
  actions: { convertSignup: DecideAction; dismissSignup: DecideAction };
}) {
  const pending = s.status === "PENDING";
  return (
    <div className={`card p-4 ${pending ? "border-l-2 border-violet-400" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="badge badge-low">{s.source.toLowerCase()}</span>
        {s.customerMatched ? (
          <span className="badge badge-blue">cust: {s.customerName}</span>
        ) : (
          <span className="badge badge-low">new contact</span>
        )}
        {!pending && (
          <span className={`badge ${s.status === "CONVERTED" ? "badge-blue" : "badge-low"}`}>
            {s.status.toLowerCase()}
          </span>
        )}
        <span className="text-xs text-navy-300/60 ms-auto">
          {new Date(s.submittedAt).toLocaleString()}
        </span>
      </div>
      <div className="mt-2 text-sm">
        <span className="font-semibold text-white">{s.contactName}</span> → <span className="text-cue-green">{s.planName}</span>
      </div>
      <p className="muted mt-1 text-xs">
        {[s.contactEmail, s.contactPhone, s.address].filter(Boolean).join(" · ") || "no contact details"}
      </p>
      {s.message && <p className="muted mt-1 text-xs italic">“{s.message}”</p>}
      {pending && canEdit && (
        <div className="mt-2 flex gap-2">
          {/* Form-action submit paths — work with JS off, so the one-click
              conversion is exercisable end-to-end and auditable. Errors come
              back as ?planErr=… on the page (server-side redirect). */}
          <form action={actions.convertSignup}>
            <input type="hidden" name="signupId" value={s.id} />
            <button type="submit" className="btn-primary text-xs">Create agreement</button>
          </form>
          <form action={actions.dismissSignup}>
            <input type="hidden" name="signupId" value={s.id} />
            <button type="submit" className="btn-ghost text-xs">Dismiss</button>
          </form>
        </div>
      )}
    </div>
  );
}
