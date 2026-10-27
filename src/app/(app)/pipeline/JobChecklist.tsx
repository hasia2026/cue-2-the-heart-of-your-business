"use client";

import { useState, useTransition } from "react";
import {
  toggleChecklistItem,
  addChecklistItem,
  saveJobScopeChecklist,
} from "./job-actions";

export type CheckItem = { label: string; done: boolean };

export type Job = {
  id: string;
  title: string;
  status: string;
  unbilled: boolean;
  amount: string;
  serviceType: string | null;
  opened: string; // preformatted date
  completed: string | null;
  invoiced: string | null;
  scope: string | null;
  checklist: CheckItem[];
  propertyAddress: string | null;
};

const JOB_BADGE: Record<string, string> = {
  OPEN: "badge-blue", IN_PROGRESS: "badge-orange", COMPLETED: "badge-green",
};

function ToggleCheck({ jobId, item, index }: { jobId: string; item: CheckItem; index: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => { void toggleChecklistItem(jobId, index); })}
      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1 text-start text-sm transition hover:bg-white/[0.05] ${
        pending ? "opacity-50" : ""}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          item.done ? "border-emerald-400 bg-emerald-500/80 text-[10px] font-bold text-white" : "border-white/30"
        }`}
      >
        {item.done ? "✓" : ""}
      </span>
      <span className={item.done ? "text-navy-300 line-through" : "text-navy-100"}>{item.label}</span>
    </button>
  );
}

function JobCard({ job }: { job: Job }) {
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const doneCount = job.checklist.filter((i) => i.done).length;

  return (
    <div className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-navy-100">{job.title}</span>
        {job.serviceType && job.serviceType !== "Other" && <span className="badge-purple">{job.serviceType}</span>}
        {job.checklist.length > 0 && (
          <span className={`badge ${doneCount === job.checklist.length ? "badge-green" : "badge-orange"}`}>
            checklist {doneCount}/{job.checklist.length}
          </span>
        )}
        <span className={`badge ms-auto ${job.unbilled ? "badge-red" : JOB_BADGE[job.status] ?? "badge-blue"}`}>
          {job.unbilled ? "UNBILLED" : job.status.replace("_", " ")}
        </span>
      </div>
      {job.propertyAddress && (
        <div className="mt-0.5 text-xs text-violet-200">📍 {job.propertyAddress}</div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
        <span>{job.amount}</span>
        <span>opened {job.opened}</span>
        {job.completed && <span>completed {job.completed}</span>}
        {job.invoiced && <span className="text-emerald-300">invoiced {job.invoiced}</span>}
      </div>

      {job.scope && (
        <details className="mt-2" open={job.checklist.length === 0}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-navy-300">Scope of work</summary>
          <p className="mt-1 whitespace-pre-wrap text-sm text-navy-100">{job.scope}</p>
        </details>
      )}

      {job.checklist.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {job.checklist.map((item, i) => (
            <ToggleCheck key={i} jobId={job.id} item={item} index={i} />
          ))}
        </div>
      )}

      {editing ? (
        <form
          className="mt-2 grid gap-2"
          action={async (fd: FormData) => {
            const res = await saveJobScopeChecklist(job.id, String(fd.get("scope") ?? ""), String(fd.get("items") ?? ""));
            setMsg(res.ok ? "Saved." : (res.error ?? "Failed."));
            setEditing(false);
          }}
        >
          <textarea name="scope" rows={3} className="input" defaultValue={job.scope ?? ""} placeholder="Scope of work — what's included, what to expect…" />
          <textarea name="items" rows={Math.max(3, job.checklist.length + 1)} className="input" defaultValue={job.checklist.map((i) => i.label).join("\n")} placeholder="Checklist — one item per line" />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Save scope + checklist</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-2">
          <button
          type="button"
          className="text-xs text-violet-300 hover:underline"
          onClick={() => setEditing(true)}
        >
          Edit scope & checklist
        </button>
        </div>
      )}

      <form
        className="mt-1.5 flex gap-2"
        action={async (fd: FormData) => {
          const label = String(fd.get("label") ?? "");
          setNewItem("");
          const res = await addChecklistItem(job.id, label);
          if (!res.ok) setMsg(res.error ?? "Failed.");
        }}
      >
        <input
          name="label"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="input py-1 text-xs"
          placeholder="+ Add checklist item…"
        />
      </form>
      {msg && <p className="mt-1 text-xs text-navy-300">{msg}</p>}
    </div>
  );
}

export default function JobChecklists({ jobs }: { jobs: Job[] }) {
  // Property filter: a client with 30 locations never scrolls all 30 locations'
  // history at once — pick the address, see only that property's records.
  const [property, setProperty] = useState<string>("ALL");
  const properties = [...new Set(
    jobs.map((j) => j.propertyAddress ?? "(no address on record)")
  )].sort();
  const shown = property === "ALL"
    ? jobs
    : jobs.filter((j) => (j.propertyAddress ?? "(no address on record)") === property);

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Jobs — scopes & checklists</h2>
          <p className="muted text-xs">Every job for this customer on one page: tick items right here, add items, edit scopes — without opening anything else.</p>
        </div>
        {properties.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-navy-300">
            <span>Service history for</span>
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              className="input py-1 text-xs"
              aria-label="Filter service history by property"
            >
              <option value="ALL">All properties ({jobs.length})</option>
              {properties.map((p) => (
                <option key={p} value={p}>
                  {p}
                  {p !== "(no address on record)"
                    ? ` (${jobs.filter((j) => (j.propertyAddress ?? "(no address on record)") === p).length})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {properties.length > 1 && shown.length < jobs.length && (
        <p className="muted mb-2 text-xs">Showing only <span className="text-violet-200">{property}</span> — {shown.length} job{shown.length === 1 ? "" : "s"} at this property.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((j) => <JobCard key={j.id} job={j} />)}
      </div>
      {jobs.length === 0 && <p className="muted">No jobs for this customer yet.</p>}
      {properties.length > 1 && property !== "ALL" && shown.length === 0 && (
        <p className="muted">No service records at this address yet.</p>
      )}
    </section>
  );
}
