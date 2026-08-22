import { describe, expect, it } from "vitest";
import { ProposeAsset } from "../../../src/application/assets/propose-asset.js";
import { StartStructuring } from "../../../src/application/assets/start-structuring.js";
import { AttachDossierDocument } from "../../../src/application/assets/attach-dossier-document.js";
import { RecordCustody } from "../../../src/application/assets/record-custody.js";
import { ConfirmChecklistItem } from "../../../src/application/assets/confirm-checklist-item.js";
import { ApproveAsset } from "../../../src/application/assets/approve-asset.js";
import { ReviewDossierDocument } from "../../../src/application/assets/review-dossier-document.js";
import {
  GetAsset,
  ListAssets,
  ListIssuerAssets,
} from "../../../src/application/assets/get-asset.js";
import { AttachIssuerDocument } from "../../../src/application/assets/attach-issuer-document.js";
import { MAX_DOSSIER_BYTES } from "../../../src/application/assets/attach-dossier-document.js";
import { DossierDocumentTooLargeError } from "../../../src/application/assets/errors.js";
import { AssetNotBroughtByOrganisationError } from "../../../src/application/assets/errors.js";
import {
  AssetNotFoundError,
  EmptyDocumentError,
  IssuerCannotSubmitAssetsError,
} from "../../../src/application/assets/errors.js";
import { IncompleteDossierError } from "../../../src/domain/assets/errors.js";
import { REQUIRED_DOSSIER_KINDS } from "../../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../../src/domain/assets/onboarding-checklist.js";
import { SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { InMemoryIssuerRepository } from "../../fakes/issuer-fakes.js";
import { IssuerOrganisation } from "../../../src/domain/issuers/issuer-organisation.js";
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
  const issuers = new InMemoryIssuerRepository();
  return {
    assets,
    documents,
    events,
    issuers,
    propose: new ProposeAsset(assets, new SequentialIdGenerator(), events, issuers),
    startStructuring: new StartStructuring(assets, events),
    attach: new AttachDossierDocument(assets, documents, events),
    recordCustody: new RecordCustody(assets, events),
    confirmItem: new ConfirmChecklistItem(assets, events),
    approve: new ApproveAsset(assets, events),
    reviewDocument: new ReviewDossierDocument(assets, events, {
      now: () => new Date("2026-08-22T10:00:00.000Z"),
    }),
    getAsset: new GetAsset(assets, issuers),
    listAssets: new ListAssets(assets, issuers),
    listIssuerAssets: new ListIssuerAssets(assets, issuers),
    attachAsIssuer: new AttachIssuerDocument(
      assets,
      new AttachDossierDocument(assets, documents, events),
    ),
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
    // 4.3: attaching is no longer enough to reach approval — someone has to
    // have read each document and accepted it.
    await s.reviewDocument.accept({ assetId, kind, actor: ACTOR });
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

// 3.3: an asset may be brought by an approved issuer. This is where
// IssuerOrganisation.canSubmitAssets() finally decides something: an
// organisation that has not been approved — or has been suspended — cannot have
// assets submitted in its name.
describe("Proposing an asset for an issuer", () => {
  const APPLIED_AT = new Date("2026-08-01T09:00:00Z");
  const DECIDED_AT = new Date("2026-08-02T09:00:00Z");

  const organisation = () =>
    IssuerOrganisation.apply({
      id: "org-1",
      legalName: "Vanak Property Holdings PJSC",
      registrationNumber: "IR-448120",
      contactEmail: "ops@vanak.example",
      appliedAt: APPLIED_AT,
    });

  // K-33: the dossier is the evidence a token is backed by anything. A document
  // that is too large to be a document, or empty, must be refused rather than
  // stored — six placeholder-sized files marking a dossier "complete" is how an
  // asset gets approved with nothing behind it.
  it("refuses a document larger than the platform accepts", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "Villa", actor: ACTOR });
    await s.startStructuring.execute({ assetId, actor: ACTOR });

    await expect(
      s.attach.execute({
        assetId,
        kind: "ownership_evidence",
        title: "A deed the size of a film",
        contentBase64: Buffer.alloc(MAX_DOSSIER_BYTES + 1).toString("base64"),
        actor: ACTOR,
      }),
    ).rejects.toThrow(DossierDocumentTooLargeError);
  });

  it("accepts a document at exactly the limit", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "Villa", actor: ACTOR });
    await s.startStructuring.execute({ assetId, actor: ACTOR });

    const stored = await s.attach.execute({
      assetId,
      kind: "ownership_evidence",
      title: "Right to the byte",
      contentBase64: Buffer.alloc(MAX_DOSSIER_BYTES).toString("base64"),
      actor: ACTOR,
    });

    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records which organisation brought it", async () => {
    const s = setup();
    await s.issuers.save(organisation().startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"));

    const { assetId } = await s.propose.execute({
      name: "Villa",
      actor: ACTOR,
      organisationId: "org-1",
    });

    expect((await s.assets.findById(assetId))?.organisationId).toBe("org-1");
  });

  it("still lets the platform onboard an asset itself", async () => {
    // Every pilot asset is staff-onboarded; no organisation is not an error.
    const s = setup();

    const { assetId } = await s.propose.execute({ name: "Villa", actor: ACTOR });

    expect((await s.assets.findById(assetId))?.organisationId).toBeUndefined();
  });

  it("refuses an organisation the platform has not approved", async () => {
    const s = setup();
    await s.issuers.save(organisation());

    await expect(
      s.propose.execute({ name: "Villa", actor: ACTOR, organisationId: "org-1" }),
    ).rejects.toThrow(IssuerCannotSubmitAssetsError);

    expect(await s.assets.findAll()).toEqual([]);
  });

  it("refuses a suspended organisation", async () => {
    // Suspension has to bite here, not at the next submission.
    const s = setup();
    await s.issuers.save(
      organisation()
        .startReview(DECIDED_AT)
        .approve(DECIDED_AT, "officer-1")
        .suspend(DECIDED_AT, "officer-2", "under investigation"),
    );

    await expect(
      s.propose.execute({ name: "Villa", actor: ACTOR, organisationId: "org-1" }),
    ).rejects.toThrow(IssuerCannotSubmitAssetsError);
  });

  it("refuses an organisation that does not exist", async () => {
    const s = setup();

    await expect(
      s.propose.execute({ name: "Villa", actor: ACTOR, organisationId: "ghost" }),
    ).rejects.toThrow();
  });

  // An officer reading an asset needs to know WHO brought it. "org-1" answers
  // nothing; the legal name is what they check against a registry.
  it("names the organisation on the asset, not its id", async () => {
    const s = setup();
    await s.issuers.save(organisation().startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"));
    const { assetId } = await s.propose.execute({
      name: "Villa",
      actor: ACTOR,
      organisationId: "org-1",
    });

    const view = await s.getAsset.execute({ assetId });

    expect(view.organisationId).toBe("org-1");
    expect(view.organisationName).toBe("Vanak Property Holdings PJSC");
  });

  it("says nothing about an organisation when the platform onboarded the asset", async () => {
    const s = setup();
    const { assetId } = await s.propose.execute({ name: "Villa", actor: ACTOR });

    const view = await s.getAsset.execute({ assetId });

    expect(view.organisationId).toBeUndefined();
    expect(view.organisationName).toBeUndefined();
  });

  it("names organisations across a list with one lookup each", async () => {
    const s = setup();
    await s.issuers.save(organisation().startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"));
    await s.propose.execute({ name: "One", actor: ACTOR, organisationId: "org-1" });
    await s.propose.execute({ name: "Two", actor: ACTOR, organisationId: "org-1" });

    const views = await s.listAssets.execute();

    expect(views.every((v) => v.organisationName === "Vanak Property Holdings PJSC")).toBe(true);
  });
});

// 3.3f: an issuer's own view of the assets it brought. Staff read every asset;
// an issuer must read exactly the ones belonging to its organisation and
// nothing else — this is a confidentiality boundary, not a convenience filter.
describe("ListIssuerAssets", () => {
  const approvedOrganisation = (id: string) =>
    IssuerOrganisation.apply({
      id,
      legalName: `Holdings ${id}`,
      registrationNumber: `IR-${id}`,
      contactEmail: `ops-${id}@vanak.example`,
      appliedAt: new Date("2026-08-01T09:00:00Z"),
    })
      .startReview(new Date("2026-08-02T09:00:00Z"))
      .approve(new Date("2026-08-02T09:00:00Z"), "officer-1");

  it("returns only the assets of the organisation asked about", async () => {
    const app = setup();
    await app.issuers.save(approvedOrganisation("org-1"));
    await app.issuers.save(approvedOrganisation("org-2"));
    await app.propose.execute({ name: "Mine", actor: ACTOR, organisationId: "org-1" });
    await app.propose.execute({ name: "Theirs", actor: ACTOR, organisationId: "org-2" });
    await app.propose.execute({ name: "The platform's", actor: ACTOR });

    const mine = await app.listIssuerAssets.execute({ organisationId: "org-1" });

    expect(mine.map((asset) => asset.name)).toEqual(["Mine"]);
  });

  it("never leaks the assets the platform onboarded itself", async () => {
    const app = setup();
    await app.issuers.save(approvedOrganisation("org-1"));
    await app.propose.execute({ name: "The platform's", actor: ACTOR });

    const mine = await app.listIssuerAssets.execute({ organisationId: "org-1" });

    // A NULL organisation means the platform brought it. It belongs to nobody
    // else, and must not fall into an issuer's list by accident.
    expect(mine).toEqual([]);
  });

  it("describes each asset exactly as every other reader sees it", async () => {
    const app = setup();
    await app.issuers.save(approvedOrganisation("org-1"));
    const { assetId } = await app.propose.execute({
      name: "Vanak Tower Floor 7",
      actor: ACTOR,
      organisationId: "org-1",
    });

    const [mine] = await app.listIssuerAssets.execute({ organisationId: "org-1" });

    expect(mine?.id).toBe(assetId);
    expect(mine?.state).toBe("proposed");
    expect(mine?.organisationId).toBe("org-1");
    expect(mine?.organisationName).toBe("Holdings org-1");
  });

  it("returns nothing for an organisation that has brought nothing yet", async () => {
    const app = setup();
    await app.issuers.save(approvedOrganisation("org-1"));

    expect(await app.listIssuerAssets.execute({ organisationId: "org-1" })).toEqual([]);
  });
});

// 3.3i: an issuer can see "Missing: 6" on the asset it brought, and until now
// could do nothing about it — only staff could attach a dossier document. The
// documents, the kinds and the rules are unchanged; what is new is that the
// organisation which brought the asset can supply them.
describe("AttachIssuerDocument", () => {
  const approvedOrg = (id: string) =>
    IssuerOrganisation.apply({
      id,
      legalName: `Holdings ${id}`,
      registrationNumber: `IR-${id}`,
      contactEmail: `ops-${id}@vanak.example`,
      appliedAt: new Date("2026-08-01T09:00:00Z"),
    })
      .startReview(new Date("2026-08-02T09:00:00Z"))
      .approve(new Date("2026-08-02T09:00:00Z"), "officer-1");

  const brought = async (app: ReturnType<typeof setup>, organisationId: string) => {
    await app.issuers.save(approvedOrg(organisationId));
    const { assetId } = await app.propose.execute({
      name: `Asset for ${organisationId}`,
      actor: ACTOR,
      organisationId,
    });
    return assetId;
  };

  it("lets the organisation that brought an asset supply its dossier", async () => {
    const app = setup();
    const assetId = await brought(app, "org-1");

    const stored = await app.attachAsIssuer.execute({
      organisationId: "org-1",
      assetId,
      kind: "ownership_evidence",
      title: "Title deed",
      contentBase64: CONTENT,
      actor: "issuer-person-1",
    });

    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const asset = await app.assets.findById(assetId);
    expect(asset?.dossier.missingKinds()).not.toContain("ownership_evidence");
  });

  // The security boundary: holding a membership somewhere is not permission to
  // put documents on somebody else's asset.
  it("refuses an asset another organisation brought", async () => {
    const app = setup();
    await app.issuers.save(approvedOrg("org-1"));
    const theirs = await brought(app, "org-2");

    await expect(
      app.attachAsIssuer.execute({
        organisationId: "org-1",
        assetId: theirs,
        kind: "ownership_evidence",
        title: "Not mine to file",
        contentBase64: CONTENT,
        actor: "issuer-person-1",
      }),
    ).rejects.toThrow(AssetNotBroughtByOrganisationError);
  });

  it("refuses an asset the platform brought itself", async () => {
    const app = setup();
    await app.issuers.save(approvedOrg("org-1"));
    const { assetId } = await app.propose.execute({ name: "Platform's own", actor: ACTOR });

    await expect(
      app.attachAsIssuer.execute({
        organisationId: "org-1",
        assetId,
        kind: "ownership_evidence",
        title: "Not mine either",
        contentBase64: CONTENT,
        actor: "issuer-person-1",
      }),
    ).rejects.toThrow(AssetNotBroughtByOrganisationError);
  });
});
