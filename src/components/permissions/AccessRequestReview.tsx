"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS } from "@/lib/domain";
import type { PendingRequest } from "@/app/patient/access/page";
import type { RecordCategory } from "@/lib/types/database";

export function AccessRequestReview({ request }: { request: PendingRequest }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<RecordCategory>>(
    new Set(request.requested_categories)
  );
  const [durationDays, setDurationDays] = useState(request.requested_duration_days);
  const [busy, setBusy] = useState<"grant" | "deny" | null>(null);
  // Anchor "now" once per mount so the projected end date is stable across
  // re-renders rather than recomputed on every keystroke.
  const [mountedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(category: RecordCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const projectedEnd = useMemo(
    () => new Date(mountedAt + durationDays * 86400000).toLocaleDateString(),
    [mountedAt, durationDays]
  );

  async function grant() {
    if (selected.size === 0) {
      setError("Select at least one category to grant, or deny the request.");
      return;
    }
    setError(null);
    setBusy("grant");
    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessRequestId: request.id,
          grantedCategories: Array.from(selected),
          durationDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not grant access.");
        return;
      }
      setNotice(data.blockchain?.note ?? null);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function deny() {
    setError(null);
    setBusy("deny");
    try {
      const res = await fetch("/api/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessRequestId: request.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not deny the request.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-muted">Access request</p>
        <h3 className="mt-1 text-base font-semibold">{request.doctorName}</h3>
        {request.organizationName && (
          <p className="text-sm text-muted">{request.organizationName}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          Requested {new Date(request.created_at).toLocaleString()}
        </p>
        {request.reason && (
          <p className="mt-3 border-l-2 border-border pl-3 text-sm">
            <span className="text-muted">Reason given: </span>
            {request.reason}
          </p>
        )}
      </div>

      <div className="px-5 py-4">
        <fieldset>
          <legend className="text-sm font-medium">
            Choose what this provider may see
          </legend>
          <p className="mt-1 text-sm text-muted">
            Only the categories you tick will be readable. Everything else stays hidden.
          </p>
          <div className="mt-3 space-y-2">
            {request.requested_categories.map((category) => (
              <label key={category} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(category)}
                  onChange={() => toggle(category)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>{CATEGORY_LABELS[category]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor={`duration-${request.id}`} className="block text-sm font-medium">
            Access duration
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id={`duration-${request.id}`}
              type="number"
              min={1}
              max={request.requested_duration_days}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-24 rounded-sm border border-border bg-background px-3 py-1.5 text-sm"
            />
            <span className="text-sm text-muted">
              days (provider requested {request.requested_duration_days})
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Access ends automatically on{" "}
            {projectedEnd}. You can revoke it
            sooner at any time.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
            {notice}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={grant}
            disabled={busy !== null}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy === "grant" ? "Submitting permission..." : `Grant access to ${selected.size} categor${selected.size === 1 ? "y" : "ies"}`}
          </button>
          <button
            onClick={deny}
            disabled={busy !== null}
            className="rounded-sm border border-border px-4 py-2 text-sm hover:border-danger hover:text-danger disabled:opacity-60"
          >
            {busy === "deny" ? "Denying..." : "Deny"}
          </button>
        </div>
      </div>
    </article>
  );
}
