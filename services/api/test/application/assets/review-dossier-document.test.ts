import { beforeEach, describe, expect, it } from "vitest";
import { ReviewDossierDocument } from "../../../src/application/assets/review-dossier-document.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { DossierDocument } from "../../../src/domain/assets/legal-dossier.js";
import { InMemoryAssetRepository, RecordingAssetEventLog } from "../../fakes/asset-fakes.js";

const AT = new Date("2026-08-22T10:00:00.000Z");

describe("ReviewDossierDocument", () => {
  let assets: InMemoryAssetRepository;
  let events: RecordingAssetEventLog;
  let review: ReviewDossierDocument;

  beforeEach(async () => {
    assets = new InMemoryAssetRepository();
    events = new RecordingAssetEventLog();
    review = new ReviewDossierDocument(assets, events, { now: () => AT });
    await assets.save(
      Asset.propose("asset-1", "Vanak Tower", "asset_backed")
        .startStructuring()
        .attachDocument(
          DossierDocument.of({
            kind: "ownership_evidence",
            title: "Title deed",
            cid: "bafy-1",
            sha256: "a".repeat(64),
          }),
        ),
    );
  });

  it("records an acceptance against the reviewer and writes it to the asset's log", async () => {
    await review.accept({ assetId: "asset-1", kind: "ownership_evidence", actor: "officer-1" });

    const stored = await assets.findById("asset-1");
    expect(stored?.dossier.documents[0]?.review.state).toBe("accepted");
    expect(stored?.dossier.documents[0]?.review.reviewedBy).toBe("officer-1");
    // The log is what a regulator reads: a decision with no trace is not one.
    expect(events.events.map((e) => e.event)).toContain("document_reviewed");
  });

  it("carries the rejection reason into the log, not just the fact of it", async () => {
    await review.reject({
      assetId: "asset-1",
      kind: "ownership_evidence",
      actor: "officer-1",
      reason: "the deed names a different parcel",
    });

    const logged = events.events.find((e) => e.event === "document_reviewed");
    expect(logged?.details?.decision).toBe("rejected");
    expect(logged?.details?.reason).toMatch(/different parcel/);
  });

  it("refuses a rejection with no reason, and changes nothing", async () => {
    await expect(
      review.reject({
        assetId: "asset-1",
        kind: "ownership_evidence",
        actor: "officer-1",
        reason: "   ",
      }),
    ).rejects.toThrow();

    const stored = await assets.findById("asset-1");
    expect(stored?.dossier.documents[0]?.review.state).toBe("pending");
    expect(events.events).toHaveLength(0);
  });
});
