import { beforeEach, describe, expect, it } from "vitest";
import { Attestation } from "../../src/domain/attestations/attestation.js";
import type { AttestationKind } from "../../src/domain/attestations/attestation.js";
import type { AttestationRepository } from "../../src/application/attestations/ports.js";

const att = (id: string, kind: AttestationKind, issuedAt: string, valueRial: bigint) =>
  Attestation.issue({
    id,
    assetId: "asset-1",
    kind,
    valueRial,
    attestorId: "attestor-1",
    issuedAt: new Date(issuedAt),
    validUntil: new Date("2026-12-31T00:00:00Z"),
    payloadHash: `${id}-hash`,
    signature: `${id}-sig`,
  });

// LSP contract: every AttestationRepository implementation passes this unchanged.
export const attestationRepositoryContract = (
  name: string,
  makeRepo: () => Promise<AttestationRepository>,
): void => {
  describe(`AttestationRepository contract — ${name}`, () => {
    let repo: AttestationRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("round_trips_an_attestation_with_all_fields", async () => {
      await repo.save(
        Attestation.issue({
          id: "att-1",
          assetId: "asset-1",
          kind: "valuation",
          valueRial: 5_000_000_000n,
          attestorId: "attestor-1",
          issuedAt: new Date("2026-07-01T00:00:00Z"),
          validUntil: new Date("2026-10-01T00:00:00Z"),
          payloadHash: "hash-1",
          signature: "sig-1",
          documentCid: "bafyDoc",
        }),
      );

      const found = await repo.findById("att-1");
      expect(found?.valueRial).toBe(5_000_000_000n);
      expect(found?.attestorId).toBe("attestor-1");
      expect(found?.payloadHash).toBe("hash-1");
      expect(found?.documentCid).toBe("bafyDoc");
      expect(found?.issuedAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    });

    it("lists_an_assets_attestations_newest_first", async () => {
      await repo.save(att("old", "valuation", "2026-07-01T00:00:00Z", 100n));
      await repo.save(att("new", "rent", "2026-08-01T00:00:00Z", 200n));

      const list = await repo.findByAsset("asset-1");
      expect(list.map((a) => a.id)).toEqual(["new", "old"]);
    });

    it("finds_the_latest_of_a_kind", async () => {
      await repo.save(att("v1", "valuation", "2026-07-01T00:00:00Z", 100n));
      await repo.save(att("v2", "valuation", "2026-09-01T00:00:00Z", 300n));
      await repo.save(att("r1", "rent", "2026-10-01T00:00:00Z", 50n));

      expect((await repo.findLatest("asset-1", "valuation"))?.id).toBe("v2");
      expect(await repo.findLatest("asset-1", "nav")).toBeUndefined();
    });
  });
};
