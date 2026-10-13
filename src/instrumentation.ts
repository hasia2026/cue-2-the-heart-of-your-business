// Next.js server-side error hook — the automatic capture point for every
// server 500 / digest crash, wired into the lightweight monitor (src/lib/monitor).
// No external SDK: events go to our own /api/monitor/log endpoint so the
// deploy's CUE_SESSION_SECRET-authenticated ingest stays app-internal.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string; renderSource?: string },
): Promise<void> {
  try {
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : null;
    const message = error instanceof Error ? error.message : String(error);
    const base = process.env.APP_URL ?? "";
    if (!base) {
      // Local/direct mode: record straight into the DB instead of round-tripping.
      const { recordError } = await import("@/lib/monitor");
      await recordError({ message, digest, path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType, source: "SERVER" });
      return;
    }
    await fetch(`${base}/api/monitor/log`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cue-monitor": process.env.MONITOR_INGEST_TOKEN ?? "" },
      body: JSON.stringify({ message, digest, path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType, source: "SERVER" }),
    });
  } catch (reportErr) {
    console.error("onRequestError reporting failed", reportErr);
  }
}
