import { sql } from "./db";

/** Append to the organization's audit trail. Never throws into caller. */
export async function logAudit(opts: {
  organizationId: string;
  actorType?: "USER" | "AI" | "SYSTEM";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  metadata?: unknown;
}) {
  try {
    await sql`
      insert into audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, detail, metadata)
      values (${opts.organizationId}, ${opts.actorType ?? "USER"}, ${opts.actorId ?? null}, ${opts.action},
        ${opts.targetType ?? null}, ${opts.targetId ?? null}, ${opts.detail ?? null},
        ${opts.metadata ? JSON.stringify(opts.metadata) : null})`;
  } catch (e) {
    console.error("audit write failed", e);
  }
}
