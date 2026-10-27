"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { rateLimitResult } from "@/lib/rate-limit";
import {
  parseCommand,
  matchCustomerDrafts,
  buildTitle,
  type CommandKind,
} from "@/lib/commands";

/**
 * The "type what you want" bar: the user writes a sentence, CUE parses it into
 * a DRAFT (customer, kind, title, amount, property address, visit time) and the
 * user confirms before anything is written. Nothing here is autonomous — the
 * draft is a form that filled itself in. Parsing is deterministic (lib/commands)
 * so it needs no AI key and never invents a customer.
 */

export type CommandMatch = { id: string; name: string; address: string | null };

export type CommandDraft = {
  ok: boolean;
  error?: string;
  retryAfterSecs?: number;
  kind: CommandKind;
  customerId: string | null;
  customerName: string | null;
  /** Other plausible customers when the name was ambiguous — user picks one. */
  alternatives: CommandMatch[];
  title: string;
  amount: number;
  address: string | null;
  whenISO: string | null;
  missing: string[];
};

const draftSchema = z.object({
  kind: z.enum(["JOB", "ESTIMATE", "VISIT"]),
  customerId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  amount: z.number().min(0).max(1_000_000),
  address: z.string().trim().max(200).nullable(),
  whenISO: z.string().min(10).max(40).nullable(),
});

function parseWhenLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function draftCommand(input: string): Promise<CommandDraft> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Owner, Admin or Manager access required", kind: "JOB", customerId: null, customerName: null, alternatives: [], title: "", amount: 0, address: null, whenISO: null, missing: [] };
  }
  const rl = rateLimitResult(`cmd-draft:${session.organizationId}`, 30, 60_000);
  if (!rl.ok) {
    return { ok: false, error: "Slow down a moment — too many drafts.", retryAfterSecs: rl.retryAfterSecs, kind: "JOB", customerId: null, customerName: null, alternatives: [], title: "", amount: 0, address: null, whenISO: null, missing: [] };
  }

  const text = input.trim().slice(0, 400);
  if (text.length < 3) {
    return { ok: false, error: "Write a little more — e.g. “new job for Summit Air $1,250 replace heater Friday 9am”.", kind: "JOB", customerId: null, customerName: null, alternatives: [], title: "", amount: 0, address: null, whenISO: null, missing: [] };
  }

  const orgId = session.organizationId;
  const rows = await sql`select id, name, address from customers where organization_id = ${orgId} order by name asc limit 500`;
  const customers = rows as unknown as { id: string; name: string; address: string | null }[];

  const P = parseCommand(text);
  const matches = P.customerQuery ? matchCustomerDrafts(P.customerQuery, customers) : [];

  let customerId: string | null = null;
  let customerName: string | null = null;
  const alternatives = matches.slice(0, 6);
  if (matches.length === 1) {
    customerId = matches[0].id;
    customerName = matches[0].name;
  }

  const title = buildTitle(
    P.leftover,
    customerName ?? P.customerQuery ?? "",
    P.kind,
    P.customerQuery
  );

  const missing: string[] = [];
  if (!customerId) missing.push("customer");
  if (P.kind === "VISIT" && !P.when) missing.push("when");

  return {
    ok: true,
    kind: P.kind,
    customerId,
    customerName,
    alternatives,
    title,
    amount: P.amount ?? 0,
    address: P.address,
    whenISO: P.when,
    missing,
  };
}

export async function confirmCommand(
  draft: unknown
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") return { ok: false, error: "Owner, Admin or Manager access required" };
  const rl = rateLimitResult(`cmd-confirm:${session.organizationId}`, 20, 60_000);
  if (!rl.ok) return { ok: false, error: "Slow down a moment — too many writes." };

  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "The draft is incomplete — check the highlighted fields." };
  const d = parsed.data;

  const orgId = session.organizationId;
  const [customer] = await sql`
    select id, name, address from customers
    where id = ${d.customerId} and organization_id = ${orgId}`;
  if (!customer) return { ok: false, error: "Customer not in your organization." };

  let whenDate: Date | null = null;
  if (d.whenISO) {
    const t = new Date(d.whenISO);
    if (Number.isNaN(t.getTime())) return { ok: false, error: "Visit time isn't readable — clear it or pick it again." };
    whenDate = t;
  }

  try {
    if (d.kind === "VISIT") {
      if (!whenDate) return { ok: false, error: "A visit needs a time — set one before confirming." };
      const [appt] = await sql`
        insert into appointments (organization_id, customer_id, title, kind, scheduled_for)
        values (${orgId}, ${customer.id}, ${d.title.slice(0, 160)}, 'SERVICE', ${whenDate.toISOString()})
        returning id`;
      await logAudit({
        organizationId: orgId,
        actorType: "USER",
        actorId: session.user.id,
        action: "COMMAND_CONFIRMED",
        targetType: "Appointment",
        targetId: String((appt as unknown as { id?: string }).id ?? ""),
        detail: `${session.user.name} added visit “${d.title.slice(0, 120)}” for ${customer.name} — ${parseWhenLabel(whenDate.toISOString())}.`,
        metadata: { via: "command-bar", kind: d.kind },
      });
      revalidatePath("/pipeline");
      revalidatePath("/pipeline/unscheduled");
      return { ok: true, message: `Visit added for ${customer.name} — ${parseWhenLabel(whenDate.toISOString())}.` };
    }

    const [order] = await sql`
      insert into service_orders (organization_id, customer_id, title, amount, status, service_type, property_address)
      values (${orgId}, ${customer.id}, ${d.title.slice(0, 160)}, ${d.amount.toFixed(2)}, 'OPEN',
              ${d.kind === "ESTIMATE" ? "Quote" : null}, ${d.address || null})
      returning id, title`;

    if (whenDate) {
      await sql`
        insert into appointments (organization_id, customer_id, title, kind, scheduled_for)
        values (${orgId}, ${customer.id}, ${`Visit — ${d.title.slice(0, 140)}`}, 'SERVICE', ${whenDate.toISOString()})`;
    }

    await logAudit({
      organizationId: orgId,
      actorType: "USER",
      actorId: session.user.id,
      action: "COMMAND_CONFIRMED",
      targetType: "ServiceOrder",
      targetId: String(order.id),
      detail: `${session.user.name} added ${d.kind === "ESTIMATE" ? "estimate" : "job"} “${d.title.slice(0, 120)}” for ${customer.name}${d.address ? ` at ${d.address}` : ""} ($${d.amount.toFixed(2)})${whenDate ? ` + visit ${parseWhenLabel(whenDate.toISOString())}` : ""}.`,
      metadata: { via: "command-bar", kind: d.kind, address: d.address || null },
    });
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/unscheduled");
    return {
      ok: true,
      message: `${d.kind === "ESTIMATE" ? "Estimate" : "Job"} “${d.title}” added for ${customer.name}${d.address ? ` at ${d.address}` : ""} — $${d.amount.toFixed(2)}${whenDate ? `, visit ${parseWhenLabel(whenDate.toISOString())}` : ""}.`,
    };
  } catch {
    return { ok: false, error: "Could not save — try again." };
  }
}
