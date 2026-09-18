import type { MedicalRecordRow } from "@/lib/domain";

export interface ClinicalSummaryResult {
  ok: true;
  summary: {
    patient_history: string;
    medications: string;
    allergies: string;
    investigations: string;
    treatments: string;
    timeline: string;
    recent_changes: string;
  };
  sourceRecordIds: string[];
}

export interface ClinicalSummaryFailure {
  ok: false;
  reason: string;
}

const SYSTEM_PROMPT = `You are a clinical record summarization assistant embedded in a hospital record system.

You will be given a JSON array of medical records that a specific doctor has been explicitly authorized to view for one patient. Each record has an "id" field.

Your job: produce a structured clinical history brief using ONLY the information in the provided records.

Hard rules — violating any of these makes your output unusable:
1. Do not state any diagnosis, medication, allergy, lab result, or treatment that is not explicitly present in the provided records.
2. Do not infer, speculate, or extrapolate clinical facts not stated in the data.
3. Do not recommend treatment, suggest a diagnosis, or give clinical advice of any kind. You summarize; you do not practice medicine.
4. Every substantive sentence must be traceable to specific record id(s). You will provide these as a "sources" array on each section listing the record ids used.
5. If a section has no relevant records, write exactly: "Insufficient information in the authorized records." for that section, and leave its sources array empty.
6. Output ONLY valid JSON matching this exact shape, no markdown fences, no preamble:
{
  "patient_history": string,
  "patient_history_sources": string[],
  "medications": string,
  "medications_sources": string[],
  "allergies": string,
  "allergies_sources": string[],
  "investigations": string,
  "investigations_sources": string[],
  "treatments": string,
  "treatments_sources": string[],
  "timeline": string,
  "timeline_sources": string[],
  "recent_changes": string,
  "recent_changes_sources": string[]
}`;

function buildUserPrompt(records: MedicalRecordRow[]): string {
  const minimal = records.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    occurred_on: r.occurred_on,
    details: r.details,
    notes: r.notes,
  }));
  return `Authorized records (JSON):\n${JSON.stringify(minimal, null, 2)}\n\nProduce the clinical history brief now, following the system rules exactly.`;
}

interface RawModelOutput {
  patient_history: string;
  patient_history_sources: string[];
  medications: string;
  medications_sources: string[];
  allergies: string;
  allergies_sources: string[];
  investigations: string;
  investigations_sources: string[];
  treatments: string;
  treatments_sources: string[];
  timeline: string;
  timeline_sources: string[];
  recent_changes: string;
  recent_changes_sources: string[];
}

function isRawModelOutput(v: unknown): v is RawModelOutput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const strKeys = ["patient_history", "medications", "allergies", "investigations", "treatments", "timeline", "recent_changes"];
  const arrKeys = strKeys.map((k) => `${k}_sources`);
  return (
    strKeys.every((k) => typeof o[k] === "string") &&
    arrKeys.every((k) => Array.isArray(o[k]))
  );
}

/**
 * Validates that every record id the model claims as a source actually
 * exists in the set of records we sent it. This is the guard against the
 * model citing a plausible-looking but fabricated source id.
 */
function sourcesAreValid(sources: string[], validIds: Set<string>): boolean {
  return sources.every((id) => validIds.has(id));
}

export async function generateClinicalSummary(
  records: MedicalRecordRow[]
): Promise<ClinicalSummaryResult | ClinicalSummaryFailure> {
  if (records.length === 0) {
    return {
      ok: true,
      summary: {
        patient_history: "Insufficient information in the authorized records.",
        medications: "Insufficient information in the authorized records.",
        allergies: "Insufficient information in the authorized records.",
        investigations: "Insufficient information in the authorized records.",
        treatments: "Insufficient information in the authorized records.",
        timeline: "Insufficient information in the authorized records.",
        recent_changes: "Insufficient information in the authorized records.",
      },
      sourceRecordIds: [],
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "AI is not configured (missing ANTHROPIC_API_KEY)." };
  }

  const validIds = new Set(records.map((r) => r.id));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(records) }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `AI request failed (HTTP ${response.status}).` };
    }

    const data = await response.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    if (!textBlock?.text) {
      return { ok: false, reason: "AI returned an empty response." };
    }

    let parsed: unknown;
    try {
      const cleaned = textBlock.text.replace(/^```json\s*|```\s*$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: "AI response was not valid JSON." };
    }

    if (!isRawModelOutput(parsed)) {
      return { ok: false, reason: "AI response did not match the expected structure." };
    }

    const sections: (keyof RawModelOutput)[] = [
      "patient_history",
      "medications",
      "allergies",
      "investigations",
      "treatments",
      "timeline",
      "recent_changes",
    ];

    const allSourceIds = new Set<string>();
    for (const key of sections) {
      const sourceKey = `${key}_sources` as keyof RawModelOutput;
      const sources = parsed[sourceKey] as unknown as string[];
      if (!sourcesAreValid(sources, validIds)) {
        return { ok: false, reason: `AI cited a source not present in the authorized records (section: ${key}).` };
      }
      sources.forEach((id) => allSourceIds.add(id));
    }

    return {
      ok: true,
      summary: {
        patient_history: parsed.patient_history,
        medications: parsed.medications,
        allergies: parsed.allergies,
        investigations: parsed.investigations,
        treatments: parsed.treatments,
        timeline: parsed.timeline,
        recent_changes: parsed.recent_changes,
      },
      sourceRecordIds: Array.from(allSourceIds),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "AI request timed out." };
    }
    return { ok: false, reason: err instanceof Error ? err.message : "Unknown AI error." };
  } finally {
    clearTimeout(timeout);
  }
}
