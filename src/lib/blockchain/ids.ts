import { createHash } from "crypto";
import { keccak256, toUtf8Bytes, zeroPadValue, toBeHex } from "ethers";

/**
 * Turns an internal UUID into a bytes32 value suitable for a contract
 * argument. This is NOT encryption — it's a fixed-width encoding, salted
 * with a server-only secret so the on-chain value cannot be correlated back
 * to the UUID (and therefore the patient/doctor) by anyone without the
 * salt. Deterministic: the same UUID always yields the same ref, which is
 * required so the contract can look up the same patientRef/doctorRef again.
 */
function salt(): string {
  const s = process.env.CHAIN_REF_SALT;
  if (!s) {
    throw new Error(
      "CHAIN_REF_SALT is not set. Refusing to derive on-chain identifiers without a server-only salt."
    );
  }
  return s;
}

export function toChainRef(entityUuid: string): `0x${string}` {
  const hash = createHash("sha256").update(`${salt()}:${entityUuid}`).digest("hex");
  return `0x${hash}` as `0x${string}`;
}

/** Hash of the sorted category list, revealing only "which categories were
 * granted", never clinical content. */
export function scopeHash(categories: string[]): `0x${string}` {
  const sorted = [...categories].sort().join(",");
  return keccak256(toUtf8Bytes(sorted)) as `0x${string}`;
}

/** Deterministic bytes32 permission id derived from the DB row's UUID, so
 * the same off-chain permission always maps to the same on-chain id. */
export function permissionIdToBytes32(permissionUuid: string): `0x${string}` {
  return keccak256(toUtf8Bytes(permissionUuid)) as `0x${string}`;
}

export function recordIdToBytes32(recordUuid: string): `0x${string}` {
  return keccak256(toUtf8Bytes(recordUuid)) as `0x${string}`;
}

export function contentHashToBytes32(hex64: string): `0x${string}` {
  // content_hash is a sha256 hex digest (64 chars); pad/normalize to bytes32.
  const normalized = hex64.startsWith("0x") ? hex64 : `0x${hex64}`;
  return zeroPadValue(toBeHex(BigInt(normalized)), 32) as `0x${string}`;
}
