import { Contract, JsonRpcProvider, Wallet, type TransactionReceipt } from "ethers";
import registryAbi from "../../../contracts/abi/MedicalMemoryRegistry.json";

export type ChainTxResult =
  | { status: "confirmed"; txHash: string; blockNumber: number }
  | { status: "failed"; error: string }
  | { status: "unavailable"; reason: string };

/**
 * Server-only signer for the application's backend account. This account is
 * the contract `owner` (see contracts/MedicalMemoryRegistry.sol) and is the
 * sole writer of on-chain events, mirroring how a traditional backend holds
 * its DB credentials. Never imported from client components.
 */
function getSigner(): Wallet | null {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY;
  if (!rpcUrl || !pk) return null;
  const provider = new JsonRpcProvider(rpcUrl);
  return new Wallet(pk, provider);
}

function getContract(): Contract | null {
  const signer = getSigner();
  const address = process.env.MEDICAL_MEMORY_CONTRACT_ADDRESS;
  if (!signer || !address) return null;
  return new Contract(address, registryAbi, signer);
}

/** True only when RPC URL, signer key, and deployed contract address are all
 * configured. The rest of the app must treat blockchain features as fully
 * optional and degrade explicitly (never silently) when this is false. */
export function isBlockchainConfigured(): boolean {
  return Boolean(
    process.env.SEPOLIA_RPC_URL &&
      process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY &&
      process.env.MEDICAL_MEMORY_CONTRACT_ADDRESS
  );
}

async function submit(fn: (contract: Contract) => Promise<{ hash: string; wait: () => Promise<TransactionReceipt | null> }>): Promise<ChainTxResult> {
  const contract = getContract();
  if (!contract) {
    return { status: "unavailable", reason: "Blockchain is not configured (missing RPC URL, signer key, or contract address)." };
  }
  try {
    const tx = await fn(contract);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      return { status: "failed", error: "Transaction reverted or was not confirmed." };
    }
    return { status: "confirmed", txHash: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown blockchain error." };
  }
}

export async function chainGrantAccess(args: {
  permissionId: `0x${string}`;
  patientRef: `0x${string}`;
  doctorRef: `0x${string}`;
  scopeHash: `0x${string}`;
  expiresAtUnix: number;
}): Promise<ChainTxResult> {
  return submit((c) =>
    c.grantAccess(args.permissionId, args.patientRef, args.doctorRef, args.scopeHash, args.expiresAtUnix)
  );
}

export async function chainRevokeAccess(permissionId: `0x${string}`): Promise<ChainTxResult> {
  return submit((c) => c.revokeAccess(permissionId));
}

export async function chainRegisterRecordHash(args: {
  recordId: `0x${string}`;
  patientRef: `0x${string}`;
  contentHash: `0x${string}`;
}): Promise<ChainTxResult> {
  return submit((c) => c.registerRecordHash(args.recordId, args.patientRef, args.contentHash));
}

export async function chainRecordAuditEvent(args: {
  auditId: `0x${string}`;
  actorRef: `0x${string}`;
  actionCode: `0x${string}`;
  resourceRef: `0x${string}`;
}): Promise<ChainTxResult> {
  return submit((c) => c.recordAuditEvent(args.auditId, args.actorRef, args.actionCode, args.resourceRef));
}
