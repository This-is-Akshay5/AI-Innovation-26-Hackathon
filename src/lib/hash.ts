import { createHash } from "crypto";

/**
 * Deterministic JSON stringify (keys sorted recursively) so the same record
 * always hashes to the same value regardless of object key order.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export interface HashableRecord {
  patient_id: string;
  category: string;
  title: string;
  occurred_on: string;
  details: unknown;
  notes: string | null | undefined;
}

/** The canonical string a record's content_hash is computed over. Exposed
 * so the verification endpoint can recompute it from a live row and compare. */
export function canonicalRecordString(record: HashableRecord): string {
  return JSON.stringify(
    canonicalize({
      patient_id: record.patient_id,
      category: record.category,
      title: record.title,
      occurred_on: record.occurred_on,
      details: record.details ?? {},
      notes: record.notes ?? null,
    })
  );
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashRecord(record: HashableRecord): string {
  return sha256Hex(canonicalRecordString(record));
}
