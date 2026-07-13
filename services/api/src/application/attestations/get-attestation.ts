import type { Attestation, AttestationKind } from "../../domain/attestations/attestation.js";
import type { Clock } from "../offerings/ports.js";
import type { AttestationRepository } from "./ports.js";

// Read model. Monetary value as string; `fresh` computed against the clock
// (FR-OR-3); `asOf` is the issuance time for honest "valuation as of DATE".
export interface AttestationView {
  id: string;
  assetId: string;
  kind: AttestationKind;
  valueRial: string;
  attestorId: string;
  asOf: string;
  validUntil: string;
  payloadHash: string;
  documentCid?: string;
  fresh: boolean;
}

export const toAttestationView = (attestation: Attestation, now: Date): AttestationView => ({
  id: attestation.id,
  assetId: attestation.assetId,
  kind: attestation.kind,
  valueRial: String(attestation.valueRial),
  attestorId: attestation.attestorId,
  asOf: attestation.issuedAt.toISOString(),
  validUntil: attestation.validUntil.toISOString(),
  payloadHash: attestation.payloadHash,
  ...(attestation.documentCid !== undefined ? { documentCid: attestation.documentCid } : {}),
  fresh: attestation.isFresh(now),
});

export class GetLatestAttestation {
  constructor(
    private readonly attestations: AttestationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    assetId: string;
    kind: AttestationKind;
  }): Promise<AttestationView | undefined> {
    const latest = await this.attestations.findLatest(input.assetId, input.kind);
    return latest ? toAttestationView(latest, this.clock.now()) : undefined;
  }
}

export class ListAttestations {
  constructor(
    private readonly attestations: AttestationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { assetId: string }): Promise<AttestationView[]> {
    const now = this.clock.now();
    return (await this.attestations.findByAsset(input.assetId)).map((a) =>
      toAttestationView(a, now),
    );
  }
}
