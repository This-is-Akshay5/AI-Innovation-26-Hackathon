import { NextResponse, type NextRequest } from "next/server";
import { ERRORS, requireUser } from "@/lib/api/http";
import { createRecordSchema, firstZodMessage } from "@/lib/api/schemas";
import { writeAudit } from "@/lib/audit";
import { hashRecord } from "@/lib/hash";
import { createServiceSupabase } from "@/lib/supabase/server";
import { chainRegisterRecordHash, isBlockchainConfigured } from "@/lib/blockchain/client";
import { toChainRef, recordIdToBytes32, contentHashToBytes32 } from "@/lib/blockchain/ids";

/**
 * GET /api/records?patientId=...
 *
 * Returns only the records the CALLER is allowed to see. There is no
 * category filtering in this handler — the RLS policies on medical_records
 * do it. A doctor with a medications-only permission literally cannot
 * select the allergy rows, so the array that comes back is already scoped.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();

  const patientId = request.nextUrl.searchParams.get("patientId") ?? ctx.userId;

  const { data: records, error } = await ctx.supabase
    .from("medical_records")
    .select("*")
    .eq("patient_id", patientId)
    .order("occurred_on", { ascending: false });

  if (error) return ERRORS.databaseError(error.message);

  // Log the view only when a provider reads someone else's chart — a
  // patient paging through their own timeline shouldn't flood the audit log.
  if (ctx.role === "doctor" && patientId !== ctx.userId && records && records.length > 0) {
    const categories = Array.from(new Set(records.map((r) => r.category)));
    await writeAudit({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "record_viewed",
      patientId,
      resourceType: "medical_record",
      authorizationContext: `Viewed ${records.length} authorized record(s): ${categories.join(", ")}`,
    });
  }

  return NextResponse.json({ records: records ?? [] });
}

/**
 * POST /api/records — a doctor adds a record to a patient's chart.
 * Requires an active permission covering that category, enforced by the
 * medical_records insert policy (not just by this handler).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "doctor") {
    return ERRORS.permissionDenied("Only provider accounts can add medical records.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) return ERRORS.invalidInput(firstZodMessage(parsed.error));
  const { patientId, category, title, occurredOn, details, notes } = parsed.data;

  const { data: membership } = await ctx.supabase
    .from("provider_memberships")
    .select("organization_id")
    .eq("profile_id", ctx.userId)
    .maybeSingle();

  const contentHash = hashRecord({
    patient_id: patientId,
    category,
    title,
    occurred_on: occurredOn,
    details,
    notes,
  });

  const { data: record, error } = await ctx.supabase
    .from("medical_records")
    .insert({
      patient_id: patientId,
      author_id: ctx.userId,
      organization_id: membership?.organization_id ?? null,
      category: category as never,
      title,
      occurred_on: occurredOn,
      details,
      notes: notes ?? null,
      content_hash: contentHash,
      integrity_status: isBlockchainConfigured() ? "pending" : "not_registered",
    })
    .select("*")
    .single();

  if (error || !record) {
    // An RLS rejection here means the doctor has no active permission for
    // this category — surface that as authorization, not a generic failure.
    if (error?.code === "42501") {
      return ERRORS.permissionDenied(
        `You do not have an active permission covering ${category} records for this patient.`
      );
    }
    return ERRORS.databaseError(error?.message ?? "Could not create the record.");
  }

  let chainTxHash: string | null = null;
  let integrityStatus: "verified" | "not_registered" | "unavailable" = "not_registered";
  let chainStatus: "confirmed" | "failed" | "unavailable" = "unavailable";

  if (isBlockchainConfigured()) {
    const result = await chainRegisterRecordHash({
      recordId: recordIdToBytes32(record.id),
      patientRef: toChainRef(patientId),
      contentHash: contentHashToBytes32(contentHash),
    });
    if (result.status === "confirmed") {
      chainTxHash = result.txHash;
      chainStatus = "confirmed";
      integrityStatus = "verified";
      const service = createServiceSupabase();
      await service.from("blockchain_events").insert({
        event_type: "RecordHashRegistered",
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        related_record_id: record.id,
        payload: { content_hash: contentHash },
      });
    } else {
      integrityStatus = "unavailable";
      chainStatus = result.status === "failed" ? "failed" : "unavailable";
    }
  }

  await ctx.supabase
    .from("medical_records")
    .update({
      integrity_status: integrityStatus,
      chain_tx_hash: chainTxHash,
      chain_tx_status: chainStatus,
    })
    .eq("id", record.id);

  await writeAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "record_created",
    patientId,
    resourceType: "medical_record",
    resourceId: record.id,
    organizationId: membership?.organization_id ?? null,
    authorizationContext: `Created ${category} record under active permission`,
    chainTxHash,
    chainTxStatus: chainStatus,
  });

  return NextResponse.json(
    { record: { ...record, integrity_status: integrityStatus, chain_tx_hash: chainTxHash } },
    { status: 201 }
  );
}
