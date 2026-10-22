// Shared helper for the service-plan sign-up links (spec §3). Senders (quote
// send route, digest cron + manual send) resolve the URL once and hand it to
// the pure email builders, so builder output never depends on request state.
// Base URL follows the established convention (signin/reset-actions.ts):
// APP_URL when set, else the incoming request's own origin.
import { headers } from "next/headers";
import { sql } from "./db";
import { isLocale } from "./i18n";

export type SignupSource = "QUOTE" | "DIGEST";

export async function baseAppUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3210";
  return `${proto}://${host}`;
}

/** Tracked sign-up URL, e.g. https://app/plans/<orgId>?src=quote&q=<quoteId>&lang=es */
export async function signupUrl(
  orgId: string,
  src: { source: SignupSource; ref?: string | null; locale?: string | null },
): Promise<string> {
  const base = await baseAppUrl();
  const params = new URLSearchParams();
  params.set("src", src.source.toLowerCase());
  if (src.ref) params.set(src.source === "QUOTE" ? "q" : "w", src.ref.slice(0, 64));
  if (isLocale(src.locale)) params.set("lang", src.locale as string);
  return `${base}/plans/${orgId}?${params.toString()}`;
}

/** Sender convenience: returns the tracked URL only when the org has at
 *  least one active plan — otherwise null, so emails never link to an
 *  empty page. */
export async function signupUrlIfPlans(
  orgId: string,
  src: { source: SignupSource; ref?: string | null; locale?: string | null },
): Promise<string | null> {
  const [row] = await sql`
    select 1 from service_plans where organization_id = ${orgId} and active = true limit 1`;
  if (!row) return null;
  return signupUrl(orgId, src);
}

/** Plain page link (no attribution) — the one owners copy in Enhance. */
export function plainPlansUrl(base: string, orgId: string): string {
  return `${base}/plans/${orgId}`;
}
