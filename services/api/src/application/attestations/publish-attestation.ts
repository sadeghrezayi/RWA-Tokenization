import { Attestation, canonicalAttestationPayload } from "../../domain/attestations/attestation.js";
import type { AttestationFact, AttestationKind } from "../../domain/attestations/attestation.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import type { AttestationAnchor, AttestationRepository, AttestationSigner } from "./ports.js";

// FR-OR-1/2: publish a signed real-world fact. The validity window is checked
// by the domain (validUntil must be after issuance = now). Order: sign →
// anchor on-chain → persist, so a persisted attestation is always one whose
// hash is anchored; an anchor failure aborts before anything is stored.
export class PublishAttestation {
  constructor(
    private readonly attestations: AttestationRepository,
    private readonly assets: AssetRepository,
    private readonly signer: AttestationSigner,
    private readonly anchor: AttestationAnchor,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    assetId: string;
    kind: AttestationKind;
    valueRial: bigint;
    validUntil: Date;
    documentCid?: string;
    actor: string;
  }): Promise<{ attestationId: string; payloadHash: string }> {
    await loadAsset(this.assets, input.assetId);

    const fact: AttestationFact = {
      assetId: input.assetId,
      kind: input.kind,
      valueRial: input.valueRial,
      attestorId: this.signer.attestorId(),
      issuedAt: this.clock.now(),
      validUntil: input.validUntil,
    };
    const { payloadHash, signature } = await this.signer.sign(canonicalAttestationPayload(fact));

    // Construct (and validate the window/value) before touching the chain.
    const attestation = Attestation.issue({
      id: this.ids.nextId(),
      ...fact,
      payloadHash,
      signature,
      ...(input.documentCid !== undefined ? { documentCid: input.documentCid } : {}),
    });

    await this.anchor.anchor(payloadHash, input.validUntil);
    await this.attestations.save(attestation);
    await this.events.append({
      assetId: input.assetId,
      event: "attestation_published",
      actor: input.actor,
      details: { attestationId: attestation.id, kind: input.kind, payloadHash },
    });
    return { attestationId: attestation.id, payloadHash };
  }
}
