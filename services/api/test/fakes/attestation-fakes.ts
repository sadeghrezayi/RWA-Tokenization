import { createHash } from "node:crypto";
import type { Attestation } from "../../src/domain/attestations/attestation.js";
import type {
  AttestationAnchor,
  AttestationRepository,
  AttestationSigner,
} from "../../src/application/attestations/ports.js";

export class InMemoryAttestationRepository implements AttestationRepository {
  private readonly byId = new Map<string, Attestation>();
  failNextSave: Error | undefined;

  findById(id: string): Promise<Attestation | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByAsset(assetId: string): Promise<Attestation[]> {
    return Promise.resolve(this.forAsset(assetId));
  }

  findLatest(assetId: string, kind: string): Promise<Attestation | undefined> {
    return Promise.resolve(this.forAsset(assetId).find((a) => a.kind === kind));
  }

  save(attestation: Attestation): Promise<void> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      return Promise.reject(error);
    }
    this.byId.set(attestation.id, attestation);
    return Promise.resolve();
  }

  // Newest first, by issuance time.
  private forAsset(assetId: string): Attestation[] {
    return [...this.byId.values()]
      .filter((a) => a.assetId === assetId)
      .sort((x, y) => y.issuedAt.getTime() - x.issuedAt.getTime());
  }
}

// Deterministic stand-in for the ECDSA signer: real sha256 payload hash,
// a fake signature, a fixed attestor identity.
export class FakeAttestationSigner implements AttestationSigner {
  constructor(private readonly id = "attestor-1") {}

  attestorId(): string {
    return this.id;
  }

  sign(payload: string): Promise<{ payloadHash: string; signature: string }> {
    const payloadHash = createHash("sha256").update(payload).digest("hex");
    return Promise.resolve({ payloadHash, signature: `sig:${payloadHash.slice(0, 16)}` });
  }
}

export class RecordingAttestationAnchor implements AttestationAnchor {
  readonly anchored: { payloadHash: string; validUntil: Date }[] = [];
  failWith: Error | undefined;

  anchor(payloadHash: string, validUntil: Date): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.anchored.push({ payloadHash, validUntil });
    return Promise.resolve();
  }
}
