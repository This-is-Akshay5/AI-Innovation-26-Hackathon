import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/domain";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default async function PatientDashboard() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { count: recordCount }, { data: activePermissions }, { data: pendingRequests }, { data: recentAudit }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, id").eq("id", user.id).single(),
      supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("patient_id", user.id),
      supabase
        .from("permissions")
        .select("id, status, expires_at, granted_categories, doctor_id, profiles!permissions_doctor_id_fkey(full_name)")
        .eq("patient_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString()),
      supabase
        .from("access_requests")
        .select("id, requested_categories, requested_duration_days, created_at, doctor_id, profiles!access_requests_doctor_id_fkey(full_name)")
        .eq("patient_id", user.id)
        .eq("status", "requested")
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_events")
        .select("id, action, actor_role, authorization_context, created_at, result")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">Patient Overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">{profile?.full_name}</h1>
        <p className="mt-1 font-mono text-xs text-muted">Patient ID: {user.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Medical records" value={recordCount ?? 0} href="/patient/timeline" />
        <StatCard label="Active permissions" value={activePermissions?.length ?? 0} href="/patient/access" />
        <StatCard
          label="Pending requests"
          value={pendingRequests?.length ?? 0}
          href="/patient/access"
          emphasize={Boolean(pendingRequests?.length)}
        />
        <StatCard label="Audit events" value={recentAudit?.length ?? 0} href="/patient/audit" />
      </div>

      {pendingRequests && pendingRequests.length > 0 && (
        <section className="rounded-md border border-warning/30 bg-warning-soft p-4">
          <h2 className="text-sm font-semibold text-warning">Action needed: access requests waiting for review</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {pendingRequests.map((r) => (
              <li key={r.id}>
                {/* @ts-expect-error joined relation typing */}
                <span className="font-medium">{r.profiles?.full_name ?? "A provider"}</span> requested{" "}
                {r.requested_categories.map((c: string) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]).join(", ")}
              </li>
            ))}
          </ul>
          <Link href="/patient/access" className="mt-3 inline-block text-sm font-medium text-accent">
            Review requests →
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link href="/patient/audit" className="text-sm text-accent">
            View full audit trail
          </Link>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {!recentAudit || recentAudit.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentAudit.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm">
                      <span className="capitalize">{event.action.replace(/_/g, " ")}</span>
                      {event.authorization_context ? (
                        <span className="text-muted"> — {event.authorization_context}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">{new Date(event.created_at).toLocaleString()}</p>
                  </div>
                  <StatusBadge tone={event.result === "success" ? "success" : "danger"}>{event.result}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  emphasize,
}: {
  label: string;
  value: number;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border p-4 transition-colors hover:border-accent ${
        emphasize ? "border-warning/40 bg-warning-soft" : "border-border bg-surface"
      }`}
    >
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Link>
  );
}
