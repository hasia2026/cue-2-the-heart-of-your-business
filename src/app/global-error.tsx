// Client-side last-resort error boundary. When the root layout itself fails,
// this renders and reports the digest to the monitor so the exact number the
// user saw ("Digest: 2814175033") lands in error_events with its page path.
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/monitor/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Client global error",
        digest: error.digest ?? null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        routeType: "client",
        source: "CLIENT",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0b1220", color: "#e6edf5", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#93a4ba", marginBottom: 4 }}>A server-side exception has occurred.</p>
          {error.digest && <p style={{ color: "#93a4ba" }}>Digest: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "10px 22px", borderRadius: 10, border: "1px solid #24344d", background: "#14243c", color: "#8ec5ff", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
