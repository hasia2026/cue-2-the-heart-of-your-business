import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export const metadata = { title: "Privacy — CUE" };

export default function PrivacyPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-14 text-sm text-navy-300">
        <h1 className="text-3xl font-bold text-white">Privacy</h1>
        <p className="text-xs text-navy-300/60">Effective November 11, 2026 · HASI Technologies</p>

        <h2 className="text-lg font-semibold text-white">What we collect</h2>
        <p>
          Account details you give us (name, work email, company), the records you choose to
          connect or upload, and basic usage data needed to run and secure the service.
        </p>

        <h2 className="text-lg font-semibold text-white">How we use it</h2>
        <p>
          To provide CUE: capture and classify your records, compute findings from them, prepare
          actions for your approval, and send the notifications you ask for. We do not sell your
          data, and we do not use your business records to train models for other customers.
        </p>

        <h2 className="text-lg font-semibold text-white">Cookies</h2>
        <p>
          We use a session cookie to keep you signed in and a language cookie to remember your
          locale. We do not use advertising cookies.
        </p>

        <h2 className="text-lg font-semibold text-white">Sharing</h2>
        <p>
          We share data only with the processors needed to operate the service (hosting, database,
          email and payment providers) under contract, or when required by law.
        </p>

        <h2 className="text-lg font-semibold text-white">Retention and deletion</h2>
        <p>
          You can delete records from your workspace at any time. Pilot exports are deleted after
          the pilot unless you ask us to keep them. Closing your account removes your workspace
          data, subject to legal retention requirements.
        </p>

        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>
          Questions about privacy? <a className="text-violet-300 underline" href="/book">Book a call</a>{" "}
          and we will route you to the right person.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
