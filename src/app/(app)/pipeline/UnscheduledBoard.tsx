"use client";

import { useMemo, useState } from "react";

export type Job = {
  id: string;
  customer: string;
  address: string | null;
  area: string | null;
  title: string;
  amount: number;
  openedDays: number;
  status: string;
  agreement: string | null;
  phone: string | null;
};

export type AreaGroup = { area: string; jobs: Job[] };
export type MonthGroup = { month: string; count: number; value: number; jobs: Job[] };

type Labels = Record<string, string>;

export default function UnscheduledBoard({
  jobs,
  labels,
  hasAgreements,
}: {
  jobs: Job[];
  labels: Labels;
  hasAgreements: boolean;
}) {
  const t = (k: string, fallback: string) => labels[k] ?? fallback;
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [onlyAgreements, setOnlyAgreements] = useState(hasAgreements);

  const areas = useMemo(() => {
    const filtered = onlyAgreements ? jobs.filter((j) => j.agreement) : jobs;
    const byArea = new Map<string, Job[]>();
    for (const j of filtered) {
      const key = j.area ?? t("board.noArea", "No area set");
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key)!.push(j);
    }
    return Array.from(byArea.entries())
      .map(([area, list]) => ({ area, jobs: list }))
      .sort((a, b) => b.jobs.length - a.jobs.length);
  }, [jobs, onlyAgreements, labels]);

  const months = useMemo(() => {
    const filtered = onlyAgreements ? jobs.filter((j) => j.agreement) : jobs;
    const byMonth = new Map<string, MonthGroup>();
    for (const j of filtered) {
      const d = new Date(Date.now() - j.openedDays * 864e5);
      // Report window: current calendar month and the month ahead (upcoming
      // seasonal PM work), matching how owners batch unscheduled maintenance.
      const month = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      if (!byMonth.has(month)) byMonth.set(month, { month, count: 0, value: 0, jobs: [] });
      const g = byMonth.get(month)!;
      g.count += 1;
      g.value += j.amount;
      g.jobs.push(j);
    }
    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [jobs, onlyAgreements, labels]);

  function exportCsv() {
    const rows = [
      ["Customer", "Phone", "Address", "Area", "Job", "Status", "Value", "Agreement"],
      ...areas.flatMap((a) =>
        a.jobs.map((j) => [j.customer, j.phone ?? "", j.address ?? "", a.area, j.title, j.status, String(j.amount), j.agreement ?? ""]),
      ),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `unscheduled-maintenance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openGoogleMaps(area: string) {
    const stops = areas
      .find((a) => a.area === area)?.jobs.map((j) => j.address?.trim())
      .filter(Boolean) as string[] | undefined;
    if (!stops || stops.length === 0) return;
    // Google Maps multi-stop URL — works whether one or many stops.
    const url = `https://www.google.com/maps/dir/${stops.map((s) => encodeURIComponent(s)).join("/")}`;
    window.open(url, "_blank", "noopener");
  }

  const shown = areas.reduce((n, a) => n + a.jobs.length, 0);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">{t("board.title", "Unscheduled maintenance")}</h2>
          <p className="muted mt-1 text-xs">
            {t(
              "board.sub",
              "Open service-plan jobs nobody has scheduled, grouped by town/area so a tech filling a hole at 1pm sees what's near him. Export one area to Google Maps as a route.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasAgreements && (
            <label className="flex items-center gap-2 text-xs text-navy-300">
              <input
                type="checkbox"
                checked={onlyAgreements}
                onChange={(e) => setOnlyAgreements(e.target.checked)}
                className="h-4 w-4 accent-cue-blue"
              />
              {t("board.agreementsOnly", "Agreements only")}
            </label>
          )}
          <button onClick={exportCsv} className="btn-ghost !py-1.5 text-xs" disabled={shown === 0}>
            {t("board.csv", "Export CSV")}
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="muted mt-4 text-xs">{t("board.empty", "No open unscheduled service calls — the board is clear.")}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => (
              <div key={a.area} className="rounded-xl border border-white/[0.06] p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="font-medium text-navy-100 hover:text-cue-blue"
                    onClick={() => setOpenArea(openArea === a.area ? null : a.area)}
                  >
                    {a.area} <span className="badge-low"> {a.jobs.length}</span>
                  </button>
                  <button
                    onClick={() => openGoogleMaps(a.area)}
                    className="btn-ghost !px-2 !py-1 text-[11px]"
                    disabled={!a.jobs.some((j) => j.address)}
                    title={t("board.mapsHint", "Open these addresses as a Google Maps route")}
                  >
                    {t("board.maps", "Route →")}
                  </button>
                </div>
                <div className="mt-1 text-xs text-navy-300/70">
                  ${a.jobs.reduce((n, j) => n + j.amount, 0).toLocaleString()} ·{" "}
                  {a.jobs.filter((j) => j.agreement).length} {t("board.wAgreement", "on agreements")}
                </div>
                {openArea === a.area && (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {a.jobs.map((j) => (
                      <li key={j.id} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                        <div className="text-navy-100">{j.customer}</div>
                        <div className="text-navy-300/70">
                          {j.title} · {j.openedDays}d · ${j.amount.toLocaleString()}
                          {j.agreement ? ` · ${j.agreement}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Monthly report: unscheduled backlog by month created */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-navy-100">{t("board.monthly", "Monthly unscheduled report")}</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-navy-300/70">
                    <th className="py-1 text-start">{t("board.monthCol", "Opened")}</th>
                    <th className="py-1 text-end">{t("board.countCol", "Jobs")}</th>
                    <th className="py-1 text-end">{t("board.valueCol", "Value")}</th>
                    <th className="py-1 text-start">{t("board.mostareas", "Heaviest areas")}</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const areaCounts = new Map<string, number>();
                    for (const j of m.jobs) areaCounts.set(j.area ?? "—", (areaCounts.get(j.area ?? "—") ?? 0) + 1);
                    const heavy = Array.from(areaCounts.entries())
                      .sort((x, y) => y[1] - x[1])
                      .slice(0, 3)
                      .map(([a, n]) => `${a} (${n})`)
                      .join(", ");
                    return (
                      <tr key={m.month} className="border-t border-white/[0.06]">
                        <td className="py-1.5 text-navy-100">{m.month}</td>
                        <td className="py-1.5 text-end text-navy-100">{m.count}</td>
                        <td className="py-1.5 text-end text-cue-green">${m.value.toLocaleString()}</td>
                        <td className="py-1.5 text-navy-300">{heavy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
