import { requireSession } from "@/lib/auth";
import { getLeakTotals } from "@/lib/intelligence";
import { PrintOnce, PrintLink } from "@/components/LeaveBehindPrint";

export const dynamic = "force-dynamic";

// Print/PDF edition of the leave-behind, for handing the prospect a paper
// copy after the scan call. Same data source as /leave-behind (getLeakTotals)
// so the paper sheet can never disagree with the screen. Open this route and
// the browser's print dialog starts automatically (destination: Save as PDF
// or a printer). Print styles hide the app chrome and fill-in blanks print
// as writing lines.

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function LeaveBehindPrintPage() {
  const session = await requireSession();
  const totals = await getLeakTotals(session.organizationId);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="lb-print-root">
      <style>{`
        .lb-print-root { color: #1E1B3A; background: #fff; }
        @media print {
          body { background: #fff !important; }
          header, nav, footer, aside, .app-chrome { display: none !important; }
          .lb-print-root { max-width: 800px; margin: 0 auto; padding: 10mm 8mm; font-size: 11pt; }
        }
        /* Mirror the on-screen sheet so a prospect who prints the normal page
           sees the same thing; this route just adds auto-open + tighter layout */
        .lb-sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 28px 30px;
          border: 1px solid #E4E1F4; border-radius: 12px; font-size: 13px; line-height: 1.5;
          color: #1E1B3A; }
        .lb-sheet .lb-header { display: flex; align-items: center; gap: 14px;
          background: linear-gradient(120deg, #050113, #1C1244); color: #fff;
          border-radius: 10px; padding: 12px 18px; }
        .lb-sheet .lb-logo { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
        .lb-sheet .lb-logo span { color: #38BDF8; }
        .lb-sheet .lb-tag { margin-left: auto; text-align: right; font-size: 12px; color: #A79FD4; }
        .lb-sheet h1 { font-size: 20px; font-weight: 800; margin: 16px 0 3px; }
        .lb-sheet .lb-sub { color: #5C548C; font-size: 12.5px; max-width: 640px; }
        .lb-sheet .lb-well { margin: 16px 0 12px; border: 2px solid #2E8BFF;
          border-radius: 10px; padding: 12px 16px; background: #F5F8FE; }
        .lb-sheet .lb-amount { font-size: 34px; font-weight: 800; color: #2E8BFF; }
        .lb-sheet .lb-row { display: grid; grid-template-columns: 18px 1fr 70px 120px;
          gap: 10px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid #EFEDF8; font-size: 12.5px; }
        .lb-sheet .lb-row:last-child { border-bottom: none; }
        .lb-sheet .lb-name { font-weight: 600; }
        .lb-sheet .lb-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #2A2255; }
        .lb-sheet .lb-h2 { font-size: 15px; font-weight: 700; color: #2A2255;
          margin: 14px 0 6px; padding-left: 8px; border-left: 4px solid #2E8BFF; }
        .lb-sheet .lb-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .lb-sheet .lb-step { border: 1.5px solid #E4E1F4; border-radius: 8px; padding: 9px 11px; font-size: 12px; }
        .lb-sheet .lb-step b { color: #2E8BFF; display: block; margin-bottom: 2px; }
        .lb-sheet .lb-metric { margin-top: 12px; background: #F6F5FC; border: 1.5px solid #E4E1F4;
          border-radius: 8px; padding: 8px 14px; display: flex; gap: 10px; align-items: center; font-size: 12.5px; }
        .lb-sheet .lb-metric .k { font-weight: 600; white-space: nowrap; }
        .lb-sheet .lb-metric .w { flex: 1; border-bottom: 2px dotted #7C6FD0; min-height: 14px;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .lb-sheet .lb-guarantee { margin-top: 12px; border: 2px solid #FB923C; border-radius: 10px;
          padding: 9px 14px; background: #FFF8F1; font-size: 12.5px; color: #4A3417;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .lb-sheet .lb-guarantee b { color: #C2560A; }
        .lb-sheet .lb-foot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #E4E1F4;
          font-size: 11px; color: #5C548C; display: flex; gap: 14px; }
        .lb-sheet .lb-fill { display: inline-block; min-width: 80px; border-bottom: 1.5px dotted #8B84B0; min-height: 12px; }
        .lb-sheet .lb-fineprint { font-size: 10px; color: #8B84B0; margin-top: 5px; }
        .lb-no-print { text-align: center; margin: 0 auto 10px; max-width: 800px; }
      `}</style>

      <div className="lb-no-print" style={{ color: "#5C548C", fontSize: 12 }}>
        Print edition — use your browser&apos;s <strong>Print → Save as PDF</strong> to hand this page to the
        prospect. The print dialog opens automatically; <PrintLink /> to open it again.
      </div>

      <div className="lb-sheet">
        <div className="lb-header">
          <div className="lb-logo">CU<span>E</span></div>
          <div style={{ fontSize: 12, color: "#E7E4F8" }}>
            AI Business Operating System
            <br />
            <strong style={{ color: "#FB923C" }}>The Heart of Your Business</strong>
          </div>
          <div className="lb-tag">Built by HASI Technologies<br />hasi.tech</div>
        </div>

        <h1>The numbers we saw on your records, {today}</h1>
        <div className="lb-sub">
          Every figure on this page came from <strong>your own exports</strong> during today&apos;s scan — no
          estimates, no industry averages. Each one traces to a real record; you saw it on screen.
        </div>

        <div className="lb-well">
          <div style={{ fontSize: 12.5, color: "#2A2255" }}>
            <strong>What you&apos;re leaving on the table right now:</strong> the total the scan identified across all leak types.
          </div>
          <div className="lb-amount">{money(totals.total)}</div>
          <div style={{ fontSize: 10.5, color: "#8B84B0", marginTop: 4 }}>
            Same detectors, same records as the screen. It keeps moving until the leaks close.
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
                <span style={{
                  width: 13, height: 13, border: "1.5px solid #2E8BFF",
                  borderRadius: 3, display: "inline-block", verticalAlign: "middle",
                }} />
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
            <b>Pay for proof:</b> if the pilot doesn&apos;t identify at least <b>$10,000</b> in documented leakage
            from your records, it costs <span className="lb-fill" /> — and you keep every finding, on the
            record, yours to hand to anyone. That was the deal before we ran the scan today; it&apos;s still the deal.
          </p>
        </div>

        <div className="lb-foot">
          <div>Questions before Monday — <span className="lb-fill" /> hasi.tech</div>
          <div style={{ marginLeft: "auto" }}>
            Your contact: <span className="lb-fill" />
          </div>
        </div>

        <p className="lb-fineprint">
          Sample totals shown to other stores: $4,951 unbilled repair orders · $460,000 in leads with no follow-up ·
          $66,000 of aging inventory past its reprice date. Your page is your store, not theirs — those numbers are theirs.
        </p>
      </div>

      <PrintOnce />
    </div>
  );
}
