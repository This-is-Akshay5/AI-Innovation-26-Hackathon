"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  actor_role: string | null;
  actorName: string;
  resource_type: string | null;
  resource_id: string | null;
  authorization_context: string | null;
  result: string;
  chain_tx_hash: string | null;
}

export function AuditTable({ events }: { events: AuditRow[] }) {
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");

  const actions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events]
  );
  const actors = useMemo(
    () => Array.from(new Set(events.map((e) => e.actorName))).sort(),
    [events]
  );

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (actionFilter !== "all" && e.action !== actionFilter) return false;
        if (actorFilter !== "all" && e.actorName !== actorFilter) return false;
        if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
        return true;
      }),
    [events, actionFilter, actorFilter, fromDate]
  );

  const filtersApplied = actionFilter !== "all" || actorFilter !== "all" || Boolean(fromDate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-3">
        <div>
          <label htmlFor="action-filter" className="block text-xs font-medium text-muted">
            Action
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="actor-filter" className="block text-xs font-medium text-muted">
            Actor
          </label>
          <select
            id="actor-filter"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="from-date" className="block text-xs font-medium text-muted">
            From date
          </label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        {filtersApplied && (
          <button
            onClick={() => {
              setActionFilter("all");
              setActorFilter("all");
              setFromDate("");
            }}
            className="rounded-sm border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Clear filters
          </button>
        )}

        <p className="ml-auto text-xs text-muted" aria-live="polite">
          {filtered.length} of {events.length} events
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center">
          <p className="text-sm font-medium">
            {events.length === 0 ? "No audit events recorded yet" : "No events match these filters"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {events.length === 0
              ? "Every access, grant, revocation, and record change will be logged here as it happens."
              : "Try widening the date range or clearing a filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Timestamp</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Actor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Action</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Authorization</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Blockchain</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{e.actorName}</td>
                  <td className="px-4 py-3 capitalize text-muted">
                    {e.actor_role?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{e.action.replace(/_/g, " ")}</td>
                  <td className="max-w-xs px-4 py-3 text-muted">
                    {e.authorization_context ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.chain_tx_hash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${e.chain_tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent underline"
                      >
                        {e.chain_tx_hash.slice(0, 10)}…
                      </a>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={e.result === "success" ? "success" : e.result === "denied" ? "warning" : "danger"}>
                      {e.result}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
