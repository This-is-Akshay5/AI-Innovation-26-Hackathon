"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, PERMISSION_STATUS_LABELS, isPermissionCurrentlyActive } from "@/lib/domain";
import { StatusBadge, permissionTone } from "@/components/ui/StatusBadge";
import type { PermissionRow } from "@/app/patient/access/page";

export function PermissionsTable({ permissions }: { permissions: PermissionRow[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    setRevoking(id);
    try {
      const res = await fetch(`/api/permissions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not revoke this permission.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Provider</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Scope</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Granted</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Expires</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Blockchain</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {permissions.map((p) => {
              const active = isPermissionCurrentlyActive(p.status, p.expires_at);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.doctorName}</p>
                    {p.organizationName && <p className="text-xs text-muted">{p.organizationName}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.granted_categories.map((c) => (
                        <span key={c} className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                          {CATEGORY_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(p.granted_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted">{new Date(p.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={permissionTone(active ? "active" : p.status)}>
                      {active ? "Active" : PERMISSION_STATUS_LABELS[p.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    {p.chain_tx_status === "confirmed" && p.chain_tx_hash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${p.chain_tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent underline"
                      >
                        {p.chain_tx_hash.slice(0, 10)}…
                      </a>
                    ) : (
                      <span className="text-xs text-muted">
                        {p.chain_tx_status === "failed" ? "Not confirmed" : "Not registered"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {active ? (
                      <button
                        onClick={() => revoke(p.id)}
                        disabled={revoking === p.id}
                        className="rounded-sm border border-border px-2.5 py-1 text-xs hover:border-danger hover:text-danger disabled:opacity-60"
                      >
                        {revoking === p.id ? "Revoking..." : "Revoke"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Blockchain references point to the Sepolia test network. This is a testnet demonstration, not a
        mainnet deployment.
      </p>
    </div>
  );
}
