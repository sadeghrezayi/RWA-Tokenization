import { beforeEach, describe, expect, it } from "vitest";
import { Asset } from "../../src/domain/assets/asset.js";
import { CustodyArrangement } from "../../src/domain/assets/custody-arrangement.js";
import { DossierDocument, LegalDossier } from "../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../src/domain/assets/onboarding-checklist.js";
import type { AssetRepository } from "../../src/application/assets/ports.js";

const SHA = "c".repeat(64);

const structuredAsset = (id: string) =>
  Asset.propose(id, "Pilot Real Estate SPV", "asset_backed")
    .startStructuring()
    .attachDocument(
      DossierDocument.of({ kind: "ownership_evidence", title: "Deed", cid: "QmDeed", sha256: SHA }),
    )
    .recordCustody(CustodyArrangement.of({ custodianName: "Trust Co.", location: "Vault 12" }))
    .confirmChecklistItem("legal_right_clear");

// LSP contract: every AssetRepository implementation must pass unchanged.
export const assetRepositoryContract = (
  name: string,
  makeRepo: () => Promise<AssetRepository>,
): void => {
  describe(`AssetRepository contract — ${name}`, () => {
    let repo: AssetRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("round_trips_a_structured_asset_verbatim", async () => {
      await repo.save(structuredAsset("asset-1"));

      const found = await repo.findById("asset-1");
      expect(found?.name).toBe("Pilot Real Estate SPV");
      expect(found?.state).toBe("in_structuring");
      expect(found?.dossier.documents).toHaveLength(1);
      expect(found?.dossier.documents[0]?.cid).toBe("QmDeed");
      expect(found?.dossier.documents[0]?.sha256).toBe(SHA);
      expect(found?.custody?.custodianName).toBe("Trust Co.");
      expect(found?.checklist.isConfirmed("legal_right_clear")).toBe(true);
      expect(found?.checklist.isConfirmed("transferable")).toBe(false);
    });

    it("round_trips_an_asset_without_custody_or_documents", async () => {
      await repo.save(Asset.propose("asset-2", "Bare SPV", "asset_backed"));

      const found = await repo.findById("asset-2");
      expect(found?.state).toBe("proposed");
      expect(found?.custody).toBeUndefined();
      expect(found?.dossier.documents).toEqual([]);
    });

    it("save_overwrites_existing_state", async () => {
      const asset = structuredAsset("asset-1");
      await repo.save(asset);
      await repo.save(asset.confirmChecklistItem("transferable"));

      const found = await repo.findById("asset-1");
      expect(found?.checklist.isConfirmed("transferable")).toBe(true);
      expect(found?.dossier.documents).toHaveLength(1);
    });

    it("round_trips_the_token_address_of_a_tokenized_asset", async () => {
      await repo.save(
        Asset.restore({
          id: "asset-tok",
          name: "Tokenized SPV",
          type: "asset_backed",
          state: "tokenized",
          dossier: LegalDossier.empty(),
          checklist: OnboardingChecklist.empty(),
          custody: undefined,
          tokenAddress: "0xAbCd000000000000000000000000000000000001",
        }),
      );

      const found = await repo.findById("asset-tok");
      expect(found?.state).toBe("tokenized");
      expect(found?.tokenAddress).toBe("0xAbCd000000000000000000000000000000000001");
    });

    it("lists_all_saved_assets", async () => {
      await repo.save(Asset.propose("asset-1", "One", "asset_backed"));
      await repo.save(Asset.propose("asset-2", "Two", "asset_backed"));

      const all = await repo.findAll();
      expect(all.map((a) => a.id).sort()).toEqual(["asset-1", "asset-2"]);
    });
  });
};
