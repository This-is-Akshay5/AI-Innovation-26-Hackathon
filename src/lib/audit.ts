import { createServiceSupabase } from "@/lib/supabase/server";
import type { AuditAction, UserRole, BlockchainTxStatus } from "@/lib/types/database";

export interface AuditEventInput {
  actorId: string | null;
  actorRole: UserRole | null;
  action: AuditAction;
  patientId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  organizationId?: string | null;
  authorizationContext?: string | null;
  result?: "success" | "denied" | "error";
  chainTxHash?: string | null;
  chainTxStatus?: BlockchainTxStatus | null;
}

/**
 * Writes one audit_events row. Always called server-side with the
 * service-role client — audit history must not be something a client can
 * insert directly (see supabase/migrations/0001_init.sql: no insert policy
 * exists for authenticated users on audit_events).
 */
export async function writeAudit(input: AuditEventInput) {
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("audit_events").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: input.action,
    patient_id: input.patientId ?? null,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    organization_id: input.organizationId ?? null,
    authorization_context: input.authorizationContext ?? null,
    result: input.result ?? "success",
    chain_tx_hash: input.chainTxHash ?? null,
    chain_tx_status: input.chainTxStatus ?? null,
  });

  if (error) {
    // Audit-write failure must never be silent, but it also must never take
    // down the primary action that triggered it (e.g. a successful record
    // creation shouldn't fail because the audit insert had a transient
    // error). Log server-side for investigation.
    console.error("[audit] failed to write audit event:", error.message, input);
  }
}
