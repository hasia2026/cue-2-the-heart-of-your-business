import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shared document — CUE" };

// Public share view — access is by unguessable token with a hard expiry.
// No auth required; nothing else in the org is reachable from here.
export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [doc] = await sql`
    select title, kind, status, extracted_text, mime_type, size_bytes, uploaded_at, share_expires
    from documents
    where share_token = ${token} and share_expires > now()`;
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="card p-7">
        <div className="flex items-center gap-2">
          <span className="badge-blue">{doc.kind}</span>
          <span className="badge-low">{doc.status}</span>
          <span className="muted ms-auto text-xs">Shared via CUE · link expires {new Date(doc.share_expires).toLocaleDateString()}</span>
        </div>
        <h1 className="page-title mt-3">{doc.title}</h1>
        <p className="muted text-xs">Captured {new Date(doc.uploaded_at).toLocaleDateString()} · {doc.mime_type} · {Math.max(1, Math.round(Number(doc.size_bytes) / 1024))} KB</p>
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-ink-900/50 p-5 text-sm whitespace-pre-wrap text-navy-100">
          {doc.extracted_text || "No extracted content for this document yet."}
        </div>
        <p className="muted mt-4 text-center text-xs">Powered by CUE — The Heart of Your Business</p>
      </div>
    </div>
  );
}
