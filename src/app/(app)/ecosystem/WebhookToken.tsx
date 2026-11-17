"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revealWebhookUrl, rotateWebhookToken } from "./actions";

/** Webhook URLs are shown masked by default. Revealing is an explicit click
 *  (server-checked), and rotating kills the old URL immediately. */
export default function WebhookToken({
  integrationKey,
  maskedUrl,
}: {
  integrationKey: string;
  maskedUrl: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const res = await revealWebhookUrl(integrationKey);
      if (res.ok && res.url) setUrl(res.url);
      else setError(res.error ?? "Could not reveal the token.");
    });
  }

  function rotate() {
    if (!confirm("Rotate this webhook token? The current URL stops working immediately.")) return;
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await rotateWebhookToken(integrationKey);
      if (res.ok && res.url) {
        setUrl(res.url);
        router.refresh();
      } else {
        setError(res.error ?? "Could not rotate the token.");
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Copy failed — select the URL and copy it manually.");
    }
  }

  return (
    <div>
      <code className="mt-1 block break-all text-[11px] text-violet-200" style={{ wordBreak: "break-all" }}>
        {url ?? maskedUrl}
      </code>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {url ? (
          <button type="button" onClick={copy} className="btn-ghost !px-2.5 !py-1 text-[11px]">
            {copied ? "Copied" : "Copy URL"}
          </button>
        ) : (
          <button type="button" onClick={reveal} disabled={pending} className="btn-ghost !px-2.5 !py-1 text-[11px]">
            {pending ? "Checking…" : "Reveal token"}
          </button>
        )}
        <button type="button" onClick={rotate} disabled={pending} className="btn-ghost !px-2.5 !py-1 text-[11px]">
          Rotate token
        </button>
        <span className="text-[11px] text-navy-300/70">
          {url ? "Keep this somewhere safe — it is the password for this webhook." : "The token stays hidden until you reveal it."}
        </span>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
