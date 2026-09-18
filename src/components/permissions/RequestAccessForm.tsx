"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RECORD_CATEGORIES, CATEGORY_LABELS } from "@/lib/domain";
import type { RecordCategory } from "@/lib/types/database";

export function RequestAccessForm() {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [categories, setCategories] = useState<Set<RecordCategory>>(new Set());
  const [durationDays, setDurationDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function toggle(category: RecordCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!patientId.trim()) {
      setError("Enter the patient's ID.");
      return;
    }
    if (categories.size === 0) {
      setError("Select at least one record category to request.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientId.trim(),
          categories: Array.from(categories),
          durationDays,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not submit the access request.");
        return;
      }
      setSuccess("Access request sent. The patient decides which categories to approve.");
      setPatientId("");
      setCategories(new Set());
      setReason("");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="patientId" className="mb-1 block text-sm font-medium">
            Patient ID
          </label>
          <input
            id="patientId"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="UUID from the patient's dashboard"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label htmlFor="duration" className="mb-1 block text-sm font-medium">
            Requested duration (days)
          </label>
          <input
            id="duration"
            type="number"
            min={1}
            max={365}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Record categories requested</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RECORD_CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={categories.has(category)}
                onChange={() => toggle(category)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Reason (shown to the patient)
        </label>
        <input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Pre-operative assessment"
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? "Requesting access..." : "Request access"}
      </button>
    </form>
  );
}
