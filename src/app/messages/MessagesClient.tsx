"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startDirectThread, startGroupThread, sendMessage } from "./actions";

type Msg = { id: string; authorName: string; authorEmployeeId: string | null; body: string; createdAt: string };
type Thread = {
  id: string; title: string | null; isGroup: boolean; lastMessageAt: string;
  participants: { id: string; name: string; title: string }[];
  messages: Msg[];
};
type Employee = { id: string; name: string; title: string; department: string | null };

function threadName(t: Thread, meName: string): string {
  if (t.title) return t.title;
  const others = t.participants.filter((p) => p.name !== meName);
  return others.length ? others.map((o) => o.name).join(", ") : "Just you";
}

export default function MessagesClient({
  threads,
  employees,
  meName,
}: {
  threads: Thread[];
  employees: Employee[];
  meName: string;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const active = threads.find((t) => t.id === activeId) ?? null;
  const lastReadMap = useMemo(() => new Map<string, string>(), []); // simplified: unread = last msg not by me

  async function send() {
    if (!active || !draft.trim() || busy) return;
    setBusy(true);
    try {
      await sendMessage(active.id, draft);
      setDraft("");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function openDirect(employeeId: string) {
    const res = await startDirectThread(employeeId);
    setActiveId(res.threadId);
    setNewOpen(false);
    startTransition(() => router.refresh());
  }

  async function createGroup() {
    if (!groupTitle.trim() || groupSel.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await startGroupThread(groupTitle, [...groupSel]);
      setActiveId(res.threadId);
      setNewOpen(false);
      setGroupTitle("");
      setGroupSel(new Set());
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      {/* Thread list */}
      <div className="card p-3 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
        <button onClick={() => setNewOpen(!newOpen)} className="btn-primary text-sm">+ New conversation</button>

        {newOpen && (
          <div className="rounded-xl border border-navy-50 bg-white/[0.03] p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">Direct message</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => openDirect(e.id)}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-navy-700 hover:bg-white/[0.06]"
                >
                  {e.name} <span className="text-navy-400 text-xs">· {e.title}{e.department ? ` — ${e.department}` : ""}</span>
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-navy-50">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1.5">Group thread</div>
              <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} className="input text-sm" placeholder="Group name (e.g. Sales team)" />
              <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                {employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm text-navy-600 rounded-lg px-2 py-1 hover:bg-white/[0.06] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupSel.has(e.id)}
                      onChange={(ev) => {
                        const next = new Set(groupSel);
                        ev.target.checked ? next.add(e.id) : next.delete(e.id);
                        setGroupSel(next);
                      }}
                    />
                    {e.name}
                  </label>
                ))}
              </div>
              <button onClick={createGroup} disabled={busy || !groupTitle.trim() || groupSel.size === 0} className="btn-secondary text-xs w-full mt-2">
                Create group ({groupSel.size})
              </button>
            </div>
          </div>
        )}

        {threads.map((t) => {
          const unread = t.messages.length > 0 && t.messages[t.messages.length - 1].authorName !== meName && t.id !== activeId;
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${t.id === activeId ? "border-accent-blue/40 bg-accent-blue/10" : "border-navy-50 hover:bg-white/[0.04]"}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-navy-900 truncate flex-1">{threadName(t, meName)}</span>
                {unread && <span className="h-2 w-2 rounded-full bg-accent-orange shrink-0" />}
              </div>
              <div className="text-xs text-navy-400 truncate">
                {t.messages.length > 0 ? `${t.messages[t.messages.length - 1].authorName.split(" ")[0]}: ${t.messages[t.messages.length - 1].body}` : "No messages yet"}
              </div>
            </button>
          );
        })}
        {threads.length === 0 && <p className="muted text-xs px-1">No conversations yet — start one above.</p>}
      </div>

      {/* Conversation */}
      <div className="card flex flex-col max-h-[70vh]">
        {active ? (
          <>
            <div className="px-5 py-3.5 border-b border-navy-50">
              <div className="text-sm font-semibold text-navy-900">{threadName(active, meName)}</div>
              <div className="text-xs text-navy-400">{active.isGroup ? `Group · ${active.participants.length} members` : "Direct message"}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {active.messages.map((m) => {
                const mine = m.authorName === meName;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${mine ? "bg-gradient-to-r from-accent-blue to-accent-purple text-white" : "bg-white/[0.06] border border-navy-50"}`}>
                      {!mine && <div className="text-[11px] font-semibold text-accent-blue mb-0.5">{m.authorName}</div>}
                      <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                      <div className={`text-[10px] mt-1 ${mine ? "text-white/60" : "text-navy-400"}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {active.messages.length === 0 && <p className="muted text-sm text-center py-8">Say hello — this is the start of the conversation.</p>}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="border-t border-navy-50 p-3 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="input flex-1"
                placeholder={`Message ${threadName(active, meName)}…`}
              />
              <button type="submit" disabled={busy || !draft.trim()} className="btn-primary">Send</button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-10">
            <p className="muted">Select or start a conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
