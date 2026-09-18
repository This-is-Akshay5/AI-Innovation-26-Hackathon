"use client";

import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/domain";
import type { RecordCategory } from "@/lib/types/database";

interface SourceRecord {
  id: string;
  category: RecordCategory;
  title: string;
  occurred_on: string;
}

interface SummaryPayload {
  summary: Record<string, string>;
  sources: SourceRecord[];
  recordsConsidered: number;
  disclaimer: string;
}

const SECTIONS: { key: string; label: string }[] = [
  { key: "patient_history", label: "Patient History" },
  { key: "medications", label: "Medications" },
  { key: "allergies", label: "Allergies" },
  { key: "investigations", label: "Investigations" },
  { key: "treatments", label: "Treatments" },
  { key: "timeline", label: "Timeline" },
  { key: "recent_changes", label: "Recent Changes" },
];

export function ClinicalBrief({ patientId }: { patientId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/clinical-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error?.message ?? "Clinical summary unavailable.");
        setState("error");
        return;
      }
      setData(payload);
      setState("ready");
    } catch {
      setError("Clinical summary unavailable. Network request failed.");
      setState("error");
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Clinical History Brief</h2>
          <p className="mt-0.5 text-xs text-muted">
            Summarizes only the records you are authorized to read.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={state === "loading"}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {state === "loading"
            ? "Generating clinical brief..."
            : state === "ready"
              ? "Regenerate brief"
              : "Generate clinical history brief"}
        </button>
      </div>

      {state === "loading" && (
        <p className="px-5 py-8 text-center text-sm text-muted" aria-live="polite">
          Reading authorized records and generating the brief...
        </p>
      )}

      {state === "error" && (
        <div className="px-5 py-6" role="alert">
          <p className="text-sm font-medium text-danger">Clinical summary unavailable.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <p className="mt-1 text-sm text-muted">
            The rest of the chart is unaffected — the records below are still available.
          </p>
          <button
            onClick={generate}
            className="mt-3 rounded-sm border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      )}

      {state === "ready" && data && (
        <div className="px-5 py-4">
          <p className="mb-4 rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            {data.disclaimer}
          </p>

          <dl className="space-y-4">
            {SECTIONS.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-sm">{data.summary[key]}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sources ({data.sources.length} of {data.recordsConsidered} authorized records cited)
            </h3>
            {data.sources.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No records were cited — there was insufficient information in your authorized scope.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.sources.map((source) => (
                  <li key={source.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      {CATEGORY_LABELS[source.category]}
                    </span>
                    <span>{source.title}</span>
                    <span className="text-xs text-muted">
                      {new Date(source.occurred_on).toLocaleDateString()}
                    </span>
                    <span className="font-mono text-[11px] text-muted">{source.id.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
