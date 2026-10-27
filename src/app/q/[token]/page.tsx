// Customer-facing accept/decide page for multi-option quotes. The token is
// the secret: it is only ever handed out inside that customer's own quote
// email, so this page renders without any sign-in. Decisions are write-once —
// a second click (email clients prefetch links) shows the recorded reply
// instead of re-recording.
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { decideQuote } from "./actions";

export const dynamic = "force-dynamic";

/** Decode a JSONB options array defensively — a malformed row must not 500.
 *  Plain module, not an action: Next Server Actions must be async, and this
 *  is only a pure reader used while rendering. */
type DecodedOption = { key: string; name: string; amount: number; note: string | null };
function decodeOptions(raw: unknown): DecodedOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
    .map((o, i) => ({
      key: String(o.key ?? ["A", "B", "C", "D"][i] ?? `X${i}`),
      name: String(o.name ?? "Option"),
      amount: Number(o.amount) || 0,
      note: typeof o.note === "string" ? o.note : null,
    }));
}

const money = (n: number) => "$" + n.toFixed(2);

type Row = {
  id: string;
  organization_id: string;
  title: string;
  options: unknown;
  locale: string | null;
  decided: string | null;
  decided_at: Date | null;
  response_note: string | null;
  created_at: Date;
  customer_id: string | null;
};

export default async function QuoteDecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ o?: string; d?: string }>;
}) {
  const { token: rawToken } = await params;
  const sp = await searchParams;
  // Token-shaped only; anything else is not a lookup.
  if (!/^[0-9a-f-]{36}$/i.test(rawToken)) notFound();

  const rows = await sql`
    select r.id, r.organization_id, r.title, r.options, r.locale, r.decided, r.decided_at, r.response_note, r.created_at, r.customer_id,
           c.name as customer_name, o.name as org_name
    from quote_responses r
    left join customers c on c.id = r.customer_id
    left join organizations o on o.id = r.organization_id
    where r.token = ${rawToken}`;
  if (!rows.length) notFound();
  const q = rows[0] as unknown as Row & { customer_name: string | null; org_name: string | null };
  const options = decodeOptions(q.options);
  if (!options.length) notFound(); // data corrupted — do not render a decision surface

  const brand = q.org_name ?? "CUE";
  return (
    <div className="min-h-screen bg-[#0b0b18] text-white" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-300">{brand} · Your quote</div>
        <h1 className="text-2xl font-bold">{q.title}</h1>
        {q.customer_name && <p className="mt-1 text-sm text-[#8b93b8]">Prepared for {q.customer_name}</p>}

        {q.decided === "DECLINE" ? (
          <div className="card mt-8 border border-white/10 p-6" style={{ background: "#141428" }}>
            <div className="text-lg font-semibold">Thanks — noted.</div>
            <p className="mt-2 text-sm text-[#8b93b8]">Your reply: none of the options are right. A note was sent back to {brand}{q.response_note ? `: “${q.response_note}”` : "."} They&apos;ll take it from here.</p>
          </div>
        ) : q.decided ? (
          <div className="card mt-8 border border-emerald-500/30 p-6" style={{ background: "#141428" }}>
            <div className="text-lg font-semibold text-emerald-300">You&apos;re set — Option {q.decided} accepted ✓</div>
            <p className="mt-2 text-sm text-[#8b93b8]">Recorded for “{q.title}”. {brand} will confirm scheduling shortly{q.response_note ? ` and saw your note: “${q.response_note}”` : "."}</p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {options.map((o) => (
              <div key={o.key} className="card rounded-2xl border border-white/10 p-6" style={{ background: "#141428" }}>
                <form action={decideQuote} className="contents">
                  <input type="hidden" name="token" value={rawToken} />
                  <input type="hidden" name="choice" value={`o-${o.key}`} />
                  <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-lg font-bold">
                      Option {o.key} · {o.name}
                    </div>
                    <div className="text-lg font-bold text-violet-300">{money(o.amount)}</div>
                  </div>
                  {o.note && <p className="mt-1 text-xs text-[#8b93b8]">{o.note}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button className="rounded-full bg-violet-500 px-5 py-2 text-sm font-bold text-[#0b0b18] hover:bg-violet-400">
                      Accept Option {o.key} ✓
                    </button>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[#8b93b8]">Add a note with my answer (optional)</summary>
                    <textarea name={`note-${o.key}`} rows={2} className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white" placeholder={`Anything ${brand} should know…`} />
                  </details>
                </form>
              </div>
            ))}

            <div className="card rounded-2xl border border-white/10 p-5" style={{ background: "#141428" }}>
              <div className="text-sm text-[#8b93b8]">None of these work for you?</div>
              <form action={decideQuote} className="mt-2">
                <input type="hidden" name="token" value={rawToken} />
                <input type="hidden" name="choice" value="DECLINE" />
                <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                <button className="text-sm text-[#8b93b8] underline underline-offset-4 hover:text-white">
                  Decline all options — no hard feelings
                </button>
                <textarea name="note-DECLINE" rows={2} className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white" placeholder="Tell them what you actually need (optional)" />
              </form>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-[#6b7396]">Reply to the quote email for any other question — they answer same day.</p>
      </div>
    </div>
  );
}
