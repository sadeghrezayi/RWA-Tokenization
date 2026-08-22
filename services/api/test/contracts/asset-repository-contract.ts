import { beforeEach, describe, expect, it } from "vitest";
import { Asset } from "../../src/domain/assets/asset.js";
import { CustodyArrangement } from "../../src/domain/assets/custody-arrangement.js";
import { DossierDocument, LegalDossier } from "../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../src/domain/assets/onboarding-checklist.js";
import { RealEstateProfile } from "../../src/domain/assets/real-estate-profile.js";
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

const ORGANISATION_ID = "org-contract-1";

// LSP contract: every AssetRepository implementation must pass unchanged.
//
// `seedOrganisation` exists because the Prisma implementation enforces a real
// foreign key to issuer_organisations while the in-memory one has no such
// notion. The CONTRACT is identical; only the arranging differs.
export const assetRepositoryContract = (
  name: string,
  makeRepo: () => Promise<AssetRepository>,
  seedOrganisation: (id: string) => Promise<void> = () => Promise.resolve(),
): void => {
  describe(`AssetRepository contract — ${name}`, () => {
    let repo: AssetRepository;

    beforeEach(async () => {
      repo = await makeRepo();
      await seedOrganisation(ORGANISATION_ID);
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

    it("remembers which documents were revealed to investors", async () => {
      // A disclosure that does not survive a reload is worse than none: the
      // operator believes holders can read something they cannot.
      const asset = structuredAsset("asset-disclosed").setDocumentVisibility(
        "ownership_evidence",
        true,
      );
      await repo.save(asset);

      const loaded = await repo.findById("asset-disclosed");

      expect(loaded?.dossier.investorVisibleDocuments().map((d) => d.kind)).toEqual([
        "ownership_evidence",
      ]);
    });

    it("remembers WHO accepted a document and when, not merely that it passed", async () => {
      // A review that does not survive a reload is worse than none: every
      // document reads as unreviewed and approval is blocked forever, or —
      // worse, if the state were dropped the other way — as reviewed by nobody.
      const at = new Date("2026-08-22T10:00:00.000Z");
      const asset = structuredAsset("asset-reviewed").acceptDocument("ownership_evidence", {
        reviewer: "officer-1",
        at,
      });
      await repo.save(asset);

      const loaded = await repo.findById("asset-reviewed");
      const document = loaded?.dossier.documents.find((d) => d.kind === "ownership_evidence");
      expect(document?.review.state).toBe("accepted");
      expect(document?.review.reviewedBy).toBe("officer-1");
      expect(document?.review.reviewedAt?.toISOString()).toBe(at.toISOString());
      expect(loaded?.dossier.awaitingReview()).toEqual([]);
    });

    it("keeps a rejection AND its reason across a round trip", async () => {
      // Without the reason the issuer is told only that something is wrong.
      const asset = structuredAsset("asset-rejected").rejectDocument("ownership_evidence", {
        reviewer: "officer-1",
        at: new Date("2026-08-22T10:00:00.000Z"),
        reason: "the deed names a different parcel",
      });
      await repo.save(asset);

      const loaded = await repo.findById("asset-rejected");
      const document = loaded?.dossier.documents.find((d) => d.kind === "ownership_evidence");
      expect(document?.review.state).toBe("rejected");
      expect(document?.review.reason).toMatch(/different parcel/);
      // A rejected document is still outstanding work, not a settled one.
      expect(loaded?.dossier.awaitingReview().map((d) => d.kind)).toEqual(["ownership_evidence"]);
    });

    it("restores a never-reviewed document as PENDING, never as accepted", async () => {
      await repo.save(structuredAsset("asset-unreviewed"));

      const loaded = await repo.findById("asset-unreviewed");
      expect(loaded?.dossier.documents[0]?.review.state).toBe("pending");
    });

    it("keeps documents hidden by default across a round trip", async () => {
      await repo.save(structuredAsset("asset-private"));

      const loaded = await repo.findById("asset-private");

      expect(loaded?.dossier.documents).toHaveLength(1);
      expect(loaded?.dossier.investorVisibleDocuments()).toEqual([]);
    });

    it("remembers the property a token is issued against", async () => {
      const asset = structuredAsset("asset-property").recordRealEstateProfile(
        RealEstateProfile.of({
          addressLine: "Plot 14, Vanak Street",
          city: "Tehran",
          propertyType: "residential",
          areaSquareMetres: 240,
          titleReference: "TR-1990-4471",
          builtInYear: 1998,
        }),
      );
      await repo.save(asset);

      const loaded = await repo.findById("asset-property");

      expect(loaded?.realEstate?.addressLine).toBe("Plot 14, Vanak Street");
      expect(loaded?.realEstate?.city).toBe("Tehran");
      expect(loaded?.realEstate?.propertyType).toBe("residential");
      expect(loaded?.realEstate?.areaSquareMetres).toBe(240);
      expect(loaded?.realEstate?.titleReference).toBe("TR-1990-4471");
      expect(loaded?.realEstate?.builtInYear).toBe(1998);
    });

    it("remembers what the token conveys, in the wording it was granted in", async () => {
      // The failure this guards against is silent: rights that do not survive a
      // reload leave an officer believing holders own something they do not.
      const asset = structuredAsset("asset-rights")
        .conveyRight("income", "Net rental income, quarterly, clause 7.2")
        .conveyRight("voting", "One token one vote, clause 12");
      await repo.save(asset);

      const loaded = await repo.findById("asset-rights");

      expect(loaded?.rights.conveys("income")).toBe(true);
      expect(loaded?.rights.noteFor("income")).toBe("Net rental income, quarterly, clause 7.2");
      expect(loaded?.rights.conveys("voting")).toBe(true);
      expect(loaded?.rights.conveys("use")).toBe(false);
    });

    it("restores an asset with neither profile nor rights as exactly that", async () => {
      // Not "empty because we lost it" — empty because nobody recorded it.
      await repo.save(structuredAsset("asset-bare"));

      const loaded = await repo.findById("asset-bare");

      expect(loaded?.realEstate).toBeUndefined();
      expect(loaded?.rights.isEstablished()).toBe(false);
    });

    // 3.3: who brought the asset. This contract has twice caught a new field
    // being saved by the domain and silently dropped by the repository.
    it("remembers the organisation that brought the asset", async () => {
      await repo.save(Asset.propose("asset-9", "Vanak Villa", "asset_backed", ORGANISATION_ID));

      expect((await repo.findById("asset-9"))?.organisationId).toBe(ORGANISATION_ID);
    });

    it("keeps a platform-onboarded asset without an organisation", async () => {
      // NULL is the true answer for an asset the platform onboarded itself, not
      // a value waiting to be filled in.
      await repo.save(Asset.propose("asset-10", "Platform Villa", "asset_backed"));

      expect((await repo.findById("asset-10"))?.organisationId).toBeUndefined();
    });

    it("carries the organisation across a state change", async () => {
      const asset = Asset.propose("asset-11", "Vanak Villa", "asset_backed", ORGANISATION_ID);
      await repo.save(asset.startStructuring());

      expect((await repo.findById("asset-11"))?.organisationId).toBe(ORGANISATION_ID);
    });

    it("lists_all_saved_assets", async () => {
      await repo.save(Asset.propose("asset-1", "One", "asset_backed"));
      await repo.save(Asset.propose("asset-2", "Two", "asset_backed"));

      const all = await repo.findAll();
      expect(all.map((a) => a.id).sort()).toEqual(["asset-1", "asset-2"]);
    });
  });
};
