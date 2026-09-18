import { z } from "zod";
import { RECORD_CATEGORIES } from "@/lib/domain";

const categoryEnum = z.enum(RECORD_CATEGORIES as [string, ...string[]]);

export const accessRequestSchema = z.object({
  patientId: z.string().uuid("Patient ID must be a valid identifier."),
  categories: z
    .array(categoryEnum)
    .min(1, "Select at least one record category to request.")
    .max(6),
  durationDays: z
    .number()
    .int("Duration must be a whole number of days.")
    .min(1, "Duration must be at least 1 day.")
    .max(365, "Duration cannot exceed 365 days."),
  reason: z.string().max(500).optional(),
});

export const grantPermissionSchema = z.object({
  accessRequestId: z.string().uuid(),
  // The patient's approved SUBSET. Validated server-side against the
  // original request so a tampered client cannot grant categories that
  // were never requested.
  grantedCategories: z.array(categoryEnum).min(1, "Grant at least one category, or deny the request."),
  durationDays: z.number().int().min(1).max(365),
});

export const denyRequestSchema = z.object({
  accessRequestId: z.string().uuid(),
});

export const createRecordSchema = z.object({
  patientId: z.string().uuid(),
  category: categoryEnum,
  title: z.string().min(2, "Title is required.").max(200),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Enter a valid date.")
    .refine((d) => Date.parse(d) <= Date.now(), "Record date cannot be in the future."),
  details: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(4000).optional(),
});

export const updateRecordSchema = createRecordSchema
  .omit({ patientId: true, category: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

export const clinicalSummarySchema = z.object({
  patientId: z.string().uuid(),
});

export const verifyIntegritySchema = z.object({
  recordId: z.string().uuid(),
});

/** Turns a ZodError into a single readable sentence for the API response. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
