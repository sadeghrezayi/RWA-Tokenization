import { InvalidAttestationError } from "./errors.js";

// FR-OR: signed real-world facts about an asset (valuation, NAV, rent received,
// reserve confirmation). Monetary value in integer Rial (D3). The payload hash
// and signature are produced by the AttestationSigner port (crypto stays out of
// the domain); the domain owns the fact, its validity window, and freshness.
export type AttestationKind = "valuation" | "nav" | "rent" | "reserve";

const KINDS: readonly AttestationKind[] = ["valuation", "nav", "rent", "reserve"];

export interface AttestationFact {
  assetId: string;
  kind: AttestationKind;
  valueRial: bigint;
  attestorId: string;
  issuedAt: Date;
  validUntil: Date;
}

// Deterministic canonical serialization of the signed fields — the exact bytes
// the attestor signs and the hash is taken over. Stable field order; versioned
// so the format can evolve without ambiguity.
export const canonicalAttestationPayload = (fact: AttestationFact): string =>
  [
    "attestation.v1",
    fact.assetId,
    fact.kind,
    fact.valueRial.toString(),
    fact.issuedAt.toISOString(),
    fact.validUntil.toISOString(),
    fact.attestorId,
  ].join("|");

export interface IssueAttestationFields extends AttestationFact {
  id: string;
  payloadHash: string;
  signature: string;
  documentCid?: string;
}

export class Attestation {
  private constructor(
    public readonly id: string,
    public readonly assetId: string,
    public readonly kind: AttestationKind,
    public readonly valueRial: bigint,
    public readonly attestorId: string,
    public readonly issuedAt: Date,
    public readonly validUntil: Date,
    public readonly payloadHash: string,
    public readonly signature: string,
    public readonly documentCid: string | undefined,
  ) {}

  static issue(fields: IssueAttestationFields): Attestation {
    if (!KINDS.includes(fields.kind)) {
      throw new InvalidAttestationError(`unknown attestation kind "${fields.kind}"`);
    }
    if (fields.valueRial <= 0n) {
      throw new InvalidAttestationError("an attestation value must be positive");
    }
    if (fields.validUntil.getTime() <= fields.issuedAt.getTime()) {
      throw new InvalidAttestationError("the validity window must end after it was issued");
    }
    if (fields.attestorId.trim() === "") {
      throw new InvalidAttestationError("an attestation needs an attestor");
    }
    if (fields.payloadHash.trim() === "") {
      throw new InvalidAttestationError("an attestation needs a payload hash");
    }
    if (fields.signature.trim() === "") {
      throw new InvalidAttestationError("an attestation needs a signature");
    }
    return new Attestation(
      fields.id,
      fields.assetId,
      fields.kind,
      fields.valueRial,
      fields.attestorId,
      fields.issuedAt,
      fields.validUntil,
      fields.payloadHash,
      fields.signature,
      fields.documentCid,
    );
  }

  // FR-OR-3: usable only up to and including the end of its validity window.
  isFresh(now: Date): boolean {
    return now.getTime() <= this.validUntil.getTime();
  }

  isExpired(now: Date): boolean {
    return !this.isFresh(now);
  }

  static readonly KINDS = KINDS;
}
