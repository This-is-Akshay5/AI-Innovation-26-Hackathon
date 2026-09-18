-- ============================================================================
-- MEDICAL MEMORY — CORE SCHEMA
-- ============================================================================
-- Design principle: this database is the ONLY place raw medical information
-- lives. The blockchain (see /contracts) never sees patient data — only
-- pseudonymous identifiers, permission scopes/expiry, record hashes, and
-- audit event references. See README.md "Architecture" for the full
-- rationale.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ROLES & PROFILES
-- ----------------------------------------------------------------------------
-- auth.users (Supabase Auth) is the source of truth for login identity.
-- profiles extends it with the application role. One profile per auth user.

create type user_role as enum ('patient', 'doctor', 'provider_admin');
create type record_category as enum ('diagnosis', 'medication', 'allergy', 'lab_result', 'treatment', 'clinical_note');
create type permission_status as enum ('requested', 'approved', 'active', 'denied', 'expired', 'revoked');
create type integrity_status as enum ('not_registered', 'pending', 'verified', 'mismatch', 'unavailable');
create type blockchain_tx_status as enum ('pending', 'confirmed', 'failed', 'unavailable');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  -- Pseudonymous identifier exposed on-chain instead of raw user id/email.
  -- Deterministic per-user but not derivable back to PII without this table.
  chain_ref text not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_chain_ref_idx on profiles(chain_ref);

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS & PROVIDER MEMBERSHIP
-- ----------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain_ref text not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

-- Doctors/provider_admins belong to an organization.
create table provider_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  title text, -- e.g. "Cardiologist"
  created_at timestamptz not null default now(),
  unique(profile_id, organization_id)
);

-- ----------------------------------------------------------------------------
-- MEDICAL RECORDS (off-chain, private)
-- ----------------------------------------------------------------------------

create table medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  author_id uuid not null references profiles(id), -- doctor who created/updated it
  organization_id uuid references organizations(id),
  category record_category not null,
  title text not null,
  occurred_on date not null,
  -- Structured, category-specific payload (dose/frequency for medications,
  -- allergen/severity for allergies, panel/value/unit for lab results, etc).
  details jsonb not null default '{}'::jsonb,
  notes text,
  -- Integrity
  content_hash text not null, -- sha256 of canonical serialization, computed server-side
  integrity_status integrity_status not null default 'not_registered',
  chain_tx_hash text,
  chain_tx_status blockchain_tx_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medical_records_patient_idx on medical_records(patient_id);
create index medical_records_category_idx on medical_records(patient_id, category);

-- ----------------------------------------------------------------------------
-- ACCESS REQUESTS & PERMISSIONS (the selective-access hero feature)
-- ----------------------------------------------------------------------------
-- Lifecycle: requested -> approved -> active -> expired|revoked
-- (denied is a terminal state from "requested")

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id),
  requested_categories record_category[] not null,
  requested_duration_days int not null check (requested_duration_days > 0 and requested_duration_days <= 365),
  reason text,
  status permission_status not null default 'requested',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index access_requests_patient_idx on access_requests(patient_id, status);
create index access_requests_doctor_idx on access_requests(doctor_id, status);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid references access_requests(id) on delete set null,
  patient_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id),
  -- Approved subset of what was requested — this is what selective access enforces.
  granted_categories record_category[] not null,
  status permission_status not null default 'active',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  chain_tx_hash text,
  chain_tx_status blockchain_tx_status,
  created_at timestamptz not null default now()
);

create index permissions_patient_idx on permissions(patient_id, status);
create index permissions_doctor_idx on permissions(doctor_id, status);
create index permissions_active_lookup_idx on permissions(patient_id, doctor_id, status, expires_at);

-- ----------------------------------------------------------------------------
-- AUDIT TRAIL
-- ----------------------------------------------------------------------------

create type audit_action as enum (
  'login',
  'record_created', 'record_updated', 'record_viewed',
  'access_requested', 'access_granted', 'access_denied', 'access_revoked', 'access_expired',
  'integrity_verified', 'integrity_mismatch_detected',
  'ai_summary_generated', 'ai_summary_failed'
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_role user_role,
  action audit_action not null,
  patient_id uuid references profiles(id) on delete set null,
  resource_type text, -- 'medical_record' | 'permission' | 'access_request'
  resource_id uuid,
  organization_id uuid references organizations(id),
  authorization_context text, -- human-readable: "Authorized via permission <id>, scope: medications"
  result text not null default 'success', -- 'success' | 'denied' | 'error'
  chain_tx_hash text,
  chain_tx_status blockchain_tx_status,
  created_at timestamptz not null default now()
);

create index audit_events_patient_idx on audit_events(patient_id, created_at desc);
create index audit_events_actor_idx on audit_events(actor_id, created_at desc);

-- ----------------------------------------------------------------------------
-- BLOCKCHAIN EVENT LOG
-- ----------------------------------------------------------------------------
-- Local mirror of on-chain events for fast reads. Written by the server after
-- a transaction confirms (see lib/blockchain/*). This table is NEVER the
-- source of truth for authorization — permissions.status is — it is evidence.

create table blockchain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null, -- 'AccessGranted' | 'AccessRevoked' | 'RecordHashRegistered' | 'AuditRecorded'
  tx_hash text not null,
  block_number bigint,
  network text not null default 'sepolia',
  related_permission_id uuid references permissions(id) on delete set null,
  related_record_id uuid references medical_records(id) on delete set null,
  payload jsonb not null default '{}'::jsonb, -- decoded event args (pseudonymous refs/hashes only)
  created_at timestamptz not null default now()
);

create index blockchain_events_permission_idx on blockchain_events(related_permission_id);
create index blockchain_events_record_idx on blockchain_events(related_record_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table provider_memberships enable row level security;
alter table medical_records enable row level security;
alter table access_requests enable row level security;
alter table permissions enable row level security;
alter table audit_events enable row level security;
alter table blockchain_events enable row level security;

-- Helper: is there an ACTIVE, non-expired permission granting this doctor
-- access to this category of this patient's records?
create or replace function has_active_permission(p_patient_id uuid, p_doctor_id uuid, p_category record_category)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from permissions
    where patient_id = p_patient_id
      and doctor_id = p_doctor_id
      and status = 'active'
      and expires_at > now()
      and p_category = any(granted_categories)
  );
$$;

-- profiles: users can read their own profile, and any profile of someone
-- they have an active permission or pending request relationship with
-- (so doctors can see patient names on the dashboard, patients can see
-- doctor names on their access-request review screen).
create policy profiles_self_select on profiles for select
  using (id = auth.uid());

create policy profiles_related_select on profiles for select
  using (
    exists (
      select 1 from permissions
      where (patient_id = auth.uid() and doctor_id = profiles.id)
         or (doctor_id = auth.uid() and patient_id = profiles.id)
    )
    or exists (
      select 1 from access_requests
      where (patient_id = auth.uid() and doctor_id = profiles.id)
         or (doctor_id = auth.uid() and patient_id = profiles.id)
    )
  );

create policy profiles_self_update on profiles for update
  using (id = auth.uid());

create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

-- organizations: readable by any authenticated user (org names are not sensitive)
create policy organizations_select on organizations for select
  using (auth.role() = 'authenticated');

-- provider_memberships: self + patients who share a permission/request with this provider
create policy provider_memberships_select on provider_memberships for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from permissions p
      where p.doctor_id = provider_memberships.profile_id and p.patient_id = auth.uid()
    )
  );

-- medical_records:
--  - patient can always read their own records
--  - author (doctor) can always read/update what they authored
--  - any doctor with an active permission covering the record's category can read it
create policy medical_records_patient_select on medical_records for select
  using (patient_id = auth.uid());

create policy medical_records_author_select on medical_records for select
  using (author_id = auth.uid());

create policy medical_records_authorized_doctor_select on medical_records for select
  using (has_active_permission(patient_id, auth.uid(), category));

create policy medical_records_doctor_insert on medical_records for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and role = 'doctor')
    and has_active_permission(patient_id, auth.uid(), category)
  );

create policy medical_records_author_update on medical_records for update
  using (author_id = auth.uid() and has_active_permission(patient_id, auth.uid(), category));

-- access_requests: visible to the patient and the requesting doctor only
create policy access_requests_patient_select on access_requests for select
  using (patient_id = auth.uid());
create policy access_requests_doctor_select on access_requests for select
  using (doctor_id = auth.uid());

create policy access_requests_doctor_insert on access_requests for insert
  with check (doctor_id = auth.uid());

-- only the patient can resolve (approve/deny) their own request
create policy access_requests_patient_update on access_requests for update
  using (patient_id = auth.uid());

-- permissions: visible to patient and doctor involved
create policy permissions_patient_select on permissions for select
  using (patient_id = auth.uid());
create policy permissions_doctor_select on permissions for select
  using (doctor_id = auth.uid());

-- only the patient can grant (insert) — enforced at API layer via service role
-- for the on-chain write step, but RLS still requires patient_id = auth.uid()
-- for any direct client insert.
create policy permissions_patient_insert on permissions for insert
  with check (patient_id = auth.uid());

-- revoke/expire updates: only the owning patient
create policy permissions_patient_update on permissions for update
  using (patient_id = auth.uid());

-- audit_events: visible to the patient the event concerns, and the actor
create policy audit_events_patient_select on audit_events for select
  using (patient_id = auth.uid());
create policy audit_events_actor_select on audit_events for select
  using (actor_id = auth.uid());

-- audit_events are written exclusively by the server (service role bypasses
-- RLS) so that clients cannot forge audit history. No insert policy for
-- authenticated clients.

-- blockchain_events: readable if you can read the related permission/record
create policy blockchain_events_via_permission on blockchain_events for select
  using (
    exists (
      select 1 from permissions p
      where p.id = blockchain_events.related_permission_id
        and (p.patient_id = auth.uid() or p.doctor_id = auth.uid())
    )
    or exists (
      select 1 from medical_records r
      where r.id = blockchain_events.related_record_id
        and (r.patient_id = auth.uid() or r.author_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger medical_records_updated_at before update on medical_records
  for each row execute function set_updated_at();
