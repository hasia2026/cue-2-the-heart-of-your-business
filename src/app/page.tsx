import { getSession } from "@/lib/auth";

const LOOP = [
  { icon: "⤓", title: "Capture", desc: "Every document, note, and record — classified and connected." },
  { icon: "◈", title: "Understand", desc: "Evidence-first intelligence computed from your actual data." },
  { icon: "✦", title: "Enhance", desc: "Brand, customer experience, and process improvements." },
  { icon: "▶", title: "Execute", desc: "Approved recommendations become workflows and tasks." },
  { icon: "↑", title: "Expand", desc: "Training from your own knowledge. Measured outcomes." },
];

export default async function Home() {
  const session = await getSession();
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-navy-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cue-green" /> AI Business Operating System
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          The Heart of <span className="bg-gradient-to-r from-cue-blue via-cue-purple to-cue-orange bg-clip-text text-transparent">Your Business</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-navy-300 md:text-lg">
          An AI operating system connecting the people, knowledge, workflows and systems
          that keep a business moving. Everything your business knows. Everything it does.
          One intelligent system.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {session ? (
            <a href="/dashboard" className="btn-primary">Open your command center →</a>
          ) : (
            <>
              <a href="/signup" className="btn-primary">Start with your company</a>
              <a href="/signin" className="btn-ghost">Sign in</a>
            </>
          )}
        </div>
      </div>

      <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LOOP.map((s, i) => (
          <div key={s.title} className="card p-5">
            <div className="text-2xl">{s.icon}</div>
            <div className="mt-2 font-semibold text-white">
              {i + 1}. {s.title}
            </div>
            <p className="muted mt-1 text-xs">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="card mt-12 p-6 text-center">
        <p className="muted text-sm">
          Industry Packs: CUE adapts to your business — <span className="text-white">Auto Dealership</span> ships first,
          with Home Services, Hospitality and more on the same core.
        </p>
      </div>

      {/* The pledge */}
      <div className="card mt-6 p-6 text-center">
        <p className="text-sm text-navy-100">
          <span className="font-semibold text-white">Our pledge:</span> $3 from every subscription goes to
          <span className="text-cue-purple"> Revi Rescue</span>, <span className="text-cue-blue">HASI Foundation</span>,
          <span className="text-cue-blue"> HASI Academy</span>, and <span className="text-cue-green">Open Resource</span>.
        </p>
        <p className="muted mt-1 text-xs">Your business grows. Your community grows with it.</p>
      </div>

      {/* Public leak-score hook */}
      <div className="mt-10 text-center">
        <a href="/score" className="btn-primary">Find your Revenue Leak Score — free, 60 seconds →</a>
      </div>
    </div>
  );
}
