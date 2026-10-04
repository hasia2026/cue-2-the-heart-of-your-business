import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveBusinessDetails, saveGoals, addStarterData, skipStarterData, finishSetup, backToDetails } from "./actions";

// ─────────────────────────────────────────────────────────────
// §25 First-run experience.
// Step 2: business details → 3: goals → 4: starter data choice →
// 5: analyzing (auto-finishes) → redirect to the first Compass.
// ─────────────────────────────────────────────────────────────

const SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];

const INDUSTRY_PRESETS = [
  "Auto dealership",
  "Home services (HVAC / plumbing / electrical)",
  "Hospitality (restaurant / hotel)",
  "Professional services",
  "Retail",
  "Construction",
  "Healthcare practice",
  "Other",
];

const GOAL_SUGGESTIONS: Record<string, string[]> = {
  "Auto dealership": [
    "Respond to every lead within 1 hour",
    "Reduce aging inventory below 45 days",
    "Increase service retention",
  ],
  default: [
    "Stop revenue leakage (unbilled work, stale estimates)",
    "Respond to every customer lead within 24 hours",
    "Make training and knowledge consistent across the team",
  ],
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; welcome?: string }>;
}) {
  const session = await requireSession();
  const { step: stepParam } = await searchParams;

  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: session.organizationId },
    include: { goals: true },
  });
  if (!profile) redirect("/signin");

  const step = Math.min(Math.max(parseInt(stepParam ?? "", 10) || profile.onboardingStep, 2), 5);
  const goalCount = profile.goals.length;

  return (
    <div className="min-h-screen bg-ink-950 bg-[radial-gradient(70rem_40rem_at_15%_-10%,rgba(59,130,246,0.14)_0%,transparent_60%),radial-gradient(60rem_40rem_at_110%_20%,rgba(139,92,246,0.12)_0%,transparent_55%)]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange text-white font-bold flex items-center justify-center shadow-glow">B</div>
          <div>
            <div className="font-semibold text-navy-900">CUE — setting up {session.organizationName}</div>
            <div className="text-xs text-navy-400">Step {step - 1} of 4</div>
          </div>
        </div>

        {/* Progress rail */}
        <div className="flex gap-1.5 mb-8">
          {[2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-gradient-to-r from-accent-blue to-accent-purple" : "bg-white/10"}`} />
          ))}
        </div>

        {step <= 3 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-1">
              {step === 2 ? "Tell CUE about your business" : "What are you trying to achieve?"}
            </h1>
            <p className="muted mb-6">
              {step === 2
                ? "This shapes CUE's vocabulary, KPIs, and intelligence detectors."
                : "Goals appear on your Company Compass and let CUE measure progress against them."}
            </p>

            {step === 2 ? (
              <form action={saveBusinessDetails} className="space-y-4">
                <div>
                  <label className="label" htmlFor="companyName">Company name</label>
                  <input id="companyName" name="companyName" required minLength={2} defaultValue={profile.name} className="input" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor="industry">Industry</label>
                    <input id="industry" name="industry" required list="industries" defaultValue={profile.industry ?? ""} className="input" placeholder="e.g. Auto dealership" />
                    <datalist id="industries">
                      {INDUSTRY_PRESETS.map((i) => <option key={i} value={i} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="label" htmlFor="size">Team size</label>
                    <select id="size" name="size" required defaultValue={profile.size ?? ""} className="input">
                      <option value="" disabled>Select…</option>
                      {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="locations">Location(s) <span className="text-navy-300">(optional)</span></label>
                  <input id="locations" name="locations" className="input" defaultValue={profile.locations ?? ""} placeholder="e.g. Riverside, CA" />
                </div>
                <div>
                  <label className="label" htmlFor="businessModel">What do you sell / do? <span className="text-navy-300">(optional)</span></label>
                  <textarea id="businessModel" name="businessModel" rows={2} className="input" defaultValue={profile.businessModel ?? ""} placeholder="e.g. New & used vehicle sales, finance, and a service department" />
                </div>
                <div>
                  <label className="label" htmlFor="targetCustomers">Who are your customers? <span className="text-navy-300">(optional)</span></label>
                  <input id="targetCustomers" name="targetCustomers" className="input" defaultValue={profile.targetCustomers ?? ""} placeholder="e.g. Local families and small businesses" />
                </div>
                <div>
                  <label className="label" htmlFor="mission">Mission, in one sentence <span className="text-navy-300">(optional)</span></label>
                  <input id="mission" name="mission" className="input" defaultValue={profile.mission ?? ""} placeholder="e.g. Make buying and servicing a car effortless" />
                </div>
                <button type="submit" className="btn-primary w-full">Continue →</button>
              </form>
            ) : (
              <form action={saveGoals} className="space-y-4">
                {(GOAL_SUGGESTIONS[profile.industry?.startsWith("Auto") ? "Auto dealership" : "default"] ?? GOAL_SUGGESTIONS.default).map((g, i) => (
                  <div key={g} className="rounded-xl border border-navy-50 bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                    <input id={`goal${i + 1}`} name={`goal${i + 1}`} className="input !mt-0 flex-1 !bg-transparent !border-0 !px-0 focus:!ring-0" defaultValue={profile.goals[i]?.title ?? g} aria-label={`Goal ${i + 1}`} />
                    <span className="text-[10px] uppercase tracking-wide text-navy-300 whitespace-nowrap">suggestion</span>
                  </div>
                ))}
                <div className="flex gap-3">
                  <button type="submit" className="btn-primary flex-1">Continue →</button>
                  <button type="submit" formAction={backToDetails} className="btn-ghost">← Back</button>
                </div>
              </form>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-1">Give CUE something to analyze</h1>
            <p className="muted mb-6">
              Your workspace is live but empty. Two ways to see the intelligence engine work right now:
            </p>
            <div className="grid gap-3 mb-6">
              <form action={addStarterData}>
                <button type="submit" className="btn-primary w-full text-left">
                  <span className="block font-semibold">Generate realistic sample activity</span>
                  <span className="block text-xs text-navy-500 mt-1">
                    A handful of customers, jobs/deals, invoices, and estimates — clearly labeled as sample data. CUE&apos;s detectors will find real leaks in it immediately.
                  </span>
                </button>
              </form>
              <form action={skipStarterData}>
                <button type="submit" className="btn-ghost w-full text-left">
                  <span className="block font-semibold text-navy-800">Start completely empty</span>
                  <span className="block text-xs text-navy-400 mt-1">Capture documents and records yourself — CUE learns as you add.</span>
                </button>
              </form>
            </div>
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-xs text-navy-500">
              Sample data is scoped to your workspace only and can be cleared anytime from Settings.
            </div>
          </div>
        )}

        {step >= 5 && (
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-navy-900 mb-2">
              {profile.onboardingStep >= 10 ? "Your Company Compass is ready" : "Analyzing your business…"}
            </h1>
            <p className="muted mb-6">
              {profile.onboardingStep >= 10
                ? "CUE built your first Company Compass from the available information."
                : "Building your first Company Compass — classifying records, extracting knowledge, computing health, and scanning for revenue leaks."}
            </p>
            <ul className="space-y-2 mb-6 text-sm">
              {[
                ["Business profile absorbed", true],
                [goalCount > 0 ? `${goalCount} goal(s) registered on the Compass` : "Goals — none set yet", true],
                ["Records classified & connected", true],
                ["Health score computed", true],
                ["Intelligence scan", profile.onboardingStep >= 10],
              ].map(([label, done]) => (
                <li key={label as string} className="flex items-center gap-2.5 text-navy-600">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-navy-300"}`}>
                    {done ? "✓" : "•"}
                  </span>
                  {label as string}
                </li>
              ))}
            </ul>
            {profile.onboardingStep < 10 ? (
              <form action={finishSetup}>
                <button type="submit" className="btn-primary w-full">Build my first Company Compass →</button>
              </form>
            ) : (
              <a href="/compass?welcome=1" className="btn-primary w-full text-center block">Open Company Compass →</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
