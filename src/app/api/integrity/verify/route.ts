import { NextResponse, type NextRequest } from "next/server";
import { Contract, JsonRpcProvider } from "ethers";
import { ERRORS, requireUser } from "@/lib/api/http";
import { verifyIntegritySchema, firstZodMessage } from "@/lib/api/schemas";
import { hashRecord } from "@/lib/hash";
import { writeAudit } from "@/lib/audit";
import { isBlockchainConfigured } from "@/lib/blockchain/client";
import { recordIdToBytes32, contentHashToBytes32 } from "@/lib/blockchain/ids";
import registryAbi from "../../../../../contracts/abi/MedicalMemoryRegistry.json";

/**
 * Tamper detection:
 *   1. Read the record as it exists in the database right now (RLS-scoped,
 *      so you can only verify records you're authorized to see).
 *   2. Recompute the canonical hash from the CURRENT field values.
 *   3. Read the hash that was registered on-chain for this record id.
 *   4. Compare.
 *
 * If someone edited a row directly in the database, step 2 produces a
 * different digest from step 3 and this returns `mismatch`. The on-chain
 * value cannot be quietly rewritten to match, which is the property that
 * makes the check meaningful.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (!ctx) return ERRORS.unauthenticated();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ERRORS.invalidInput("Request body must be valid JSON.");
  }

  const parsed = verifyIntegritySchema.safeParse(body);
  if (!parsed.success) return ERRORS.invalidInput(firstZodMessage(parsed.error));

  const { data: record } = await ctx.supabase
    .from("medical_records")
    .select("*")
    .eq("id", parsed.data.recordId)
    .maybeSingle();

  if (!record) {
    return ERRORS.notFound("medical record");
  }

  const recomputed = hashRecord({
    patient_id: record.patient_id,
    category: record.category,
    title: record.title,
    occurred_on: record.occurred_on,
    details: record.details,
    notes: record.notes,
  });

  const storedMatches = recomputed === record.content_hash;

  if (!isBlockchainConfigured() || record.chain_tx_status !== "confirmed") {
    return NextResponse.json({
      status: storedMatches ? "not_registered" : "mismatch",
      recomputedHash: recomputed,
      storedHash: record.content_hash,
      onChainHash: null,
      message: !storedMatches
        ? "The record content no longer matches its stored hash. This record was modified outside the application."
        : "This record has not been registered on-chain, so blockchain verification is unavailable. The stored hash matches the current content.",
    });
  }

  let onChainHash: string | null = null;
  try {
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
    const contract = new Contract(
      process.env.MEDICAL_MEMORY_CONTRACT_ADDRESS!,
      registryAbi,
      provider
    );
    onChainHash = await contract.recordHashes(recordIdToBytes32(record.id));
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      recomputedHash: recomputed,
      storedHash: record.content_hash,
      onChainHash: null,
      message: `Could not reach the blockchain to verify this record: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    });
  }

  const expected = contentHashToBytes32(recomputed).toLowerCase();
  const verified = storedMatches && onChainHash?.toLowerCase() === expected;

  await writeAudit({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: verified ? "integrity_verified" : "integrity_mismatch_detected",
    patientId: record.patient_id,
    resourceType: "medical_record",
    resourceId: record.id,
    authorizationContext: verified
      ? "Recomputed hash matches the on-chain registered hash"
      : "Recomputed hash does NOT match the on-chain registered hash",
    result: verified ? "success" : "error",
    chainTxHash: record.chain_tx_hash,
    chainTxStatus: "confirmed",
  });

  return NextResponse.json({
    status: verified ? "verified" : "mismatch",
    recomputedHash: recomputed,
    storedHash: record.content_hash,
    onChainHash,
    txHash: record.chain_tx_hash,
    network: "sepolia",
    message: verified
      ? "The current record content hashes to the value registered on-chain."
      : "The current record content does not match the hash registered on-chain. This record may have been modified.",
  });
}
