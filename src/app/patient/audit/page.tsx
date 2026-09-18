import { createServerSupabase } from "@/lib/supabase/server";
import { ErrorPanel } from "@/components/ui/Panels";
import { AuditTable, type AuditRow } from "@/components/audit/AuditTable";

export default async function PatientAuditPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("audit_events")
    .select(
      "id, created_at, action, actor_role, resource_type, resource_id, authorization_context, result, chain_tx_hash, profiles!audit_events_actor_id_fkey(full_name)"
    )
    .eq("patient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return <ErrorPanel message={`Could not load the audit trail: ${error.message}`} />;

  const events: AuditRow[] = (data ?? []).map((e) => {
    const joined = e as unknown as { profiles?: { full_name?: string } };
    return {
      id: e.id,
      created_at: e.created_at,
      action: e.action,
      actor_role: e.actor_role,
      actorName: joined.profiles?.full_name ?? "System",
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      authorization_context: e.authorization_context,
      result: e.result,
      chain_tx_hash: e.chain_tx_hash,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="mt-1 text-sm text-muted">
          Every access to your records, and every change to who can see them.
        </p>
      </header>
      <AuditTable events={events} />
    </div>
  );
}
