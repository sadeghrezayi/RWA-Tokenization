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
});
