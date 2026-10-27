// Private .ics subscribe feed — the free, no-money calendar integration.
// Every calendar app (Google, Apple, Outlook) can consume the URL; the token
// in query is the auth because calendar apps can't sign in. Times are
// anchored with the org's own TZID, so "2:00 PM" means 2:00 PM at the SHOP
// regardless of the viewer's current timezone — the travel fix.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function icsDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`
  );
}

function wallStamp(dt: Date, tz: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(dt);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  let hour = g("hour").padStart(2, "0");
  if (hour === "24") hour = "00";
  return `${g("year")}${g("month")}${g("day")}T${hour}${g("minute")}${g("second")}`;
}

function escapeIcs(s: string): string {
  return s.replaceAll("\\\\", "\\\\\\\\").replaceAll(",", "\\\\,").replaceAll(";", "\\\\;").replaceAll("\n", "\\\\n");
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const [org] = await sql`
    select o.id, o.name, p.timezone
    from business_profiles p
    join organizations o on o.id = p.organization_id
    where p.calendar_token = ${token}`;
  if (!org) return NextResponse.json({ error: "Unknown calendar link — regenerate it in Settings" }, { status: 404 });

  const tz = typeof org.timezone === "string" && org.timezone.includes("/") ? org.timezone : "America/Chicago";
  const rows = await sql`
    select a.title, a.scheduled_for, a.status, c.name as customer
    from appointments a join customers c on c.id = a.customer_id
    where a.organization_id = ${org.id}
      and a.status = 'SCHEDULED'
      and a.scheduled_for >= now() - interval '7 days'
      and a.scheduled_for <= now() + interval '120 days'
    order by a.scheduled_for asc limit 100`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CUE//Appointments//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${org.name} — scheduled visits (${tz})`,
    `X-WR-TIMEZONE:${tz}`,
  ];
  for (const r of rows) {
    const start = new Date(r.scheduled_for);
    const stamp = wallStamp(start, tz);
    lines.push(
      "BEGIN:VEVENT",
      `UID:cue-appt-${start.getTime()}-${org.id}@cue`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART;TZID=${tz}:${stamp}`,
      `DTEND;TZID=${tz}:${wallStamp(new Date(start.getTime() + 2 * 3600_000), tz)}`,
      `SUMMARY:${escapeIcs(`${r.title}${r.customer ? ` — ${r.customer}` : ""}`)}`,
      `DESCRIPTION:${escapeIcs(`Scheduled in CUE · timezone ${tz}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
