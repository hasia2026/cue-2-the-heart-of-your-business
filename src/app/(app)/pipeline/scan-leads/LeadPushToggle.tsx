"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "off" | "on" | "unsupported" | "unconfigured";

function b64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const norm = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(norm);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export default function LeadPushToggle({ configured }: { configured: boolean }) {
  const [state, setState] = useState<PushState>(configured ? "checking" : "unconfigured");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(): Promise<PushState> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "off";
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return "off";
    const res = await fetch("/api/alerts/subscribe", { method: "GET" });
    if (res.status === 401) return "off";
    setState("on");
    return "on";
  }

  useEffect(() => {
    if (configured) void check().then((s) => setState(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("Notifications were blocked — enable them in the browser's site settings, then try again.");
        return;
      }
      const config = await (await fetch("/api/alerts/subscribe")).json();
      if (!config.publicKey) {
        setMsg(config.error ?? "Push is not configured on this deployment.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(config.publicKey) as BufferSource,
      });
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys, userAgent: navigator.userAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the subscription");
      setState("on");
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/alerts/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setMsg(`Test ping sent to ${data.sent} device(s). Didn't feel it? Check the OS notification permission.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const platformHint = /iPad|iPhone|iPod/.test(navigator.userAgent)
    ? "iPhone/iPad: open this site in Safari and use Share → Add to Home Screen first — Apple only allows web push for installed web apps."
    : "Keep this browser running (or at least Chrome open in the background) to receive pings.";

  if (state === "unconfigured") {
    return (
      <div className="card p-4">
        <div className="font-semibold text-white">Real-time phone pings</div>
        <p className="muted mt-1 text-xs">
          Not wired on this deployment yet — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (see docs/resend-domain-dns.md + DEPLOY.md). Email alerts keep flowing in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-semibold text-white">Real-time phone pings</div>
          <p className="muted mt-0.5 text-xs">
            {state === "on" ? "This device is subscribed — new pilot requests ping you within seconds." : "Free Web Push, no app install (iPhone aside). Email alerts continue regardless."}
          </p>
        </div>
        <div className="ms-auto flex gap-2">
          {state === "on" ? (
            <>
              <button className="btn-ghost text-xs" disabled={busy} onClick={test}>Send test ping</button>
              <button className="btn-ghost text-xs" disabled={busy} onClick={disable}>Disable on this device</button>
            </>
          ) : (
            <button className="btn-primary text-xs" disabled={busy || state === "unsupported"} onClick={enable}>
              {state === "checking" ? "Checking…" : state === "unsupported" ? "Not supported by this browser" : "Enable pings on this device"}
            </button>
          )}
        </div>
      </div>
      {(state === "off" || state === "unsupported") && !msg && (
        <p className="muted mt-2 text-[11px]">{platformHint}</p>
      )}
      {msg && <p className="mt-2 text-xs text-violet-300">{msg}</p>}
    </div>
  );
}
