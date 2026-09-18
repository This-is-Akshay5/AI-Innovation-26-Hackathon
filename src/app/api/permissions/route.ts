import { NextResponse, type NextRequest } from "next/server";
import { ERRORS, requireUser } from "@/lib/api/http";
import { grantPermissionSchema, denyRequestSchema, firstZodMessage } from "@/lib/api/schemas";
import { writeAudit } from "@/lib/audit";
import { createServiceSupabase } from "@/lib/supabase/server";
import { chainGrantAccess, isBlockchainConfigured } from "@/lib/blockchain/client";
import { toChainRef, scopeHash, permissionIdToBytes32 } from "@/lib/blockchain/ids";
import type { RecordCategory } from "@/lib/types/database";

/**
 * The patient approves an access request, choosing which of the requested
 * categories to actually grant. This is the selective-access core: the
 * granted set is validated to be a SUBSET of what was requested, so a
 * tampered client cannot widen its own scope.
 *
 * After the row is written, the grant is registered on-chain. A blockchain
 * failure does NOT roll back the permission (the patient's decision stands
 * and authorization works off the database), but it is recorded honestly as
 * `failed` / `unavailable` rather than being presented as confirmed.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "patient") {
    return ERRORS.permissionDenied("Only the patient can grant access to their records.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = grantPermissionSchema.safeParse(body);
  if (!parsed.success) return ERRORS.invalidInput(firstZodMessage(parsed.error));
  const { accessRequestId, grantedCategories, durationDays } = parsed.data;

  // RLS limits this read to the calling patient's own requests.
  const { data: accessRequest } = await ctx.supabase
    .from("access_requests")
    .select("*")
    .eq("id", accessRequestId)
    .maybeSingle();

  if (!accessRequest) return ERRORS.notFound("access request");
  if (accessRequest.patient_id !== ctx.userId) {
    return ERRORS.permissionDenied("This access request does not belong to you.");
  }
  if (accessRequest.status !== "requested") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "This access request has already been resolved." } },
      { status: 409 }
    );
  }

  // Server-side subset check — the whole point of selective access.
  const requested = new Set(accessRequest.requested_categories as string[]);
  const notRequested = grantedCategories.filter((c) => !requested.has(c));
  if (notRequested.length > 0) {
    return ERRORS.invalidInput(
      `Cannot grant categories that were not requested: ${notRequested.join(", ")}.`
    );
  }
  if (durationDays > accessRequest.requested_duration_days) {
    return ERRORS.invalidInput("Granted duration cannot exceed the requested duration.");
  }

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const { data: permission, error: permError } = await ctx.supabase
    .from("permissions")
    .insert({
      access_request_id: accessRequest.id,
      patient_id: ctx.userId,
      doctor_id: accessRequest.doctor_id,
      organization_id: accessRequest.organization_id,
      granted_categories: grantedCategories as RecordCategory[],
      status: "active",
      expires_at: expiresAt.toISOString(),
      chain_tx_status: isBlockchainConfigured() ? "pending" : "unavailable",
    })
    .select("*")
    .single();

  if (permError || !permission) {
    return ERRORS.databaseError(permError?.message ?? "Could not record the permission.");
  }

  await ctx.supabase
    .from("access_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", accessRequest.id);

  // --- On-chain registration -------------------------------------------
  let chainTxHash: string | null = null;
  let chainStatus: "confirmed" | "failed" | "unavailable" = "unavailable";

  if (isBlockchainConfigured()) {
    const result = await chainGrantAccess({
      permissionId: permissionIdToBytes32(permission.id),
      patientRef: toChainRef(ctx.userId),
      doctorRef: toChainRef(accessRequest.doctor_id),
      scopeHash: scopeHash(grantedCategories),
      expiresAtUnix: Math.floor(expiresAt.getTime() / 1000),
    });

    if (result.status === "confirmed") {
      chainTxHash = result.txHash;
      chainStatus = "confirmed";
      const service = createServiceSupabase();
      await service.from("blockchain_events").insert({
        event_type: "AccessGranted",
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        related_permission_id: permission.id,
        payload: {
          scope_hash: scopeHash(grantedCategories),
          expires_at_unix: Math.floor(expiresAt.getTime() / 1000),
        },
      });
    } else {
      chainStatus = result.status === "failed" ? "failed" : "unavailable";
    }
  }

  await ctx.supabase
    .from("permissions")
    .update({ chain_tx_hash: chainTxHash, chain_tx_status: chainStatus })
    .eq("id", permission.id);

  await writeAudit({
    actorId: ctx.userId,
    actorRole: "patient",
    action: "access_granted",
    patientId: ctx.userId,
    resourceType: "permission",
    resourceId: permission.id,
    organizationId: accessRequest.organization_id,
    authorizationContext: `Granted ${grantedCategories.join(", ")} for ${durationDays} day(s)`,
    chainTxHash,
    chainTxStatus: chainStatus,
  });

  return NextResponse.json(
    {
      permission: { ...permission, chain_tx_hash: chainTxHash, chain_tx_status: chainStatus },
      blockchain: {
        status: chainStatus,
        txHash: chainTxHash,
        note:
          chainStatus === "confirmed"
            ? "Grant registered on Sepolia testnet."
            : chainStatus === "failed"
              ? "Blockchain confirmation failed. The permission is active in the database but is not blockchain-confirmed."
              : "Blockchain is not configured. The permission is active in the database only.",
      },
    },
    { status: 201 }
  );
}

/** Patient denies an access request outright. */
export async function PATCH(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "patient") return ERRORS.permissionDenied();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = denyRequestSchema.safeParse(body);
  if (!parsed.success) return ERRORS.invalidInput(firstZodMessage(parsed.error));

  const { data: accessRequest } = await ctx.supabase
    .from("access_requests")
    .select("*")
    .eq("id", parsed.data.accessRequestId)
    .maybeSingle();

  if (!accessRequest) return ERRORS.notFound("access request");
  if (accessRequest.patient_id !== ctx.userId) return ERRORS.permissionDenied();
  if (accessRequest.status !== "requested") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "This access request has already been resolved." } },
      { status: 409 }
    );
  }

  const { error } = await ctx.supabase
    .from("access_requests")
    .update({ status: "denied", resolved_at: new Date().toISOString() })
    .eq("id", accessRequest.id);

  if (error) return ERRORS.databaseError(error.message);

  await writeAudit({
    actorId: ctx.userId,
    actorRole: "patient",
    action: "access_denied",
    patientId: ctx.userId,
    resourceType: "access_request",
    resourceId: accessRequest.id,
    authorizationContext: "Patient denied the access request",
  });

  return NextResponse.json({ ok: true });
}
