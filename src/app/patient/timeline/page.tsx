import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/domain";
import { StatusBadge, integrityTone } from "@/components/ui/StatusBadge";
import { SyntheticDataNotice, EmptyPanel, ErrorPanel } from "@/components/ui/Panels";
import type { RecordCategory } from "@/lib/types/database";

interface TimelineRecord {
  id: string;
  category: RecordCategory;
  title: string;
  occurred_on: string;
  details: Record<string, unknown>;
  notes: string | null;
  integrity_status: string;
  content_hash: string;
  chain_tx_hash: string | null;
  organizations: { name: string } | null;
}

export default async function TimelinePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("medical_records")
    .select("id, category, title, occurred_on, details, notes, integrity_status, content_hash, chain_tx_hash, organizations(name)")
    .eq("patient_id", user.id)
    .order("occurred_on", { ascending: false });

  if (error) {
    return (
      <ErrorPanel message={`Could not load your medical history: ${error.message}`} />
    );
  }

  const records = (data ?? []) as unknown as TimelineRecord[];

  const grouped = records.reduce<Record<string, TimelineRecord[]>>((acc, record) => {
    const date = new Date(record.occurred_on);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    (acc[key] ||= []).push(record);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort().reverse();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Medical Timeline</h1>
        <p className="mt-1 text-sm text-muted">
          Your complete history across every provider that has contributed a record.
        </p>
      </header>

      <SyntheticDataNotice />

      {records.length === 0 ? (
        <EmptyPanel
          title="No medical records found"
          body="Records appear here once a provider with an active permission adds them to your chart."
        />
      ) : (
        <div className="space-y-8">
          {sortedKeys.map((key) => {
            const [year, month] = key.split("-");
            const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("en", {
              month: "long",
            });
            return (
              <section key={key}>
                <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{monthName}</h2>
                  <span className="text-sm text-muted">{year}</span>
                </div>
                <ul className="space-y-2">
                  {grouped[key].map((record) => (
                    <li
                      key={record.id}
                      className="rounded-md border border-border bg-surface p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone="neutral">{CATEGORY_LABELS[record.category]}</StatusBadge>
                            <h3 className="text-sm font-medium">{record.title}</h3>
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {new Date(record.occurred_on).toLocaleDateString()}
                            {record.organizations?.name ? ` · ${record.organizations.name}` : ""}
                          </p>
                        </div>
                        <StatusBadge tone={integrityTone(record.integrity_status)}>
                          {record.integrity_status === "verified"
                            ? "Integrity registered"
                            : record.integrity_status === "mismatch"
                              ? "Mismatch detected"
                              : record.integrity_status === "pending"
                                ? "Registration pending"
                                : "Not registered on-chain"}
                        </StatusBadge>
                      </div>

                      {Object.keys(record.details ?? {}).length > 0 && (
                        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border pt-3 text-sm sm:grid-cols-2">
                          {Object.entries(record.details).map(([field, value]) => (
                            <div key={field} className="flex gap-2">
                              <dt className="text-muted capitalize">{field.replace(/_/g, " ")}:</dt>
                              <dd>{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {record.notes && (
                        <p className="mt-2 border-t border-border pt-2 text-sm text-muted">{record.notes}</p>
                      )}

                      <p className="mt-2 font-mono text-[11px] text-muted">
                        Hash: {record.content_hash.slice(0, 24)}…
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
