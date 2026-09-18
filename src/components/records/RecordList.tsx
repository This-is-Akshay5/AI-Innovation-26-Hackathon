"use client";

import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/domain";
import { StatusBadge, integrityTone } from "@/components/ui/StatusBadge";
import type { MedicalRecordRow } from "@/lib/domain";

interface VerifyResult {
  status: string;
  recomputedHash: string;
  onChainHash: string | null;
  txHash?: string | null;
  message: string;
}

export function RecordList({ records }: { records: MedicalRecordRow[] }) {
  return (
    <ul className="space-y-2">
      {records.map((record) => (
        <RecordItem key={record.id} record={record} />
      ))}
    </ul>
  );
}

function RecordItem({ record }: { record: MedicalRecordRow }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function verify() {
    setVerifying(true);
    try {
      const res = await fetch("/api/integrity/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id }),
      });
      const data = await res.json();
      setResult(
        res.ok
          ? data
          : { status: "unavailable", recomputedHash: "", onChainHash: null, message: data.error?.message ?? "Verification unavailable." }
      );
    } catch {
      setResult({
        status: "unavailable",
        recomputedHash: "",
        onChainHash: null,
        message: "Verification unavailable. Network request failed.",
      });
    } finally {
      setVerifying(false);
    }
  }

  const statusLabel =
    result?.status === "verified"
      ? "Verified"
      : result?.status === "mismatch"
        ? "Mismatch detected"
        : result?.status === "not_registered"
          ? "Not yet registered"
          : result
            ? "Verification unavailable"
            : record.integrity_status === "verified"
              ? "Registered on-chain"
              : "Not registered on-chain";

  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{CATEGORY_LABELS[record.category]}</StatusBadge>
            <h3 className="text-sm font-medium">{record.title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted">
            {new Date(record.occurred_on).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={integrityTone(result?.status ?? record.integrity_status)}>
            {statusLabel}
          </StatusBadge>
          <button
            onClick={verify}
            disabled={verifying}
            className="rounded-sm border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {verifying ? "Verifying..." : "Verify integrity"}
          </button>
        </div>
      </div>

      {Object.keys(record.details ?? {}).length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border pt-3 text-sm sm:grid-cols-2">
          {Object.entries(record.details).map(([field, value]) => (
            <div key={field} className="flex gap-2">
              <dt className="capitalize text-muted">{field.replace(/_/g, " ")}:</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {record.notes && (
        <p className="mt-2 border-t border-border pt-2 text-sm text-muted">{record.notes}</p>
      )}

      {result && (
        <div
          className={`mt-3 rounded-sm border px-3 py-2 text-xs ${
            result.status === "verified"
              ? "border-success/30 bg-success-soft text-success"
              : result.status === "mismatch"
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-border bg-background text-muted"
          }`}
        >
          <p>{result.message}</p>
          {result.recomputedHash && (
            <p className="mt-1 font-mono">Recomputed: {result.recomputedHash.slice(0, 32)}…</p>
          )}
          {result.onChainHash && (
            <p className="font-mono">On-chain: {result.onChainHash.slice(0, 32)}…</p>
          )}
          {result.txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline"
            >
              View transaction on Sepolia
            </a>
          )}
        </div>
      )}
    </li>
  );
}
