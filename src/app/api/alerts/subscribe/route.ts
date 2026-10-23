import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";

const bodySchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    auth: z.string().min(10).max(200),
    p256dh: z.string().min(10).max(200),
  }),
  userAgent: z.string().max(300).optional(),
});

/** Signed-in owner registers one device for lead-alert whispers (upsert). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role === "MEMBER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push not configured on this deployment (VAPID keys missing)" }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad subscription payload" }, { status: 400 });
  const { endpoint, keys, userAgent } = parsed.data;

  await sql`
    insert into lead_push_subscriptions (endpoint, keys, user_agent)
    values (${endpoint}, ${sql.json(keys)}, ${userAgent ?? null})
    on conflict (endpoint) do update
      set keys = excluded.keys, user_agent = excluded.user_agent, updated_at = now()`;

  return NextResponse.json({ ok: true });
}

/** Remove a device (either because the user asked, or the browser unsubscribed). */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || session.role === "MEMBER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await sql`delete from lead_push_subscriptions where endpoint = ${endpoint}`;
  return NextResponse.json({ ok: true });
}

/** Config + subscription state for the toggle UI. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ configured: pushConfigured(), publicKey: vapidPublicKey() });
}
