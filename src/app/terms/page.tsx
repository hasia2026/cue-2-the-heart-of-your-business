import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export const metadata = { title: "Terms — CUE" };

export default function TermsPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-14 text-sm text-navy-300">
        <h1 className="text-3xl font-bold text-white">Terms of service</h1>
        <p className="text-xs text-navy-300/60">Effective November 11, 2026 · HASI Technologies</p>

        <h2 className="text-lg font-semibold text-white">The service</h2>
        <p>
          CUE is an AI Business Operating System that reads the records you connect and prepares
          findings and actions for your review. CUE prepares; you decide. Nothing consequential runs
          without your approval.
        </p>

        <h2 className="text-lg font-semibold text-white">Pilot and subscription</h2>
        <p>
          The 20-minute scan is free. If we do not find $1,000 in documented leakage from your own
          records, the pilot is free. After the pilot, the Operator plan is $299 per month, cancel
          any time, with no setup fee.
        </p>

        <h2 className="text-lg font-semibold text-white">Your data</h2>
        <p>
          You keep ownership of your business records. You are responsible for having the right to
          share them with us. We use them only to provide the service, as described in our{" "}
          <a className="text-violet-300 underline" href="/privacy">Privacy policy</a>.
        </p>

        <h2 className="text-lg font-semibold text-white">Acceptable use</h2>
        <p>
          Do not use CUE to break the law, to upload data you do not have permission to use, or to
          interfere with the service or other customers.
        </p>

        <h2 className="text-lg font-semibold text-white">No warranty</h2>
        <p>
          CUE is provided “as is.” Findings are estimates computed from the records you provide and
          are not a guarantee of recoverable revenue or a substitute for your own accounting.
        </p>

        <h2 className="text-lg font-semibold text-white">Liability</h2>
        <p>
          To the maximum extent permitted by law, HASI Technologies is not liable for indirect or
          consequential damages, and our total liability is limited to the fees you paid in the
          three months before the claim.
        </p>

        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>
          Questions about these terms? <a className="text-violet-300 underline" href="/book">Book a call</a>{" "}
          and we will route you to the right person.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
