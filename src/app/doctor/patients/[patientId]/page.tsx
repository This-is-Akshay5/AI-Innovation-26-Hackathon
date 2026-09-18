import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS, isPermissionCurrentlyActive, RECORD_CATEGORIES } from "@/lib/domain";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyPanel, SyntheticDataNotice } from "@/components/ui/Panels";
import { ClinicalBrief } from "@/components/ai/ClinicalBrief";
import { RecordList } from "@/components/records/RecordList";
import type { RecordCategory, PermissionStatus } from "@/lib/types/database";

export default async function PatientChartPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc("sweep_expired_permissions");

  const { data: permission } = await supabase
    .from("permissions")
    .select("id, granted_categories, status, expires_at, profiles!permissions_patient_id_fkey(full_name)")
    .eq("doctor_id", user.id)
    .eq("patient_id", patientId)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const active =
    permission && isPermissionCurrentlyActive(permission.status as PermissionStatus, permission.expires_at);

  if (!active) {
    // The doctor's own RLS policies would already return zero records here;
    // this branch exists so the UI explains *why* rather than showing an
    // ambiguous empty chart.
    return (
      <div className="space-y-4">
        <Link href="/doctor" className="text-sm text-accent">
          ← Back to dashboard
        </Link>
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft p-6 text-sm text-danger"
        >
          <p className="font-semibold">Access revoked or expired</p>
          <p className="mt-1">
            {permission
              ? `Your permission for this patient is ${permission.status}. You can no longer read any of their records. Request access again if it is still clinically needed.`
              : "You do not have an active permission for this patient. Request access from your dashboard."}
          </p>
        </div>
      </div>
    );
  }

  const grantedCategories = permission.granted_categories as RecordCategory[];
  const withheld = RECORD_CATEGORIES.filter((c) => !grantedCategories.includes(c));
  const patientName =
    (permission as unknown as { profiles?: { full_name?: string } }).profiles?.full_name ?? "Patient";

  // This SELECT is RLS-scoped: rows outside the granted categories are not
  // returned by the database, regardless of what this query asks for.
  const { data: records } = await supabase
    .from("medical_records")
    .select("*")
    .eq("patient_id", patientId)
    .order("occurred_on", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/doctor" className="text-sm text-accent">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{patientName}</h1>
        <p className="font-mono text-xs text-muted">Patient ID: {patientId}</p>
      </div>

      <section className="rounded-md border border-accent/30 bg-accent-soft p-4">
        <h2 className="text-sm font-semibold text-accent">Your authorized scope</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grantedCategories.map((c) => (
            <StatusBadge key={c} tone="success">
              {CATEGORY_LABELS[c]}
            </StatusBadge>
          ))}
        </div>
        {withheld.length > 0 && (
          <p className="mt-3 text-xs text-accent">
            Not shared with you: {withheld.map((c) => CATEGORY_LABELS[c]).join(", ")}. These records
            are not returned by the database for your account.
          </p>
        )}
        <p className="mt-2 text-xs text-accent">
          Access ends {new Date(permission.expires_at).toLocaleString()}.
        </p>
      </section>

      <SyntheticDataNotice />

      <ClinicalBrief patientId={patientId} />

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Authorized records ({records?.length ?? 0})
        </h2>
        {!records || records.length === 0 ? (
          <EmptyPanel
            title="No records in your authorized categories"
            body="The patient may not have records in these categories yet, or they granted categories that are currently empty."
          />
        ) : (
          <RecordList records={records} />
        )}
      </section>
    </div>
  );
}
