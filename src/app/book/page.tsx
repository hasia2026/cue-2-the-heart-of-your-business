import PublicHeader from "@/components/PublicHeader";
import { LogoMark } from "@/components/NavClient";

export const metadata = {
  title: "Book a CUE walkthrough",
  description: "Book a free 20-minute CUE scan call — see the money you're already earning but not collecting.",
};

export default function BookPage() {
  const url = process.env.CALENDLY_URL;

  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="text-center">
        <div className="cue-halo mx-auto mb-5 inline-flex">
          <LogoMark className="h-14 w-14" />
        </div>
        <div className="eyebrow mb-3">Free · 20 minutes · no obligation</div>
        <h1 className="page-title text-3xl md:text-4xl">See your revenue leaks live.</h1>
        <p className="muted mx-auto mt-3 max-w-xl">
          A 20-minute CUE scan call: we walk your numbers, show exactly where money is
          leaking, and you decide if a pilot is worth it. No pitch deck — your data.
        </p>
      </div>

      <div className="card mt-10 overflow-hidden p-1">
        {url ? (
          <>
            {/* Calendly inline widget */}
            <div
              className="calendly-inline-widget min-h-[640px] w-full rounded-xl"
              data-url={`${url}?hide_gdpr_banner=1&primary_color=7c3aed`}
              style={{ minWidth: "280px" }}
            />
            <script src="https://assets.calendly.com/assets/external/widget.js" async />
          </>
        ) : (
          <div className="p-8 text-center">
            <div className="font-semibold text-white">Booking opens in one step</div>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              The live calendar is being connected. In the meantime, email
              {" "}
              <a className="text-violet-300 underline" href="mailto:pilots@hasi.tech?subject=CUE%20scan%20call">
                pilots@hasi.tech
              </a>{" "}
              with two times that work and you'll get a slot within the hour.
            </p>
            <a href="/score" className="btn-primary mt-6">Take the free Revenue Leak Score first →</a>
          </div>
        )}
      </div>

      <p className="muted mt-6 text-center text-xs">
        Prefer to self-serve? Run the <a className="text-violet-300 underline" href="/score">Revenue Leak Score</a> — free, 60 seconds.
      </p>
    </div>
    </>
  );
}
