import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, DOCUMENT_STORE, TOKEN_DEPLOYER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { REQUIRED_DOSSIER_KINDS } from "../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../src/domain/assets/onboarding-checklist.js";
import { FakeDocumentStore, RecordingTokenDeployer } from "../fakes/asset-fakes.js";

const CONTENT = Buffer.from("pilot deed bytes").toString("base64");

describe("Assets API (e2e, real Postgres, fake document store)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  let investorToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_STORE)
      .useValue(new FakeDocumentStore())
      .overrideProvider(TOKEN_DEPLOYER)
      .useValue(new RecordingTokenDeployer())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const officer = await request(server)
      .post("/auth/officer/login")
      .send({ email: "officer@platform.local", password: "officer-dev-pass" })
      .expect(200);
    officerToken = (officer.body as { token: string }).token;

    await prisma.onchainIdentity.deleteMany();
    await prisma.investor.deleteMany();
    await request(server)
      .post("/investors")
      .send({ email: "inv@example.com", password: "s3cure-pass" })
      .expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: "inv@example.com", password: "s3cure-pass" })
      .expect(200);
    investorToken = (login.body as { token: string }).token;
  });

  beforeEach(async () => {
    await prisma.assetEvent.deleteMany();
    await prisma.assetDocument.deleteMany();
    await prisma.asset.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const propose = async (): Promise<string> => {
    const res = await request(server)
      .post("/assets")
      .set(auth(officerToken))
      .send({ name: "Pilot Real Estate SPV" })
      .expect(201);
    return (res.body as { assetId: string }).assetId;
  };

  // 3.1: the property a token is issued against, and what it conveys. Both are
  // recorded by an officer while the asset is being structured.
  describe("real-estate profile and rights", () => {
    const profile = {
      addressLine: "Plot 14, Vanak Street",
      city: "Tehran",
      propertyType: "residential",
      areaSquareMetres: 240,
      titleReference: "TR-1990-4471",
      builtInYear: 1998,
    };

    const structuring = async (): Promise<string> => {
      const assetId = await propose();
      await request(server)
        .post(`/assets/${assetId}/start-structuring`)
        .set(auth(officerToken))
        .expect(204);
      return assetId;
    };

    it("records the property and reads it back on the asset", async () => {
      const assetId = await structuring();

      await request(server)
        .post(`/assets/${assetId}/real-estate`)
        .set(auth(officerToken))
        .send(profile)
        .expect(204);

      const res = await request(server)
        .get(`/assets/${assetId}`)
        .set(auth(officerToken))
        .expect(200);
      const body = res.body as { realEstate?: { titleReference: string; city: string } };
      expect(body.realEstate?.titleReference).toBe("TR-1990-4471");
      expect(body.realEstate?.city).toBe("Tehran");
    });

    it("refuses a property with no title reference (400)", async () => {
      const assetId = await structuring();

      await request(server)
        .post(`/assets/${assetId}/real-estate`)
        .set(auth(officerToken))
        .send({ ...profile, titleReference: "  " })
        .expect(400);
    });

    it("conveys a right with the wording it was granted in", async () => {
      const assetId = await structuring();

      await request(server)
        .post(`/assets/${assetId}/rights/income`)
        .set(auth(officerToken))
        .send({ note: "Net rental income, quarterly, clause 7.2" })
        .expect(204);

      const res = await request(server)
        .get(`/assets/${assetId}`)
        .set(auth(officerToken))
        .expect(200);
      const body = res.body as { rights: { kind: string; note: string }[] };
      expect(body.rights).toEqual([
        { kind: "income", note: "Net rental income, quarterly, clause 7.2" },
      ]);
    });

    it("withdraws a right", async () => {
      const assetId = await structuring();
      await request(server)
        .post(`/assets/${assetId}/rights/income`)
        .set(auth(officerToken))
        .send({ note: "clause 7.2" })
        .expect(204);

      await request(server)
        .delete(`/assets/${assetId}/rights/income`)
        .set(auth(officerToken))
        .expect(204);

      const res = await request(server).get(`/assets/${assetId}`).set(auth(officerToken));
      expect((res.body as { rights: unknown[] }).rights).toEqual([]);
    });

    it("refuses a right with no wording (400) and an unknown right (400)", async () => {
      const assetId = await structuring();

      await request(server)
        .post(`/assets/${assetId}/rights/income`)
        .set(auth(officerToken))
        .send({ note: "   " })
        .expect(400);
      await request(server)
        .post(`/assets/${assetId}/rights/timeshare_weeks`)
        .set(auth(officerToken))
        .send({ note: "invented" })
        .expect(400);
    });

    it("freezes both once the asset is approved (409)", async () => {
      // What a holder owns must not change quietly after they own it.
      const assetId = await propose();
      const http = request(server);
      await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken));
      for (const kind of REQUIRED_DOSSIER_KINDS) {
        await http
          .post(`/assets/${assetId}/documents`)
          .set(auth(officerToken))
          .send({ kind, title: kind, contentBase64: CONTENT });
      }
      await http
        .post(`/assets/${assetId}/custody`)
        .set(auth(officerToken))
        .send({ custodianName: "Trust Co.", location: "Vault 1" });
      for (const item of CHECKLIST_ITEMS) {
        await http.post(`/assets/${assetId}/checklist/${item}`).set(auth(officerToken));
      }
      await http.post(`/assets/${assetId}/approve`).set(auth(officerToken)).expect(204);

      await request(server)
        .post(`/assets/${assetId}/real-estate`)
        .set(auth(officerToken))
        .send(profile)
        .expect(409);
      await request(server)
        .post(`/assets/${assetId}/rights/income`)
        .set(auth(officerToken))
        .send({ note: "too late" })
        .expect(409);
    });

    it("keeps an investor away from both (403)", async () => {
      const assetId = await structuring();

      await request(server)
        .post(`/assets/${assetId}/real-estate`)
        .set(auth(investorToken))
        .send(profile)
        .expect(403);
      await request(server)
        .post(`/assets/${assetId}/rights/income`)
        .set(auth(investorToken))
        .send({ note: "mine now" })
        .expect(403);
    });
  });

  // 2.5d: an operator decides, one document at a time, what a HOLDER may read.
  // The rules that matter here are who may flip the switch and who may read the
  // result.
  describe("investor document disclosure", () => {
    const attach = async (assetId: string) => {
      await request(server).post(`/assets/${assetId}/start-structuring`).set(auth(officerToken));
      await request(server)
        .post(`/assets/${assetId}/documents`)
        .set(auth(officerToken))
        .send({ kind: "valuation_report", title: "Valuation report", contentBase64: CONTENT })
        .expect(201);
    };

    it("lets an operator reveal and withdraw a document", async () => {
      const assetId = await propose();
      await attach(assetId);

      await request(server)
        .post(`/assets/${assetId}/documents/valuation_report/visibility`)
        .set(auth(officerToken))
        .send({ visible: true })
        .expect(204);

      const revealed = await request(server)
        .get(`/assets/${assetId}`)
        .set(auth(officerToken))
        .expect(200);
      expect(
        (revealed.body as { dossier: { documents: { investorVisible: boolean }[] } }).dossier
          .documents[0]?.investorVisible,
      ).toBe(true);

      await request(server)
        .post(`/assets/${assetId}/documents/valuation_report/visibility`)
        .set(auth(officerToken))
        .send({ visible: false })
        .expect(204);
    });

    it("keeps an investor away from the switch (403)", async () => {
      const assetId = await propose();
      await attach(assetId);

      await request(server)
        .post(`/assets/${assetId}/documents/valuation_report/visibility`)
        .set(auth(investorToken))
        .send({ visible: true })
        .expect(403);
    });

    it("refuses to reveal a kind the dossier does not hold (409)", async () => {
      const assetId = await propose();
      await attach(assetId);

      await request(server)
        .post(`/assets/${assetId}/documents/counsel_signoff/visibility`)
        .set(auth(officerToken))
        .send({ visible: true })
        .expect(409);
    });

    it("refuses an unknown document kind (400)", async () => {
      const assetId = await propose();
      await request(server)
        .post(`/assets/${assetId}/documents/not_a_kind/visibility`)
        .set(auth(officerToken))
        .send({ visible: true })
        .expect(400);
    });

    it("will not hand documents to someone with no position in the asset (403)", async () => {
      // Holding the token earns the documents; being signed in does not.
      const assetId = await propose();
      await attach(assetId);
      await request(server)
        .post(`/assets/${assetId}/documents/valuation_report/visibility`)
        .set(auth(officerToken))
        .send({ visible: true })
        .expect(204);

      await request(server)
        .get(`/portfolio/assets/${assetId}/documents`)
        .set(auth(investorToken))
        .expect(403);
    });

    it("requires authentication to read them at all (401)", async () => {
      const assetId = await propose();
      await request(server).get(`/portfolio/assets/${assetId}/documents`).expect(401);
    });
  });

  it("rejects_asset_actions_without_a_token_and_for_investors", async () => {
    await request(server).post("/assets").send({ name: "X" }).expect(401);
    await request(server).post("/assets").set(auth(investorToken)).send({ name: "X" }).expect(403);
    await request(server).get("/assets").set(auth(investorToken)).expect(403);
  });

  it("walks_the_full_onboarding_flow_to_approved", async () => {
    const assetId = await propose();
    const http = request(server);

    await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken)).expect(204);
    for (const kind of REQUIRED_DOSSIER_KINDS) {
      await http
        .post(`/assets/${assetId}/documents`)
        .set(auth(officerToken))
        .send({ kind, title: `${kind} doc`, contentBase64: CONTENT })
        .expect(201);
    }
    await http
      .post(`/assets/${assetId}/custody`)
      .set(auth(officerToken))
      .send({ custodianName: "Trust Co.", location: "Vault 12, Tehran" })
      .expect(204);
    for (const item of CHECKLIST_ITEMS) {
      await http.post(`/assets/${assetId}/checklist/${item}`).set(auth(officerToken)).expect(204);
    }
    await http.post(`/assets/${assetId}/approve`).set(auth(officerToken)).expect(204);

    const res = await http.get(`/assets/${assetId}`).set(auth(officerToken)).expect(200);
    const view = res.body as {
      state: string;
      dossier: { complete: boolean };
      custody: { custodianName: string };
    };
    expect(view.state).toBe("approved");
    expect(view.dossier.complete).toBe(true);
    expect(view.custody.custodianName).toBe("Trust Co.");

    const events = await prisma.assetEvent.findMany({ where: { assetId } });
    expect(events.map((e) => e.event)).toContain("asset_approved");
    expect(events).toHaveLength(2 + REQUIRED_DOSSIER_KINDS.length + CHECKLIST_ITEMS.length + 1 + 1);
  });

  it("tokenizes_an_approved_asset_and_rejects_early_tokenization", async () => {
    const assetId = await propose();
    const http = request(server);

    await http
      .post(`/assets/${assetId}/tokenize`)
      .set(auth(officerToken))
      .send({ symbol: "PRES" })
      .expect(409);

    await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken)).expect(204);
    for (const kind of REQUIRED_DOSSIER_KINDS) {
      await http
        .post(`/assets/${assetId}/documents`)
        .set(auth(officerToken))
        .send({ kind, title: `${kind} doc`, contentBase64: CONTENT })
        .expect(201);
    }
    await http
      .post(`/assets/${assetId}/custody`)
      .set(auth(officerToken))
      .send({ custodianName: "Trust Co.", location: "Vault 12" })
      .expect(204);
    for (const item of CHECKLIST_ITEMS) {
      await http.post(`/assets/${assetId}/checklist/${item}`).set(auth(officerToken)).expect(204);
    }
    await http.post(`/assets/${assetId}/approve`).set(auth(officerToken)).expect(204);

    await http
      .post(`/assets/${assetId}/tokenize`)
      .set(auth(officerToken))
      .send({ symbol: "invalid lower" })
      .expect(400);

    const res = await http
      .post(`/assets/${assetId}/tokenize`)
      .set(auth(officerToken))
      .send({ symbol: "PRES" })
      .expect(201);
    expect((res.body as { tokenAddress: string }).tokenAddress).toBe("0xDeployed1");

    const view = await http.get(`/assets/${assetId}`).set(auth(officerToken)).expect(200);
    expect(view.body).toMatchObject({ state: "tokenized", tokenAddress: "0xDeployed1" });

    const events = await prisma.assetEvent.findMany({ where: { assetId } });
    expect(events.map((e) => e.event)).toContain("asset_tokenized");
  });

  it("returns_409_with_missing_items_when_approving_too_early", async () => {
    const assetId = await propose();
    const http = request(server);
    await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken)).expect(204);

    const res = await http.post(`/assets/${assetId}/approve`).set(auth(officerToken)).expect(409);
    expect((res.body as { message: string }).message).toMatch(/ownership_evidence/);
  });

  it("rejects_unknown_document_kind_and_checklist_item_with_400", async () => {
    const assetId = await propose();
    const http = request(server);
    await http
      .post(`/assets/${assetId}/documents`)
      .set(auth(officerToken))
      .send({ kind: "selfie", title: "x", contentBase64: CONTENT })
      .expect(400);
    await http.post(`/assets/${assetId}/checklist/vibes_good`).set(auth(officerToken)).expect(400);
  });

  it("returns_404_for_an_unknown_asset", async () => {
    await request(server).get("/assets/nope").set(auth(officerToken)).expect(404);
  });

  // 3.3: an asset brought by an issuer, over HTTP. The rule that matters is
  // that an organisation the platform has not approved is refused.
  describe("assets brought by an issuer", () => {
    const applyAndApprove = async (): Promise<string> => {
      const email = `issuer-asset-${randomUUID()}@example.com`;
      await request(server).post("/investors").send({ email, password: "s3cure-pass" }).expect(201);
      await prisma.investor.updateMany({
        where: { email: email.toLowerCase() },
        data: { kycState: "approved" },
      });
      const login = await request(server)
        .post("/auth/login")
        .send({ email, password: "s3cure-pass" })
        .expect(200);
      const applicant = (login.body as { token: string }).token;
      const applied = await request(server)
        .post("/issuers")
        .set({ authorization: `Bearer ${applicant}` })
        .send({
          legalName: "Vanak Property Holdings PJSC",
          registrationNumber: `IR-${randomUUID().slice(0, 8)}`,
          contactEmail: "ops@vanak.example",
        })
        .expect(201);
      return (applied.body as { organisationId: string }).organisationId;
    };

    it("names the issuer that brought the asset", async () => {
      const organisationId = await applyAndApprove();
      await request(server)
        .post(`/issuers/${organisationId}/start-review`)
        .set(auth(officerToken))
        .expect(204);
      await request(server)
        .post(`/issuers/${organisationId}/approve`)
        .set(auth(officerToken))
        .expect(204);

      const created = await request(server)
        .post("/assets")
        .set(auth(officerToken))
        .send({ name: "Vanak Villa", organisationId })
        .expect(201);
      const { assetId } = created.body as { assetId: string };

      const view = await request(server)
        .get(`/assets/${assetId}`)
        .set(auth(officerToken))
        .expect(200);
      const body = view.body as { organisationId?: string; organisationName?: string };
      expect(body.organisationId).toBe(organisationId);
      // The legal name, not the id — an officer checks it against a registry.
      expect(body.organisationName).toBe("Vanak Property Holdings PJSC");
    });

    it("refuses an organisation the platform has not approved (409)", async () => {
      const organisationId = await applyAndApprove();

      await request(server)
        .post("/assets")
        .set(auth(officerToken))
        .send({ name: "Premature Villa", organisationId })
        .expect(409);
    });

    it("still onboards an asset with no organisation at all", async () => {
      const created = await request(server)
        .post("/assets")
        .set(auth(officerToken))
        .send({ name: "Platform Villa" })
        .expect(201);
      const { assetId } = created.body as { assetId: string };

      const view = await request(server)
        .get(`/assets/${assetId}`)
        .set(auth(officerToken))
        .expect(200);
      expect((view.body as { organisationId?: string }).organisationId).toBeUndefined();
    });
  });
});
