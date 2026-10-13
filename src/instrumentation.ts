// Next.js server-side error hook — the automatic capture point for every
// server 500 / digest crash, wired into the lightweight monitor via
// /api/monitor/log. Deliberately dependency-free: importing the DB here pulls
// node:crypto into the instrumentation bundle, which webpack dev cannot handle.
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
    const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
    if (!base) {
      // No self-origin configured — at least keep the error visible in runtime logs.
      console.error("[monitor] no APP_URL; error not persisted:", message, digest, context.routePath);
      return;
    }
    await fetch(`${base}/api/monitor/log`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cue-monitor": process.env.MONITOR_INGEST_TOKEN ?? "" },
      body: JSON.stringify({
        message,
        digest,
        path: request.path,
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
        source: "SERVER",
      }),
    });
  } catch (reportErr) {
    console.error("onRequestError reporting failed", reportErr);
  }
}
