import type { Attestation } from "../../domain/attestations/attestation.js";

export interface AttestationRepository {
  findById(id: string): Promise<Attestation | undefined>;
  findByAsset(assetId: string): Promise<Attestation[]>;
  findLatest(assetId: string, kind: string): Promise<Attestation | undefined>;
  save(attestation: Attestation): Promise<void>;
}

// FR-OR-1/2 + FR-OR-4: signs the canonical payload with an attestor key. The
// port exposes the attestor identity so it can be baked into the signed fact,
// and the seam allows multiple independent attestors (quorum) later.
export interface AttestationSigner {
  attestorId(): string;
  sign(payload: string): Promise<{ payloadHash: string; signature: string }>;
}

// FR-OR-1: anchors the payload hash on-chain so the fact is tamper-evident.
export interface AttestationAnchor {
  anchor(payloadHash: string, validUntil: Date): Promise<void>;
}
