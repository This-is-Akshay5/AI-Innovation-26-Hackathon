import { NextResponse, type NextRequest } from "next/server";
import { ERRORS, requireUser } from "@/lib/api/http";
import { clinicalSummarySchema, firstZodMessage } from "@/lib/api/schemas";
import { generateClinicalSummary } from "@/lib/ai/clinical-summary";
import { writeAudit } from "@/lib/audit";
import type { MedicalRecordRow } from "@/lib/domain";

/**
 * The grounding boundary: the record set handed to the model is the result
 * of an RLS-scoped SELECT run as the calling doctor. Records outside their
 * granted categories are never fetched, so they cannot appear in the
 * summary even if the model were asked to invent them — and the source-id
 * validation in generateClinicalSummary() rejects any citation pointing
 * outside this set.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();
  if (ctx.role !== "doctor") {
    return ERRORS.permissionDenied("Only provider accounts can generate a clinical history brief.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = clinicalSummarySchema.safeParse(body);
  if (!parsed.success) return ERRORS.invalidInput(firstZodMessage(parsed.error));

  const { data: records, error } = await ctx.supabase
    .from("medical_records")
    .select("*")
    .eq("patient_id", parsed.data.patientId)
    .order("occurred_on", { ascending: false });

  if (error) return ERRORS.databaseError(error.message);

  const authorized = (records ?? []) as MedicalRecordRow[];

  const result = await generateClinicalSummary(authorized);

  if (!result.ok) {
    await writeAudit({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "ai_summary_failed",
      patientId: parsed.data.patientId,
      resourceType: "medical_record",
      authorizationContext: `Summary attempted over ${authorized.length} authorized record(s)`,
      result: "error",
    });

    return NextResponse.json(
      {
        error: {
          code: "AI_ERROR",
          message: `Clinical summary unavailable. ${result.reason}`,
        },
      },
      { status: 503 }
    );
  }

  await writeAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "ai_summary_generated",
    patientId: parsed.data.patientId,
    resourceType: "medical_record",
    authorizationContext: `Summary generated from ${authorized.length} authorized record(s)`,
  });

  // Return the source records themselves so the UI can render each cited
  // id as a real, openable record rather than a bare string.
  const sourceRecords = authorized
    .filter((r) => result.sourceRecordIds.includes(r.id))
    .map((r) => ({ id: r.id, category: r.category, title: r.title, occurred_on: r.occurred_on }));

  return NextResponse.json({
    summary: result.summary,
    sources: sourceRecords,
    recordsConsidered: authorized.length,
    disclaimer:
      "AI-generated summary based only on authorized records. Verify against the original medical records before clinical use.",
  });
}
