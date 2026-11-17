import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { rateLimitResult, clientKey } from "@/lib/rate-limit";
import { notifyPilotRequest, sendBookingConfirmation } from "@/lib/leads";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  shop: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email().max(200).optional(),
  source: z.enum(["FLYER", "WEB"]).optional(),
  preferredTime: z.string().trim().max(80).optional(),
});

/**
 * Public capture for the flyer QR / "text SCAN" landing page — books the
 * free 20-minute scan call. Writes exactly one narrow row (name, shop,
 * phone, optional email); never accepts business data. 5/hour/IP keeps a
 * human's retries safe and a bot useless.
 */
export async function POST(req: Request) {
  const rl = rateLimitResult(clientKey(req, "scan"), 5, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in your name, shop, and phone." }, { status: 400 });
  }
  const { name, shop, phone, email, source, preferredTime } = parsed.data;
  if (preferredTime && !email) {
    return NextResponse.json(
      { error: "Add your email so we can send the confirmation for your requested slot." },
      { status: 400 },
    );
  }

  try {
    await sql`
      insert into scan_leads (name, shop, phone, email, source, preferred_time)
      values (${name}, ${shop}, ${phone}, ${email ?? null}, ${source ?? "FLYER"}, ${preferredTime ?? null})`;
  } catch (e) {
    console.error("scan_leads insert failed", e);
    return NextResponse.json({ error: "Could not save — please text SCAN instead." }, { status: 500 });
  }

  // Owner inbox ping — fire-and-forget so a mail hiccup never blocks the
  // submit; the lead row itself is the system of record.
  void notifyPilotRequest({ name, shop, phone, email, source: source ?? "FLYER", preferredTime });

  // Visitor confirmation is part of the booking promise. Await it so the
  // success screen can tell the truth about whether the email left.
  let confirmation: "sent" | "skipped" | "failed" = "skipped";
  if (email && preferredTime) {
    try {
      const result = await sendBookingConfirmation({ name, email, shop, preferredTime });
      confirmation = result.sent ? "sent" : "failed";
    } catch (e) {
      console.error("booking confirmation unexpected failure", e);
      confirmation = "failed";
    }
  }

  return NextResponse.json({ ok: true, confirmation });
}
