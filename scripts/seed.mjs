/**
 * Seeds SYNTHETIC demonstration data.
 *
 * Creates two auth users (one patient, one doctor), an organization, and a
 * small set of clearly-labelled synthetic medical records for the patient.
 *
 * The records are inserted with the service-role client because at seed
 * time no permission exists yet — this is a setup fixture, not an
 * application code path. The application itself always goes through RLS.
 *
 * Usage:
 *   node scripts/seed.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { readFileSync } from "fs";

// Minimal .env.local loader so the script has no extra dependency.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2];
  }
} catch {
  // No .env.local — rely on the ambient environment.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PATIENT = { email: "patient@demo.local", password: "demo-patient-2026", name: "Asha Raman (SYNTHETIC)" };
const DOCTOR = { email: "doctor@demo.local", password: "demo-doctor-2026", name: "Dr. Arun Kumar (SYNTHETIC)" };

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = canonicalize(value[k]);
      return acc;
    }, {});
  }
  return value;
}

function hashRecord(r) {
  const canonical = JSON.stringify(
    canonicalize({
      patient_id: r.patient_id,
      category: r.category,
      title: r.title,
      occurred_on: r.occurred_on,
      details: r.details ?? {},
      notes: r.notes ?? null,
    })
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

async function ensureUser({ email, password, name }, role) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = created?.user?.id;

  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: list } = await supabase.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
    if (!userId) throw new Error(`Could not resolve existing user ${email}`);
    console.log(`  ${email} already exists — reusing.`);
  } else {
    console.log(`  Created ${email}`);
  }

  await supabase.from("profiles").upsert({ id: userId, role, full_name: name });
  return userId;
}

async function main() {
  console.log("Seeding synthetic demo data...\n");

  const patientId = await ensureUser(PATIENT, "patient");
  const doctorId = await ensureUser(DOCTOR, "doctor");

  let { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", "Demo General Hospital (SYNTHETIC)")
    .maybeSingle();

  if (!org) {
    const { data: created } = await supabase
      .from("organizations")
      .insert({ name: "Demo General Hospital (SYNTHETIC)" })
      .select("id")
      .single();
    org = created;
  }

  await supabase
    .from("provider_memberships")
    .upsert({ profile_id: doctorId, organization_id: org.id, title: "General Medicine" },
            { onConflict: "profile_id,organization_id" });

  const records = [
    {
      category: "allergy",
      title: "Penicillin allergy",
      occurred_on: "2023-03-14",
      details: { allergen: "Penicillin", reaction: "Urticaria", severity: "Moderate" },
      notes: "Documented after a reaction during a course of amoxicillin.",
    },
    {
      category: "diagnosis",
      title: "Type 2 diabetes mellitus",
      occurred_on: "2024-01-22",
      details: { icd10: "E11.9", status: "Active" },
      notes: null,
    },
    {
      category: "medication",
      title: "Metformin",
      occurred_on: "2024-01-22",
      details: { dose: "500 mg", frequency: "Twice daily", route: "Oral" },
      notes: "Started alongside lifestyle advice.",
    },
    {
      category: "lab_result",
      title: "HbA1c",
      occurred_on: "2025-09-02",
      details: { value: "7.1", unit: "%", reference_range: "4.0-5.6" },
      notes: null,
    },
    {
      category: "treatment",
      title: "Structured diabetes education programme",
      occurred_on: "2024-02-10",
      details: { sessions_completed: "4", setting: "Outpatient" },
      notes: null,
    },
    {
      category: "clinical_note",
      title: "Routine review",
      occurred_on: "2026-02-18",
      details: { bp: "128/82 mmHg", weight: "74 kg" },
      notes: "Patient reports good adherence. No hypoglycaemic episodes.",
    },
  ];

  // Remove any previous seed rows so re-running doesn't duplicate the chart.
  await supabase.from("medical_records").delete().eq("patient_id", patientId).eq("author_id", doctorId);

  for (const r of records) {
    const row = {
      patient_id: patientId,
      author_id: doctorId,
      organization_id: org.id,
      ...r,
    };
    await supabase.from("medical_records").insert({
      ...row,
      content_hash: hashRecord(row),
      integrity_status: "not_registered",
    });
  }

  console.log(`\n  Inserted ${records.length} synthetic records.\n`);
  console.log("Demo accounts:");
  console.log(`  Patient: ${PATIENT.email} / ${PATIENT.password}`);
  console.log(`  Doctor:  ${DOCTOR.email} / ${DOCTOR.password}`);
  console.log(`\n  Patient ID (for the doctor's access request form):\n  ${patientId}\n`);
  console.log("All seeded data is synthetic. No real patient information.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
