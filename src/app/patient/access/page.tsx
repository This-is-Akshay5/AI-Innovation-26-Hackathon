import { createServerSupabase } from "@/lib/supabase/server";
import { EmptyPanel, ErrorPanel } from "@/components/ui/Panels";
import { AccessRequestReview } from "@/components/permissions/AccessRequestReview";
import { PermissionsTable } from "@/components/permissions/PermissionsTable";
import type { RecordCategory, PermissionStatus } from "@/lib/types/database";

export interface PendingRequest {
  id: string;
  requested_categories: RecordCategory[];
  requested_duration_days: number;
  reason: string | null;
  created_at: string;
  doctorName: string;
  organizationName: string | null;
}

export interface PermissionRow {
  id: string;
  granted_categories: RecordCategory[];
  status: PermissionStatus;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  chain_tx_hash: string | null;
  chain_tx_status: string | null;
  doctorName: string;
  organizationName: string | null;
}

export default async function AccessPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Flip any naturally-expired rows so the UI shows "Expired" rather than a
  // stale "Active". Authorization itself never depended on this sweep —
  // has_active_permission() checks expires_at directly.
  await supabase.rpc("sweep_expired_permissions");

  const [requestsResult, permissionsResult] = await Promise.all([
    supabase
      .from("access_requests")
      .select(
        "id, requested_categories, requested_duration_days, reason, created_at, profiles!access_requests_doctor_id_fkey(full_name), organizations(name)"
      )
      .eq("patient_id", user.id)
      .eq("status", "requested")
      .order("created_at", { ascending: false }),
    supabase
      .from("permissions")
      .select(
        "id, granted_categories, status, granted_at, expires_at, revoked_at, chain_tx_hash, chain_tx_status, profiles!permissions_doctor_id_fkey(full_name), organizations(name)"
      )
      .eq("patient_id", user.id)
      .order("granted_at", { ascending: false }),
  ]);

  if (requestsResult.error || permissionsResult.error) {
    return (
      <ErrorPanel
        message={`Could not load access information: ${
          requestsResult.error?.message ?? permissionsResult.error?.message
        }`}
      />
    );
  }

  type Joined = { profiles?: { full_name?: string }; organizations?: { name?: string } };

  const pending: PendingRequest[] = (requestsResult.data ?? []).map((r) => {
    const j = r as unknown as Joined;
    return {
      id: r.id,
      requested_categories: r.requested_categories as RecordCategory[],
      requested_duration_days: r.requested_duration_days,
      reason: r.reason,
      created_at: r.created_at,
      doctorName: j.profiles?.full_name ?? "Unknown provider",
      organizationName: j.organizations?.name ?? null,
    };
  });

  const permissions: PermissionRow[] = (permissionsResult.data ?? []).map((p) => {
    const j = p as unknown as Joined;
    return {
      id: p.id,
      granted_categories: p.granted_categories as RecordCategory[],
      status: p.status as PermissionStatus,
      granted_at: p.granted_at,
      expires_at: p.expires_at,
      revoked_at: p.revoked_at,
      chain_tx_hash: p.chain_tx_hash,
      chain_tx_status: p.chain_tx_status,
      doctorName: j.profiles?.full_name ?? "Unknown provider",
      organizationName: j.organizations?.name ?? null,
    };
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Access</h1>
        <p className="mt-1 text-sm text-muted">
          You decide which categories of your history each provider can see, and for how long.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Pending access requests
          {pending.length > 0 && (
            <span className="ml-2 rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <EmptyPanel
            title="No pending access requests"
            body="When a provider asks to see part of your history, the request will appear here for review."
          />
        ) : (
          <div className="space-y-4">
            {pending.map((request) => (
              <AccessRequestReview key={request.id} request={request} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Permission history</h2>
        {permissions.length === 0 ? (
          <EmptyPanel
            title="No permissions granted yet"
            body="Permissions you grant — and any you later revoke — are listed here with their blockchain reference."
          />
        ) : (
          <PermissionsTable permissions={permissions} />
        )}
      </section>
    </div>
  );
}
