import type { RecordCategory, PermissionStatus } from "@/lib/types/database";

export interface MedicalRecordRow {
  id: string;
  patient_id: string;
  author_id: string;
  organization_id: string | null;
  category: RecordCategory;
  title: string;
  occurred_on: string;
  details: Record<string, unknown>;
  notes: string | null;
  content_hash: string;
  integrity_status: string;
  chain_tx_hash: string | null;
  chain_tx_status: string | null;
  created_at: string;
  updated_at: string;
}

export const RECORD_CATEGORIES: RecordCategory[] = [
  "diagnosis",
  "medication",
  "allergy",
  "lab_result",
  "treatment",
  "clinical_note",
];

export const CATEGORY_LABELS: Record<RecordCategory, string> = {
  diagnosis: "Diagnosis",
  medication: "Medication",
  allergy: "Allergy",
  lab_result: "Lab Result",
  treatment: "Treatment",
  clinical_note: "Clinical Note",
};

export const PERMISSION_STATUS_LABELS: Record<PermissionStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  active: "Active",
  denied: "Denied",
  expired: "Expired",
  revoked: "Revoked",
};

export function isPermissionCurrentlyActive(status: PermissionStatus, expiresAt: string): boolean {
  return status === "active" && new Date(expiresAt).getTime() > Date.now();
}
