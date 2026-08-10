import { beforeEach, describe, expect, it } from "vitest";
import { SetDocumentVisibility } from "../../../src/application/assets/set-document-visibility.js";
import { GetMyAssetDocuments } from "../../../src/application/assets/get-my-asset-documents.js";
import { NoPositionInAssetError } from "../../../src/application/assets/errors.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { DossierDocument, LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";

const SHA = "a".repeat(64);

const document = (kind: "valuation_report" | "counsel_signoff", visible = false) =>
  DossierDocument.of({
    kind,
    title: kind === "valuation_report" ? "Valuation report" : "Counsel sign-off",
    cid: `Qm${kind}`,
    sha256: SHA,
    investorVisible: visible,
  });

const tokenizedAsset = (documents: DossierDocument[]) =>
  Asset.restore({
    id: "asset-1",
    name: "Vanak Tower SPV",
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.restore(documents),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: "0xToken1",
  });

// Positions the read model is told about, standing in for the sales read model.
const positions = new Map<string, string[]>();
const positionsIn = {
  execute: async (input: { investorId: string }) =>
    Promise.resolve({ assetIds: positions.get(input.investorId) ?? [] }),
};

let assets: InMemoryAssetRepository;
let events: { appended: unknown[]; append: (entry: unknown) => Promise<void> };

beforeEach(() => {
  assets = new InMemoryAssetRepository();
  positions.clear();
  const appended: unknown[] = [];
  events = {
    appended,
    append: async (entry: unknown) => {
      appended.push(entry);
      return Promise.resolve();
    },
  };
});

describe("SetDocumentVisibility", () => {
  it("reveals a document and records WHO decided it", async () => {
    // A disclosure is a decision someone made; it has to be attributable.
    await assets.save(tokenizedAsset([document("valuation_report")]));
    const useCase = new SetDocumentVisibility(assets, events);

    await useCase.execute({
      assetId: "asset-1",
      kind: "valuation_report",
      visible: true,
      actor: "officer-1",
    });

    const saved = await assets.findById("asset-1");
    expect(saved?.dossier.investorVisibleDocuments().map((d) => d.kind)).toEqual([
      "valuation_report",
    ]);
    expect(events.appended).toEqual([
      {
        assetId: "asset-1",
        event: "document_visibility_changed",
        actor: "officer-1",
        details: { kind: "valuation_report", investorVisible: "true" },
      },
    ]);
  });

  it("records taking a disclosure back just as loudly", async () => {
    await assets.save(tokenizedAsset([document("valuation_report", true)]));
    const useCase = new SetDocumentVisibility(assets, events);

    await useCase.execute({
      assetId: "asset-1",
      kind: "valuation_report",
      visible: false,
      actor: "officer-2",
    });

    const saved = await assets.findById("asset-1");
    expect(saved?.dossier.investorVisibleDocuments()).toEqual([]);
    expect(events.appended).toHaveLength(1);
  });
});

describe("GetMyAssetDocuments", () => {
  it("shows a holder only the documents that were deliberately revealed", async () => {
    await assets.save(
      tokenizedAsset([document("valuation_report", true), document("counsel_signoff")]),
    );
    positions.set("sara", ["asset-1"]);
    const useCase = new GetMyAssetDocuments(assets, positionsIn);

    const documents = await useCase.execute({ investorId: "sara", assetId: "asset-1" });

    expect(documents.map((d) => d.kind)).toEqual(["valuation_report"]);
    // The hidden one leaks nothing — not even its existence.
    expect(JSON.stringify(documents)).not.toContain("counsel_signoff");
  });

  it("refuses someone with no position in the asset", async () => {
    // Holding the token is what earns the documents; being logged in is not.
    await assets.save(tokenizedAsset([document("valuation_report", true)]));
    positions.set("bob", ["asset-other"]);
    const useCase = new GetMyAssetDocuments(assets, positionsIn);

    await expect(useCase.execute({ investorId: "bob", assetId: "asset-1" })).rejects.toThrow(
      NoPositionInAssetError,
    );
  });

  it("returns an empty list when a holder's asset has nothing published yet", async () => {
    // Distinct from being refused: they are entitled to look, there is nothing there.
    await assets.save(tokenizedAsset([document("valuation_report")]));
    positions.set("sara", ["asset-1"]);
    const useCase = new GetMyAssetDocuments(assets, positionsIn);

    expect(await useCase.execute({ investorId: "sara", assetId: "asset-1" })).toEqual([]);
  });
});
