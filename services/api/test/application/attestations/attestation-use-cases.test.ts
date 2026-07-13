import { describe, expect, it } from "vitest";
import { PublishAttestation } from "../../../src/application/attestations/publish-attestation.js";
import {
  GetLatestAttestation,
  ListAttestations,
} from "../../../src/application/attestations/get-attestation.js";
import { AssetNotFoundError } from "../../../src/application/assets/errors.js";
import { InvalidAttestationError } from "../../../src/domain/attestations/errors.js";
import { canonicalAttestationPayload } from "../../../src/domain/attestations/attestation.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { InMemoryAssetRepository, RecordingAssetEventLog } from "../../fakes/asset-fakes.js";
import { SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";
import {
  FakeAttestationSigner,
  InMemoryAttestationRepository,
  RecordingAttestationAnchor,
} from "../../fakes/attestation-fakes.js";

const NOW = new Date("2026-07-01T00:00:00Z");
const VALID_UNTIL = new Date("2026-10-01T00:00:00Z");
const ACTOR = "officer-1";

const tokenizedAsset = () =>
  Asset.restore({
    id: "asset-1",
    name: "Vanak Tower SPV",
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: "0xTok1",
  });

const setup = async () => {
  const attestations = new InMemoryAttestationRepository();
  const assets = new InMemoryAssetRepository();
  const signer = new FakeAttestationSigner();
  const anchor = new RecordingAttestationAnchor();
  const events = new RecordingAssetEventLog();
  const clock = new FixedClock(NOW);
  await assets.save(tokenizedAsset());
  return {
    attestations,
    assets,
    signer,
    anchor,
    events,
    clock,
    publish: new PublishAttestation(
      attestations,
      assets,
      signer,
      anchor,
      new SequentialIdGenerator(),
      events,
      clock,
    ),
    latest: new GetLatestAttestation(attestations, clock),
    list: new ListAttestations(attestations, clock),
  };
};

describe("PublishAttestation (FR-OR-1/2)", () => {
  it("signs_anchors_and_persists_a_valuation_with_all_metadata", async () => {
    const s = await setup();

    const { attestationId } = await s.publish.execute({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      validUntil: VALID_UNTIL,
      actor: ACTOR,
    });

    const stored = await s.attestations.findById(attestationId);
    expect(stored?.kind).toBe("valuation");
    expect(stored?.valueRial).toBe(5_000_000_000n);
    expect(stored?.attestorId).toBe("attestor-1");
    expect(stored?.issuedAt).toEqual(NOW);
    expect(stored?.validUntil).toEqual(VALID_UNTIL);

    // The signed payload hash matches the canonical fact, and it was anchored.
    const expectedPayload = canonicalAttestationPayload({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      attestorId: "attestor-1",
      issuedAt: NOW,
      validUntil: VALID_UNTIL,
    });
    const expectedHash = (await s.signer.sign(expectedPayload)).payloadHash;
    expect(stored?.payloadHash).toBe(expectedHash);
    expect(s.anchor.anchored).toEqual([{ payloadHash: expectedHash, validUntil: VALID_UNTIL }]);
    expect(s.events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "attestation_published",
      actor: ACTOR,
    });
  });

  it("carries_a_reference_document_when_supplied", async () => {
    const s = await setup();
    const { attestationId } = await s.publish.execute({
      assetId: "asset-1",
      kind: "rent",
      valueRial: 120_000_000n,
      validUntil: VALID_UNTIL,
      documentCid: "bafyRentReceipt",
      actor: ACTOR,
    });
    expect((await s.attestations.findById(attestationId))?.documentCid).toBe("bafyRentReceipt");
  });

  it("rejects_a_validity_window_in_the_past", async () => {
    const s = await setup();
    await expect(
      s.publish.execute({
        assetId: "asset-1",
        kind: "valuation",
        valueRial: 1_000n,
        validUntil: new Date("2026-06-01T00:00:00Z"),
        actor: ACTOR,
      }),
    ).rejects.toThrow(InvalidAttestationError);
    expect(s.anchor.anchored).toEqual([]);
  });

  it("does_not_persist_when_anchoring_fails", async () => {
    const s = await setup();
    s.anchor.failWith = new Error("devnet unreachable");
    await expect(
      s.publish.execute({
        assetId: "asset-1",
        kind: "valuation",
        valueRial: 1_000n,
        validUntil: VALID_UNTIL,
        actor: ACTOR,
      }),
    ).rejects.toThrow("devnet unreachable");
    expect(await s.attestations.findByAsset("asset-1")).toEqual([]);
  });

  it("rejects_publishing_for_an_unknown_asset", async () => {
    const s = await setup();
    await expect(
      s.publish.execute({
        assetId: "missing",
        kind: "valuation",
        valueRial: 1_000n,
        validUntil: VALID_UNTIL,
        actor: ACTOR,
      }),
    ).rejects.toThrow(AssetNotFoundError);
  });
});

describe("GetLatestAttestation + freshness (FR-OR-3)", () => {
  it("returns_the_most_recent_of_a_kind_marked_fresh_within_the_window", async () => {
    const s = await setup();
    await s.publish.execute({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      validUntil: VALID_UNTIL,
      actor: ACTOR,
    });

    const view = await s.latest.execute({ assetId: "asset-1", kind: "valuation" });
    expect(view).toMatchObject({
      kind: "valuation",
      valueRial: "5000000000",
      fresh: true,
      asOf: NOW.toISOString(),
    });
  });

  it("marks_the_latest_stale_once_the_clock_passes_the_window", async () => {
    const s = await setup();
    await s.publish.execute({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      validUntil: VALID_UNTIL,
      actor: ACTOR,
    });
    s.clock.current = new Date("2026-10-02T00:00:00Z");

    const view = await s.latest.execute({ assetId: "asset-1", kind: "valuation" });
    expect(view?.fresh).toBe(false);
  });

  it("returns_undefined_when_there_is_no_attestation_of_that_kind", async () => {
    const s = await setup();
    expect(await s.latest.execute({ assetId: "asset-1", kind: "nav" })).toBeUndefined();
  });
});

describe("ListAttestations (history log)", () => {
  it("lists_an_assets_attestations_newest_first_with_freshness", async () => {
    const s = await setup();
    await s.publish.execute({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      validUntil: VALID_UNTIL,
      actor: ACTOR,
    });
    s.clock.current = new Date("2026-08-01T00:00:00Z");
    await s.publish.execute({
      assetId: "asset-1",
      kind: "rent",
      valueRial: 120_000_000n,
      validUntil: new Date("2026-11-01T00:00:00Z"),
      actor: ACTOR,
    });

    const views = await s.list.execute({ assetId: "asset-1" });
    expect(views).toHaveLength(2);
    expect(views[0]?.kind).toBe("rent"); // newest first
    expect(views.every((v) => v.fresh)).toBe(true);
  });
});
