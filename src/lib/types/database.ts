// Hand-authored to mirror supabase/migrations/0001_init.sql and 0002_expiry.sql
// exactly. Once you have a live Supabase project, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
// and re-check it still matches this file's shape (it should — this was
// written directly off the migration).

export type UserRole = "patient" | "doctor" | "provider_admin";
export type RecordCategory =
  | "diagnosis"
  | "medication"
  | "allergy"
  | "lab_result"
  | "treatment"
  | "clinical_note";
export type PermissionStatus =
  | "requested"
  | "approved"
  | "active"
  | "denied"
  | "expired"
  | "revoked";
export type IntegrityStatus = "not_registered" | "pending" | "verified" | "mismatch" | "unavailable";
export type BlockchainTxStatus = "pending" | "confirmed" | "failed" | "unavailable";
export type AuditAction =
  | "login"
  | "record_created"
  | "record_updated"
  | "record_viewed"
  | "access_requested"
  | "access_granted"
  | "access_denied"
  | "access_revoked"
  | "access_expired"
  | "integrity_verified"
  | "integrity_mismatch_detected"
  | "ai_summary_generated"
  | "ai_summary_failed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          chain_ref: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          role: UserRole;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      organizations: {
        Row: { id: string; name: string; chain_ref: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["organizations"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Relationships: [];
      };
      provider_memberships: {
        Row: {
          id: string;
          profile_id: string;
          organization_id: string;
          title: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["provider_memberships"]["Row"]> & {
          profile_id: string;
          organization_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_memberships"]["Row"]>;
        Relationships: [];
      };
      medical_records: {
        Row: {
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
          integrity_status: IntegrityStatus;
          chain_tx_hash: string | null;
          chain_tx_status: BlockchainTxStatus | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["medical_records"]["Row"]> & {
          patient_id: string;
          author_id: string;
          category: RecordCategory;
          title: string;
          occurred_on: string;
          content_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["medical_records"]["Row"]>;
        Relationships: [];
      };
      access_requests: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id: string;
          organization_id: string | null;
          requested_categories: RecordCategory[];
          requested_duration_days: number;
          reason: string | null;
          status: PermissionStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["access_requests"]["Row"]> & {
          patient_id: string;
          doctor_id: string;
          requested_categories: RecordCategory[];
          requested_duration_days: number;
        };
        Update: Partial<Database["public"]["Tables"]["access_requests"]["Row"]>;
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          access_request_id: string | null;
          patient_id: string;
          doctor_id: string;
          organization_id: string | null;
          granted_categories: RecordCategory[];
          status: PermissionStatus;
          granted_at: string;
          expires_at: string;
          revoked_at: string | null;
          chain_tx_hash: string | null;
          chain_tx_status: BlockchainTxStatus | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["permissions"]["Row"]> & {
          patient_id: string;
          doctor_id: string;
          granted_categories: RecordCategory[];
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Row"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: UserRole | null;
          action: AuditAction;
          patient_id: string | null;
          resource_type: string | null;
          resource_id: string | null;
          organization_id: string | null;
          authorization_context: string | null;
          result: string;
          chain_tx_hash: string | null;
          chain_tx_status: BlockchainTxStatus | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_events"]["Row"]> & {
          action: AuditAction;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Row"]>;
        Relationships: [];
      };
      blockchain_events: {
        Row: {
          id: string;
          event_type: string;
          tx_hash: string;
          block_number: number | null;
          network: string;
          related_permission_id: string | null;
          related_record_id: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["blockchain_events"]["Row"]> & {
          event_type: string;
          tx_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["blockchain_events"]["Row"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      has_active_permission: {
        Args: { p_patient_id: string; p_doctor_id: string; p_category: RecordCategory };
        Returns: boolean;
      };
      sweep_expired_permissions: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      record_category: RecordCategory;
      permission_status: PermissionStatus;
      integrity_status: IntegrityStatus;
      blockchain_tx_status: BlockchainTxStatus;
      audit_action: AuditAction;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
