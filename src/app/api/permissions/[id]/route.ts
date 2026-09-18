import { NextResponse } from "next/server";
import { ERRORS, requireUser } from "@/lib/api/http";
import { writeAudit } from "@/lib/audit";
import { createServiceSupabase } from "@/lib/supabase/server";
import { chainRevokeAccess, isBlockchainConfigured } from "@/lib/blockchain/client";
import { permissionIdToBytes32 } from "@/lib/blockchain/ids";

/**
 * Revocation sets permissions.status = 'revoked'. Because
 * has_active_permission() (used by every RLS policy on medical_records)
 * requires status = 'active', the doctor loses read access on their very
 * next query — this is not a UI-level hide.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "patient") {
    return ERRORS.permissionDenied("Only the patient can revoke access to their records.");
  }

  const { id } = await params;

  const { data: permission } = await ctx.supabase
    .from("permissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!permission) return ERRORS.notFound("permission");
  if (permission.patient_id !== ctx.userId) {
    return ERRORS.permissionDenied("This permission does not belong to you.");
  }
  if (permission.status !== "active") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: `This permission is already ${permission.status}.` } },
      { status: 409 }
    );
  }

  const { error } = await ctx.supabase
    .from("permissions")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return ERRORS.databaseError(error.message);

  let chainTxHash: string | null = null;
  let chainStatus: "confirmed" | "failed" | "unavailable" = "unavailable";

  if (isBlockchainConfigured() && permission.chain_tx_status === "confirmed") {
    const result = await chainRevokeAccess(permissionIdToBytes32(id));
    if (result.status === "confirmed") {
      chainTxHash = result.txHash;
      chainStatus = "confirmed";
      const service = createServiceSupabase();
      await service.from("blockchain_events").insert({
        event_type: "AccessRevoked",
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        related_permission_id: id,
        payload: {},
      });
    } else {
      chainStatus = result.status === "failed" ? "failed" : "unavailable";
    }
  }

  await writeAudit({
    actorId: ctx.userId,
    actorRole: "patient",
    action: "access_revoked",
    patientId: ctx.userId,
    resourceType: "permission",
    resourceId: id,
    organizationId: permission.organization_id,
    authorizationContext: "Patient revoked access ahead of expiry",
    chainTxHash,
    chainTxStatus: chainStatus,
  });

  return NextResponse.json({
    ok: true,
    blockchain: {
      status: chainStatus,
      txHash: chainTxHash,
      note:
        chainStatus === "confirmed"
          ? "Revocation registered on Sepolia testnet."
          : "Access is revoked in the database. On-chain revocation was not recorded.",
    },
  });
}
