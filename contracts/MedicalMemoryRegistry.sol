// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MedicalMemoryRegistry
/// @notice Minimal, privacy-preserving on-chain registry for the Medical
/// Memory system. This contract NEVER stores raw medical information.
///
/// What it stores, and why each is safe to put on a public chain:
///   - `patientRef` / `doctorRef`  — opaque bytes32 pseudonyms (a hash of an
///     internal UUID + server-side salt, see lib/blockchain/ids.ts). They do
///     not reveal identity, diagnosis, or any clinical fact on their own.
///   - `scopeHash`                 — hash of the sorted list of granted
///     record categories (e.g. keccak256("allergy,medication")). Reveals
///     that *some* categories were granted, not their clinical content.
///   - `recordHash`                — sha256/keccak256 of a canonical
///     serialization of a medical record, used ONLY to detect tampering.
///     A hash cannot be reversed into the original record.
///   - `expiresAt`                 — a timestamp, not sensitive.
///
/// The application's Postgres database remains the single source of truth
/// for actual medical content and for real-time authorization decisions
/// (RLS checks expires_at directly). This contract provides an independent,
/// tamper-evident, publicly-verifiable log of grant/revoke/integrity events
/// that the off-chain database mirrors into `blockchain_events`.
contract MedicalMemoryRegistry {
    address public immutable owner;

    struct Permission {
        bytes32 patientRef;
        bytes32 doctorRef;
        bytes32 scopeHash;
        uint256 grantedAt;
        uint256 expiresAt;
        bool active;
    }

    /// @dev permissionId => Permission. permissionId is keccak256(patientRef, doctorRef, nonce)
    /// computed off-chain and passed in, so it matches the application's
    /// `permissions.id` deterministically without exposing the UUID itself.
    mapping(bytes32 => Permission) public permissions;

    /// @dev recordId => latest registered content hash.
    mapping(bytes32 => bytes32) public recordHashes;

    /// @dev Restricts write access to the application's backend signer.
    /// A hackathon-scale trust assumption: the backend is the only writer,
    /// same as any traditional system's DB credentials. Documented as a
    /// known limitation in README "What would need to change before
    /// production" — a production version would let patients/providers
    /// sign their own transactions directly from the client.
    modifier onlyOwner() {
        require(msg.sender == owner, "MedicalMemoryRegistry: not authorized");
        _;
    }

    event AccessGranted(
        bytes32 indexed permissionId,
        bytes32 indexed patientRef,
        bytes32 indexed doctorRef,
        bytes32 scopeHash,
        uint256 expiresAt
    );

    event AccessRevoked(bytes32 indexed permissionId, bytes32 indexed patientRef, bytes32 indexed doctorRef);

    event RecordHashRegistered(bytes32 indexed recordId, bytes32 indexed patientRef, bytes32 contentHash);

    event AuditRecorded(bytes32 indexed auditId, bytes32 indexed actorRef, bytes32 actionCode, bytes32 resourceRef);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Register a new permission grant. Reverts if the id is already used.
    function grantAccess(
        bytes32 permissionId,
        bytes32 patientRef,
        bytes32 doctorRef,
        bytes32 scopeHash,
        uint256 expiresAt
    ) external onlyOwner {
        require(permissions[permissionId].grantedAt == 0, "MedicalMemoryRegistry: permission exists");
        require(expiresAt > block.timestamp, "MedicalMemoryRegistry: expiry in past");

        permissions[permissionId] = Permission({
            patientRef: patientRef,
            doctorRef: doctorRef,
            scopeHash: scopeHash,
            grantedAt: block.timestamp,
            expiresAt: expiresAt,
            active: true
        });

        emit AccessGranted(permissionId, patientRef, doctorRef, scopeHash, expiresAt);
    }

    /// @notice Revoke an active permission ahead of its natural expiry.
    function revokeAccess(bytes32 permissionId) external onlyOwner {
        Permission storage p = permissions[permissionId];
        require(p.grantedAt != 0, "MedicalMemoryRegistry: unknown permission");
        require(p.active, "MedicalMemoryRegistry: already inactive");

        p.active = false;
        emit AccessRevoked(permissionId, p.patientRef, p.doctorRef);
    }

    /// @notice Register (or update) the integrity hash for a medical record.
    function registerRecordHash(bytes32 recordId, bytes32 patientRef, bytes32 contentHash) external onlyOwner {
        recordHashes[recordId] = contentHash;
        emit RecordHashRegistered(recordId, patientRef, contentHash);
    }

    /// @notice Emit a lightweight, publicly-verifiable audit reference.
    /// The full audit record (who/what/when in readable form) lives in
    /// Postgres `audit_events`; this event is the tamper-evident anchor.
    function recordAuditEvent(bytes32 auditId, bytes32 actorRef, bytes32 actionCode, bytes32 resourceRef)
        external
        onlyOwner
    {
        emit AuditRecorded(auditId, actorRef, actionCode, resourceRef);
    }

    /// @notice Read-only helper for a UI "Verify" button.
    function isPermissionActive(bytes32 permissionId) external view returns (bool) {
        Permission memory p = permissions[permissionId];
        return p.active && p.expiresAt > block.timestamp;
    }
}
