# Medical Memory

A patient-controlled medical record system. Providers see a unified history across
organizations, but only the parts the patient has explicitly shared — and every access is
logged.

**This is a hackathon prototype running on synthetic data and a public testnet. It is not
production clinical software.** See [Limitations](#limitations).

---

## Problem

Patient records are scattered across hospitals. When a doctor needs a patient's allergy
list or prior diagnoses, that information often sits in a system they cannot reach. The
usual fixes trade one problem for another: a central repository asks every patient to
trust one operator with everything, and ad-hoc record sharing leaves no reliable trace of
who saw what.

## Solution

Two ideas, kept separate on purpose:

1. **The patient controls the scope.** A provider requests specific categories
   (medications, allergies, diagnoses…) for a specific duration. The patient approves a
   *subset* — granting medications and allergies while withholding everything else is a
   first-class action, not a workaround.
2. **The evidence is independently verifiable.** Permission grants, revocations, and
   record integrity hashes are written to a public smart contract. Anyone can check that a
   grant happened and that a record has not been altered since it was registered — without
   the chain ever holding medical content.

## Core workflow

```
Doctor requests access  ──►  Patient approves a subset  ──►  Permission row + on-chain grant
                                                                          │
Doctor reads chart  ◄── RLS returns only in-scope rows ◄───────────────────┘
        │
        ├──►  AI brief (summarizes only the rows RLS returned, with source citations)
        └──►  Integrity check (recompute hash, compare to on-chain value)

Patient revokes  ──►  status = 'revoked'  ──►  doctor's next query returns nothing
```

## Architecture

The central decision is what goes where.

### Off-chain (PostgreSQL via Supabase)

All medical content: diagnoses, medications, allergies, lab results, treatments, clinical
notes, and the patient/provider identities behind them. This is also where authorization
is *enforced* in real time, because a database row check is immediate and revocable.

### On-chain (Solidity on Sepolia)

Only values that are safe to publish and useless on their own:

| On-chain value | What it is | Why it's safe |
|---|---|---|
| `patientRef` / `doctorRef` | `sha256(server_salt + uuid)` | Opaque without the server-only salt |
| `scopeHash` | `keccak256` of the sorted category list | Reveals *that* categories were granted, not their content |
| `recordHash` | `sha256` of a canonical record serialization | One-way; cannot be reversed into a record |
| `expiresAt` | A timestamp | Not sensitive |

**No diagnosis, medication name, lab value, clinical note, or real identifier is ever sent
to the chain.** `contracts/MedicalMemoryRegistry.sol` documents this per-field.

### Why blockchain at all?

Honest answer: authorization does not need it — RLS does that job better, because
revocation must take effect instantly and a chain write cannot be retracted. What the
chain adds is an *append-only record the application operator cannot quietly rewrite*. If
the hospital's DBA edits an allergy row and its stored hash to match, the on-chain hash
still disagrees, and the mismatch is detectable by anyone. That is the specific property
being bought, and it is the only thing the chain is used for here.

## Technology stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Database / auth | Supabase (PostgreSQL, Supabase Auth, Row Level Security) |
| Blockchain | Solidity 0.8.24, Sepolia testnet, ethers.js v6 |
| AI | Anthropic API (single model, one purpose) |
| Validation | Zod (server-side, on every endpoint) |
| Tests | Node.js built-in test runner |

No Redis, no message queue, no vector database, no second AI model. The contract is
compiled with `solc` directly (`npm run contracts:compile`) — Hardhat was removed once it
turned out to add a toolchain without adding capability.

## Data model

```
profiles ──┬── medical_records ── blockchain_events
           ├── access_requests ── permissions ── blockchain_events
           └── audit_events
organizations ── provider_memberships ── profiles
```

Full DDL: `supabase/migrations/0001_init.sql`. Every externally-visible identifier is a
UUID. Enums (`record_category`, `permission_status`, `integrity_status`,
`blockchain_tx_status`, `audit_action`) are enforced at the database level, not just in
TypeScript.

## Access control model

Authorization lives in one SQL function, which every relevant policy calls:

```sql
create function has_active_permission(p_patient_id uuid, p_doctor_id uuid, p_category record_category)
returns boolean as $$
  select exists (
    select 1 from permissions
    where patient_id = p_patient_id
      and doctor_id  = p_doctor_id
      and status     = 'active'
      and expires_at > now()
      and p_category = any(granted_categories)
  );
$$;
```

Consequences worth stating plainly:

- **A doctor cannot read another patient's records.** `SELECT * FROM medical_records` as a
  doctor returns only rows covered by an active permission. There is no application-level
  filter to forget.
- **Revocation is immediate.** Setting `status = 'revoked'` makes the function return
  false on the doctor's very next query. Nothing is merely hidden in the UI.
- **Expiry needs no sweeper.** `expires_at > now()` is evaluated per query.
  `sweep_expired_permissions()` exists only so the UI can display "Expired" instead of a
  stale "Active"; access was already gone.
- **Scope cannot be widened by the client.** The grant endpoint validates server-side that
  every granted category was in the original request.
- **Audit history cannot be forged.** `audit_events` has no INSERT policy for
  authenticated users; only the server's service-role client writes it.

## Blockchain architecture

`MedicalMemoryRegistry.sol` — four write functions, four events, no PII:

```solidity
function grantAccess(bytes32 permissionId, bytes32 patientRef, bytes32 doctorRef, bytes32 scopeHash, uint256 expiresAt)
function revokeAccess(bytes32 permissionId)
function registerRecordHash(bytes32 recordId, bytes32 patientRef, bytes32 contentHash)
function recordAuditEvent(bytes32 auditId, bytes32 actorRef, bytes32 actionCode, bytes32 resourceRef)

event AccessGranted(...); event AccessRevoked(...);
event RecordHashRegistered(...); event AuditRecorded(...);
```

### Integrity verification

1. Read the record as it exists in the database *now*.
2. Recompute `sha256` over its canonical serialization (sorted keys, so field order can't
   change the digest).
3. Read the hash registered on-chain for that record id.
4. Compare.

UI states are distinct and honest: `VERIFIED`, `MISMATCH DETECTED`, `NOT YET REGISTERED`,
`VERIFICATION UNAVAILABLE`. The interface never says "tamper-proof" — it says what was
actually checked.

### Failure handling

Blockchain writes are tracked as `pending` / `confirmed` / `failed` / `unavailable`. A
failed transaction never renders as confirmed. If the chain is unreachable the permission
still takes effect in the database (the patient's decision is not held hostage to an RPC
endpoint) and the UI states that it is not blockchain-confirmed. **With no blockchain env
vars set at all, the whole application runs; blockchain columns simply read
"unavailable".**

## AI workflow

One feature: **Clinical History Brief**. A doctor presses a button and gets a structured
summary of the patient's history — restricted to their authorized scope.

```
RLS-scoped SELECT (as the calling doctor)
  └─► records the doctor is allowed to read
        └─► structured JSON context ─► LLM ─► JSON response
              └─► validate: every cited record id ∈ the set we sent
                    └─► UI, with each source rendered as a real record
```

Anti-hallucination measures, in order of how much they actually matter:

1. **The context is the authorization boundary.** Withheld records are never fetched, so
   they cannot be summarized regardless of what the model is asked.
2. **Citation validation.** Every `source` id the model returns is checked against the ids
   we supplied. A fabricated or out-of-scope id rejects the whole response — the API
   returns an error rather than a plausible-looking summary.
3. **Structured output contract.** Non-JSON, malformed, or shape-mismatched responses are
   rejected, not coerced.
4. **Explicit instruction limits.** The model summarizes only; it does not diagnose,
   prescribe, or recommend treatment. Sections with no supporting records must return
   "Insufficient information in the authorized records."

Every brief carries: *"AI-generated summary based only on authorized records. Verify
against the original medical records before clinical use."*

On timeout (25s), API error, malformed output, or invalid citation, the UI shows "Clinical
summary unavailable" with a Retry button. The chart below it keeps working — the AI is an
addition to the record system, not a dependency of it.

## Security model

- Real email/password authentication (Supabase Auth). No mock login buttons.
- Middleware protects every route and blocks cross-role access (`/doctor/*` vs
  `/patient/*`).
- Row Level Security on all eight tables; the app never relies on frontend filtering.
- Zod validation on every endpoint — frontend validation is treated as a convenience only.
- Structured errors (`{ error: { code, message } }`) that don't leak internals or medical
  content.
- The service-role key and signer private key are server-only, absent from every
  `NEXT_PUBLIC_*` variable, and `.env*` is gitignored.

## Demo instructions

After [setup](#local-setup) and `npm run seed`:

| Step | Action | What it shows |
|---|---|---|
| 1 | Log in as the patient | Dashboard and timeline, built from real rows |
| 2 | Log in as the doctor (separate browser/profile), request Medications + Allergies + Diagnoses | Request created; still zero access |
| 3 | As patient, approve **Medications and Allergies only** | Selective grant + on-chain transaction |
| 4 | As doctor, open the chart | Only the two granted categories appear; withheld categories are named as withheld |
| 5 | Open the Audit Trail | Grant and access events, generated by the actions just performed |
| 6 | Check the blockchain reference on the permission | Real Sepolia transaction (when configured) |
| 7 | Press "Generate clinical history brief" | Grounded summary with per-section source records |
| 8 | As patient, **Revoke**. As doctor, reload the chart | "Access revoked" — the database returns nothing |

Step 8 is the one worth watching: the doctor's page does not hide content, it has none to
show.

## Local setup

```bash
git clone <repo-url> && cd medical-memory
npm install
cp .env.example .env.local        # fill in Supabase URL + keys + CHAIN_REF_SALT
```

Run the migrations in the Supabase SQL editor, in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_expiry.sql`

Then:

```bash
npm run seed     # synthetic demo accounts and records
npm run dev
```

Blockchain features are optional. To enable them:

```bash
npm run contracts:compile
npm run contracts:deploy         # needs a funded Sepolia account
# put the printed address in MEDICAL_MEMORY_CONTRACT_ADDRESS
```

## Environment variables

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CHAIN_REF_SALT`.
Optional: `SEPOLIA_RPC_URL`, `BLOCKCHAIN_SIGNER_PRIVATE_KEY`,
`MEDICAL_MEMORY_CONTRACT_ADDRESS`, `ANTHROPIC_API_KEY`.

## Testing

```bash
npm test         # 19 tests, no network or database needed
npm run typecheck
npm run build
```

Covered: hash determinism and key-order independence, tamper detection across each record
field, granted-scope subset validation, permission expiry/revocation/pending states, and
AI citation validation including hallucinated and out-of-scope ids.

Not covered by automated tests: the RLS policies themselves, which need a live database.
Verify them manually by signing in as the doctor and confirming that withheld categories
return zero rows.

## Limitations

Stated plainly, because these are the questions worth asking:

- **The backend is the only on-chain writer.** The contract has an `onlyOwner` modifier and
  the application holds the key. This is the same trust assumption as any system where the
  backend holds the database credentials — but it means the chain proves the *application*
  recorded a grant, not that the patient personally signed it. Production would have
  patients and providers sign their own transactions.
- **Pseudonymity depends on the salt.** Anyone holding `CHAIN_REF_SALT` can correlate
  on-chain refs to user UUIDs. It is a server-only secret, not a cryptographic guarantee
  against the operator.
- **Sepolia testnet only.** No mainnet deployment, no production blockchain
  infrastructure, no claim of either.
- **All data is synthetic.** No real patients, no real hospital integrations, no adoption
  numbers.
- **Not HIPAA/DPDP compliant**, not audited, not penetration-tested. No compliance claim is
  made anywhere in this repository.
- **No document/file storage.** Structured records were prioritized over shipping an
  insecure file-upload path in the available time.
- **Provider-admin role is minimal.** The schema and enum support it; organization
  management screens were out of scope.
- **AI grounding is strong but not a proof.** Citation validation catches fabricated
  sources; it cannot catch a misreading of a record that *is* in scope. Hence the
  verify-before-clinical-use notice.

## Known issues

- Permission expiry updates the displayed status when a relevant page is loaded, not by a
  background job. Access enforcement is unaffected (`expires_at` is checked per query),
  but a permission can read "Active" in a stale tab after expiry.
- The doctor's access-request form takes a patient UUID directly. A real system would use a
  patient lookup or scannable identifier; UUID entry keeps the demo honest about what is
  implemented.
- Records are listed without pagination. Fine for demo-scale charts, not for thousands of
  rows.

## Future improvements

- Client-side transaction signing so patients authorize grants with their own key.
- Patient-lookup flow replacing raw UUID entry.
- Encrypted document storage with signed, time-limited URLs.
- Provider-admin screens for managing authorized professionals.
- Automated RLS tests against an ephemeral Postgres instance in CI.
- Background job for expiry status and on-chain event reconciliation.

---

*Synthetic data disclaimer: every patient, provider, organization, and medical record in
this repository is fabricated for demonstration. Nothing here is real patient information.*
