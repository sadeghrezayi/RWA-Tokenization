import { describe, expect, it } from "vitest";
import { ProposeAsset } from "../../../src/application/assets/propose-asset.js";
import { StartStructuring } from "../../../src/application/assets/start-structuring.js";
import { AttachDossierDocument } from "../../../src/application/assets/attach-dossier-document.js";
import { RecordCustody } from "../../../src/application/assets/record-custody.js";
import { ConfirmChecklistItem } from "../../../src/application/assets/confirm-checklist-item.js";
import { ApproveAsset } from "../../../src/application/assets/approve-asset.js";
import { GetAsset, ListAssets } from "../../../src/application/assets/get-asset.js";
import { AssetNotFoundError, EmptyDocumentError } from "../../../src/application/assets/errors.js";
import { IncompleteDossierError } from "../../../src/domain/assets/errors.js";
import { REQUIRED_DOSSIER_KINDS } from "../../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../../src/domain/assets/onboarding-checklist.js";
import { SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import {
  FakeDocumentStore,
  InMemoryAssetRepository,
  RecordingAssetEventLog,
} from "../../fakes/asset-fakes.js";

const ACTOR = "officer-1";
const CONTENT = Buffer.from("deed scan bytes").toString("base64");

const setup = () => {
  const assets = new InMemoryAssetRepository();
  const documents = new FakeDocumentStore();
  const events = new RecordingAssetEventLog();
  return {
    assets,
    documents,
    events,
    propose: new ProposeAsset(assets, new SequentialIdGenerator(), events),
    startStructuring: new StartStructuring(assets, events),
    attach: new AttachDossierDocument(assets, documents, events),
    recordCustody: new RecordCustody(assets, events),
    confirmItem: new ConfirmChecklistItem(assets, events),
    approve: new ApproveAsset(assets, events),
    getAsset: new GetAsset(assets),
    listAssets: new ListAssets(assets),
  };
};

const structureFully = async (s: ReturnType<typeof setup>) => {
  const { assetId } = await s.propose.execute({
    name: "Pilot Real Estate SPV",
    actor: ACTOR,
  });
  await s.startStructuring.execute({ assetId, actor: ACTOR });
  for (const kind of REQUIRED_DOSSIER_KINDS) {
    await s.attach.execute({
      assetId,
      kind,
      title: `${kind} document`,
      contentBase64: CONTENT,
      actor: ACTOR,
    });
  }
  await s.recordCustody.execute({
    assetId,
    custodianName: "Trust Co.",
    location: "Vault 12, Tehran",
    actor: ACTOR,
  });
  for (const item of CHECKLIST_ITEMS) {
    await s.confirmItem.execute({ assetId, item, actor: ACTOR });
  }
  return assetId;
};

describe("Asset onboarding flow (FR-AO)", () => {
  it("walks_propose_to_approved_with_documents_custody_and_checklist", async () => {
    const s = setup();
    const assetId = await structureFully(s);

    await s.approve.execute({ assetId, actor: ACTOR });

    const view = await s.getAsset.execute({ assetId });
    expect(view.state).toBe("approved");
    expect(view.dossier.complete).toBe(true);
    expect(view.dossier.documents).toHaveLength(REQUIRED_DOSSIER_KINDS.length);
    expect(view.custody).toEqual({ custodianName: "Trust Co.", location: "Vault 12, Tehran" });
    expect(view.checklist.unconfirmed).toEqual([]);
  });

  it("stores_document_content_and_returns_cid_plus_real_sha256", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "SPV", actor: ACTOR });

    const receipt = await s.attach.execute({
      assetId,
      kind: "ownership_evidence",
      title: "Title deed",
      contentBase64: CONTENT,
      actor: ACTOR,
    });

    expect(receipt.cid).toBe("fake-cid-1");
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    const view = await s.getAsset.execute({ assetId });
    expect(view.dossier.documents[0]).toMatchObject({
      kind: "ownership_evidence",
      cid: "fake-cid-1",
    });
  });

  it("rejects_empty_document_content", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "SPV", actor: ACTOR });

    await expect(
      s.attach.execute({
        assetId,
        kind: "ownership_evidence",
        title: "Empty",
        contentBase64: "",
        actor: ACTOR,
      }),
    ).rejects.toThrow(EmptyDocumentError);
  });

  it("propagates_the_domain_approval_gate", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "SPV", actor: ACTOR });
    await s.startStructuring.execute({ assetId, actor: ACTOR });
    for (const item of CHECKLIST_ITEMS) {
      await s.confirmItem.execute({ assetId, item, actor: ACTOR });
    }

    await expect(s.approve.execute({ assetId, actor: ACTOR })).rejects.toThrow(
      IncompleteDossierError,
    );
    expect((await s.getAsset.execute({ assetId })).state).toBe("in_structuring");
  });

  it("throws_for_an_unknown_asset", async () => {
    const s = setup();
    await expect(s.getAsset.execute({ assetId: "missing" })).rejects.toThrow(AssetNotFoundError);
    await expect(s.approve.execute({ assetId: "missing", actor: ACTOR })).rejects.toThrow(
      AssetNotFoundError,
    );
  });

  it("lists_all_assets_as_views", async () => {
    const s = setup();
    await s.propose.execute({ name: "SPV One", actor: ACTOR });
    await s.propose.execute({ name: "SPV Two", actor: ACTOR });

    const views = await s.listAssets.execute();
    expect(views.map((v) => v.name).sort()).toEqual(["SPV One", "SPV Two"]);
    expect(views.every((v) => v.state === "proposed")).toBe(true);
  });

  // FR-AO-5: every transition is audit-logged with its actor.
  it("appends_an_audit_event_for_every_action", async () => {
    const s = setup();
    const assetId = await structureFully(s);
    await s.approve.execute({ assetId, actor: ACTOR });

    const names = s.events.events.map((e) => e.event);
    expect(names[0]).toBe("asset_proposed");
    expect(names).toContain("structuring_started");
    expect(names.filter((n) => n === "document_attached")).toHaveLength(
      REQUIRED_DOSSIER_KINDS.length,
    );
    expect(names).toContain("custody_recorded");
    expect(names.filter((n) => n === "checklist_item_confirmed")).toHaveLength(
      CHECKLIST_ITEMS.length,
    );
    expect(names.at(-1)).toBe("asset_approved");
    expect(s.events.events.every((e) => e.actor === ACTOR && e.assetId === assetId)).toBe(true);
  });
});
