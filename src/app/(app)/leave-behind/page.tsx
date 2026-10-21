import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getLeakTotals } from "@/lib/intelligence";
import { getWorkspaceProfile, validAccent } from "@/lib/workspace-profile";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function LeaveBehindPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const totals = await getLeakTotals(session.organizationId);
  // Workspace Studio branding — accent + business name carry onto the printed page.
  const [orgRow] = await sql`select name from organizations where id = ${session.organizationId}`;
  const ws = await getWorkspaceProfile(session.organizationId);
  const accent = validAccent(ws.brandAccent) ?? "#2E8BFF";
  const brandName = ws.brandNameOverride || ((orgRow?.name as string) ?? "Search conducted by CUE");

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="leave-behind-page">
      <style>{`
        .leave-behind-page {
          --lb-ink: #1E1B3A;
          --lb-muted: #5C548C;
          --lb-blue: ${accent};
          --lb-orange: #FB923C;
          max-width: 820px;
          margin: 0 auto;
          color: var(--lb-ink);
          background: #fff;
          padding: 24px;
          border: 1px solid #E4E1F4;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.45;
        }
        .lb-header {
          display: flex; align-items: center; gap: 14px;
          background: linear-gradient(120deg, #050113, #1C1244);
          color: #fff; border-radius: 10px; padding: 12px 18px;
        }
        .lb-logo { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
        .lb-logo span { color: #38BDF8; }
        .lb-tag { margin-left: auto; text-align: right; font-size: 12px; color: #A79FD4; }
        .lb-tag strong { color: #FB923C; font-size: 13px; }
        .lb-h1 { font-size: 20px; font-weight: 800; margin: 16px 0 3px; }
        .lb-sub { color: var(--lb-muted); font-size: 12.5px; max-width: 640px; }
        .lb-well {
          margin: 16px 0 12px; border: 2px solid var(--lb-blue);
          border-radius: 10px; padding: 12px 16px; background: #F5F8FE;
        }
        .lb-well .lead { font-size: 12.5px; color: #2A2255; }
        .lb-amount { font-size: 34px; font-weight: 800; color: var(--lb-blue); }
        .lb-row {
          display: grid;
          grid-template-columns: 18px 1fr 70px 120px;
          gap: 10px; align-items: baseline;
          padding: 9px 0; border-bottom: 1px solid #EFEDF8;
          font-size: 12.5px;
        }
        .lb-row:last-child { border-bottom: none; }
        .lb-name { font-weight: 600; }
        .lb-name small { font-weight: 400; color: var(--lb-muted); }
        .lb-check {
          width: 13px; height: 13px; border: 1.5px solid var(--lb-blue);
          border-radius: 3px; display: inline-block; vertical-align: middle;
        }
        .lb-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #2A2255; }
        .lb-h2 {
          font-size: 15px; font-weight: 700; color: #2A2255;
          margin: 14px 0 6px; padding-left: 8px; border-left: 4px solid var(--lb-blue);
        }
        .lb-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .lb-step {
          border: 1.5px solid #E4E1F4; border-radius: 8px; padding: 9px 11px; font-size: 12px;
        }
        .lb-step b { color: var(--lb-blue); display: block; margin-bottom: 2px; }
        .lb-metric {
          margin-top: 12px; background: #F6F5FC; border: 1.5px solid #E4E1F4;
          border-radius: 8px; padding: 8px 14px; display: flex; gap: 10px; align-items: center;
          font-size: 12.5px;
        }
        .lb-metric .k { font-weight: 600; white-space: nowrap; }
        .lb-metric .w { flex: 1; border-bottom: 2px dotted #7C6FD0; min-height: 14px; }
        .lb-guarantee {
          margin-top: 12px; border: 2px solid var(--lb-orange); border-radius: 10px;
          padding: 9px 14px; background: #FFF8F1; font-size: 12.5px; color: #4A3417;
        }
        .lb-guarantee b { color: #C2560A; }
        .lb-foot {
          margin-top: 14px; padding-top: 8px; border-top: 1px solid #E4E1F4;
          font-size: 11px; color: var(--lb-muted);
          display: flex; gap: 14px; align-items: baseline;
        }
        .lb-foot .rep { margin-left: auto; display: flex; gap: 8px; }
        .lb-fill { display: inline-block; min-width: 80px; border-bottom: 1.5px dotted #8B84B0; min-height: 12px; }
        .lb-fineprint { font-size: 10px; color: #8B84B0; margin-top: 5px; }
        @media (max-width: 640px) {
          .lb-row { grid-template-columns: 16px 1fr; row-gap: 2px; }
          .lb-row .lb-num { grid-column: 2; text-align: left; font-weight: 600; }
          .lb-steps { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="lb-header">
        <div className="lb-logo">CU<span>E</span></div>
        <div style={{ fontSize: 12, color: "#E7E4F8" }}>
          AI Business Operating System
          <br />
          <strong style={{ color: "#FB923C" }}>The Heart of Your Business</strong>
        </div>
        <div className="lb-tag">Built by HASI Technologies<br />hasi.tech</div>
      </div>

      <h1 className="lb-h1">The numbers we saw on your records, {today} — {brandName}</h1>
      <div className="lb-sub">
        Every figure on this page came from <strong>your own exports</strong> during today&apos;s scan — no estimates, no industry averages. Each one traces to a real record; you saw it on screen.
      </div>

      <div className="lb-well">
        <div className="lead"><strong>What you&apos;re leaving on the table right now:</strong> the total the scan identified across all leak types.</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <span className="lb-amount">{money(totals.total)}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#8B84B0", marginTop: 4 }}>
          This is the same total from the screen — same detectors, same records. It keeps moving until the leaks close.
        </div>
      </div>

      <h2 className="lb-h2">The leaks found</h2>
      {totals.rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#5C548C", padding: "8px 0" }}>
          Nothing above threshold found yet. Run <strong>Understand → Refresh intelligence</strong> first, then reload this page.
        </div>
      ) : (
        <div>
          {totals.rows.map((r) => (
            <div className="lb-row" key={r.key}>
              <span className="lb-check" />
              <span>
                <span className="lb-name">{r.label}</span>{" "}
                <small style={{ color: "#5C548C" }}>— {r.detail}</small>
              </span>
              <span className="lb-num">{r.count}</span>
              <span className="lb-num">{money(r.value)}</span>
            </div>
          ))}
        </div>
      )}

      <h2 className="lb-h2">What a 30-day pilot does about it</h2>
      <div className="lb-steps">
        <div className="lb-step"><b>CUE watches</b> Reads your live exports against the same detectors you saw today. Nothing changes in your workflow.</div>
        <div className="lb-step"><b>CUE prepares</b> Every finding arrives with the record attached and a suggested action — priced, ready, evidenced.</div>
        <div className="lb-step"><b>You decide</b> Nothing moves without your approval. CUE waits, logs, and reports what was recovered against the metric we set today.</div>
      </div>

      <div className="lb-metric">
        <span className="k">Our agreed success metric:</span>
        <span className="w" />
        <span style={{ whiteSpace: "nowrap", color: "#5C548C" }}>Pilot starts</span>
        <span className="w" style={{ minWidth: 70, flex: "none" }} />
      </div>

      <div className="lb-guarantee">
        <p style={{ margin: 0 }}>
          <b>Pay for proof:</b> if the pilot doesn&apos;t identify at least <b>$10,000</b> in documented leakage from your records,
          it costs <span className="lb-fill" /> — and you keep every finding, on the record, yours to hand to anyone.
          That was the deal before we ran the scan today; it&apos;s still the deal.
        </p>
      </div>

      <div className="lb-foot">
        <div>Questions before Monday — <span className="lb-fill" /> hasi.tech</div>
        <div className="rep">
          <span>Your contact:</span>
          <span className="lb-fill" />
        </div>
      </div>

      <p className="lb-fineprint">
        Sample totals shown to other stores: $4,951 unbilled repair orders · $460,000 in leads with no follow-up · $66,000 of aging inventory past its reprice date. Your page is your store, not theirs — those numbers are theirs.
      </p>
    </div>
  );
}
