"use client";

import { useMemo, useState } from "react";

type Item = {
  id: string; title: string; content: string; category: string;
  tags: string | null; status: string; sourceDoc: string | null; updatedAt: string;
};

type Answer = { answer: string; sources: { label: string; kind: string }[] };

export default function KnowledgeClient({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [question, setQuestion] = useState("");
  const [qa, setQa] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const filtered = items.filter((i) => {
    if (category !== "ALL" && i.category !== category) return false;
    if (!query.trim()) return true;
    const hay = `${i.title} ${i.content} ${i.tags ?? ""}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setQa(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) setQa(await res.json());
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Ask CUE */}
      <section className="card p-5">
        <h2 className="section-title mb-1">Ask your company knowledge</h2>
        <p className="muted mb-3">“What is our refund policy?” · “How do we onboard a new customer?” · “Who is responsible for this process?” — answers cite the underlying records.</p>
        <form onSubmit={ask} className="flex gap-2">
          <input className="input flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about policies, procedures, decisions…" />
          <button className="btn-purple" disabled={asking || !question.trim()}>{asking ? "Searching…" : "Ask"}</button>
        </form>
        {qa && (
          <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
            <div className="text-sm text-navy-800 whitespace-pre-wrap">{qa.answer}</div>
            {qa.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 self-center">Sources:</span>
                {qa.sources.map((s, i) => <span key={i} className="badge-low">{s.label}</span>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Search + filters */}
      <section className="flex flex-wrap gap-3 items-center">
        <input className="input max-w-sm" placeholder="Search knowledge…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`badge ${category === c ? "badge-blue" : "badge-low"}`}
            >
              {c === "ALL" ? "All" : c}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-navy-400">{filtered.length} of {items.length} items</span>
      </section>

      {/* Items */}
      <section className="grid gap-4 md:grid-cols-2">
        {filtered.map((k) => (
          <article key={k.id} className="card p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="badge-blue">{k.category}</span>
              <span className={k.status === "FACT" ? "badge-green" : k.status === "DECISION" ? "badge-purple" : "badge-medium"}>{k.status}</span>
              <span className="ml-auto text-[11px] text-navy-300">{new Date(k.updatedAt).toLocaleDateString()}</span>
            </div>
            <h3 className="text-sm font-semibold text-navy-900">{k.title}</h3>
            <p className="text-sm text-navy-600 mt-1.5 whitespace-pre-wrap line-clamp-6">{k.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {k.sourceDoc && <span className="badge-low">❑ {k.sourceDoc}</span>}
              {k.tags?.split(",").filter(Boolean).map((t) => (
                <span key={t} className="badge-low">#{t.trim()}</span>
              ))}
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="muted">Nothing matches. Capture documents in Capture to grow the knowledge base.</p>
        )}
      </section>
    </div>
  );
}
