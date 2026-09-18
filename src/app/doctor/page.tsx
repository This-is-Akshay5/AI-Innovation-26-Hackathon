import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS, isPermissionCurrentlyActive } from "@/lib/domain";
import { StatusBadge, permissionTone } from "@/components/ui/StatusBadge";
import { EmptyPanel } from "@/components/ui/Panels";
import { RequestAccessForm } from "@/components/permissions/RequestAccessForm";
import type { RecordCategory, PermissionStatus } from "@/lib/types/database";

export default async function DoctorDashboard() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc("sweep_expired_permissions");

  const [{ data: profile }, { data: permissions }, { data: pendingRequests }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("permissions")
      .select("id, patient_id, granted_categories, status, expires_at, profiles!permissions_patient_id_fkey(full_name)")
      .eq("doctor_id", user.id)
      .order("granted_at", { ascending: false }),
    supabase
      .from("access_requests")
      .select("id, patient_id, requested_categories, status, created_at, profiles!access_requests_patient_id_fkey(full_name)")
      .eq("doctor_id", user.id)
      .eq("status", "requested")
      .order("created_at", { ascending: false }),
  ]);

  type Joined = { profiles?: { full_name?: string } };

  const active = (permissions ?? []).filter((p) =>
    isPermissionCurrentlyActive(p.status as PermissionStatus, p.expires_at)
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Provider Dashboard</p>
        <h1 className="text-2xl font-semibold tracking-tight">{profile?.full_name}</h1>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-2xl font-semibold tabular-nums">{active.length}</p>
          <p className="mt-1 text-xs text-muted">Patients you can currently access</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-2xl font-semibold tabular-nums">{pendingRequests?.length ?? 0}</p>
          <p className="mt-1 text-xs text-muted">Requests awaiting patient review</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-2xl font-semibold tabular-nums">{permissions?.length ?? 0}</p>
          <p className="mt-1 text-xs text-muted">Permissions granted to you (all time)</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Request patient access</h2>
        <RequestAccessForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Authorized patients</h2>
        {active.length === 0 ? (
          <EmptyPanel
            title="No active patient access"
            body="Request access above. A patient must approve before any of their records become readable."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Authorized categories</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Access ends</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">
                      {(p as unknown as Joined).profiles?.full_name ?? "Patient"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.granted_categories as RecordCategory[]).map((c) => (
                          <span key={c} className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                            {CATEGORY_LABELS[c]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(p.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/doctor/patients/${p.patient_id}`}
                        className="rounded-sm border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent"
                      >
                        Open chart
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingRequests && pendingRequests.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Your pending requests</h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {(r as unknown as Joined).profiles?.full_name ?? "Patient"}
                  </p>
                  <p className="text-xs text-muted">
                    Requested{" "}
                    {(r.requested_categories as RecordCategory[])
                      .map((c) => CATEGORY_LABELS[c])
                      .join(", ")}{" "}
                    · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge tone={permissionTone("requested")}>Awaiting patient decision</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
