import { beforeEach, describe, expect, it } from "vitest";
import { ListDocumentsAwaitingReview } from "../../../src/application/assets/list-documents-awaiting-review.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { DossierDocument } from "../../../src/domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../../src/domain/assets/legal-dossier.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";

const AT = new Date("2026-08-22T10:00:00.000Z");

const doc = (kind: DossierDocumentKind) =>
  DossierDocument.of({ kind, title: `${kind} doc`, cid: `bafy-${kind}`, sha256: "a".repeat(64) });

describe("ListDocumentsAwaitingReview", () => {
  let assets: InMemoryAssetRepository;
  let list: ListDocumentsAwaitingReview;

  beforeEach(() => {
    assets = new InMemoryAssetRepository();
    list = new ListDocumentsAwaitingReview(assets);
  });

  const structuring = async (id: string, kinds: DossierDocumentKind[]) => {
    let asset = Asset.propose(id, `Asset ${id}`, "asset_backed").startStructuring();
    for (const kind of kinds) {
      asset = asset.attachDocument(doc(kind));
    }
    await assets.save(asset);
    return asset;
  };

  it("lists a document nobody has reviewed, naming the asset it belongs to", async () => {
    await structuring("asset-1", ["ownership_evidence"]);

    const queue = await list.execute();

    expect(queue).toHaveLength(1);
    expect(queue[0]?.assetId).toBe("asset-1");
    expect(queue[0]?.assetName).toBe("Asset asset-1");
    expect(queue[0]?.kind).toBe("ownership_evidence");
    expect(queue[0]?.state).toBe("pending");
  });

  it("keeps a REJECTED document in the queue — it is outstanding, not settled", async () => {
    const asset = await structuring("asset-1", ["ownership_evidence"]);
    await assets.save(
      asset.rejectDocument("ownership_evidence", {
        reviewer: "officer-1",
        at: AT,
        reason: "wrong parcel",
      }),
    );

    const queue = await list.execute();

    expect(queue).toHaveLength(1);
    expect(queue[0]?.state).toBe("rejected");
    // The reason travels, so the queue shows what the issuer was told.
    expect(queue[0]?.reason).toMatch(/wrong parcel/);
  });

  it("drops a document once it has been accepted", async () => {
    const asset = await structuring("asset-1", ["ownership_evidence"]);
    await assets.save(
      asset.acceptDocument("ownership_evidence", { reviewer: "officer-1", at: AT }),
    );

    expect(await list.execute()).toEqual([]);
  });

  it("leaves out assets whose dossier is already frozen", async () => {
    // An approved asset's documents were all accepted to get there, and its
    // dossier cannot change — listing them would be busywork that never clears.
    let asset = Asset.propose("asset-2", "Approved", "asset_backed").startStructuring();
    for (const kind of [
      "ownership_evidence",
      "spv_structure",
      "right_definition",
      "valuation_report",
      "counsel_signoff",
      "custody_agreement",
    ] as const) {
      asset = asset.attachDocument(doc(kind)).acceptDocument(kind, { reviewer: "o", at: AT });
    }
    await assets.save(asset);

    expect(await list.execute()).toEqual([]);
  });

  it("puts the longest-waiting asset first, so nothing sits unnoticed", async () => {
    await structuring("asset-1", ["ownership_evidence", "spv_structure"]);
    await structuring("asset-2", ["valuation_report"]);

    const queue = await list.execute();

    expect(queue).toHaveLength(3);
    expect(queue.map((row) => row.kind)).toEqual([
      "ownership_evidence",
      "spv_structure",
      "valuation_report",
    ]);
  });
});
