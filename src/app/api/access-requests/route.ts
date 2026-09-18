import { NextResponse, type NextRequest } from "next/server";
import { ERRORS, requireUser } from "@/lib/api/http";
import { accessRequestSchema, firstZodMessage } from "@/lib/api/schemas";
import { writeAudit } from "@/lib/audit";

/**
 * A doctor asks a patient for access to specific record categories.
 * Creating a request grants nothing on its own — it moves the permission
 * lifecycle to `requested` and waits for the patient to approve a subset.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "doctor") {
    return ERRORS.permissionDenied("Only provider accounts can request patient access.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return ERRORS.invalidInput(firstZodMessage(parsed.error));
  }
  const { patientId, categories, durationDays, reason } = parsed.data;

  if (patientId === ctx.userId) {
    return ERRORS.invalidInput("You cannot request access to your own records.");
  }

  // Confirm the target exists and is actually a patient, without leaking
  // whether an arbitrary UUID belongs to a real user of another role.
  const { data: patient } = await ctx.supabase
    .from("profiles")
    .select("id, role")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient || patient.role !== "patient") {
    return ERRORS.notFound("patient");
  }

  // Block duplicate open requests to the same patient.
  const { data: existing } = await ctx.supabase
    .from("access_requests")
    .select("id")
    .eq("patient_id", patientId)
    .eq("doctor_id", ctx.userId)
    .eq("status", "requested")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: "You already have a pending access request with this patient.",
        },
      },
      { status: 409 }
    );
  }

  const { data: membership } = await ctx.supabase
    .from("provider_memberships")
    .select("organization_id")
    .eq("profile_id", ctx.userId)
    .maybeSingle();

  const { data: created, error } = await ctx.supabase
    .from("access_requests")
    .insert({
      patient_id: patientId,
      doctor_id: ctx.userId,
      organization_id: membership?.organization_id ?? null,
      requested_categories: categories as never,
      requested_duration_days: durationDays,
      reason: reason ?? null,
    })
    .select("id, requested_categories, requested_duration_days, status, created_at")
    .single();

  if (error || !created) {
    return ERRORS.databaseError(error?.message ?? "Could not create the access request.");
  }

  await writeAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "access_requested",
    patientId,
    resourceType: "access_request",
    resourceId: created.id,
    organizationId: membership?.organization_id ?? null,
    authorizationContext: `Requested ${categories.join(", ")} for ${durationDays} day(s)`,
  });

  return NextResponse.json({ accessRequest: created }, { status: 201 });
}
