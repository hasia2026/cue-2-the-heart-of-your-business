import { prisma } from "./prisma";

export type AuditInput = {
  organizationId: string;
  actorType?: "USER" | "AI" | "SYSTEM";
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

/** Central audit log. Every consequential action must call this. */
export async function logAudit(input: AuditInput) {
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType ?? "USER",
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: input.detail,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}
