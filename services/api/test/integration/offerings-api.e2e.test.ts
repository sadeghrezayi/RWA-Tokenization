import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  AppModule,
  ASSET_TOKEN_ISSUER,
  CLAIM_ISSUER,
  CLOCK,
  DOCUMENT_STORE,
  TOKEN_DEPLOYER,
} from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { REQUIRED_DOSSIER_KINDS } from "../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../src/domain/assets/onboarding-checklist.js";
import { FakeDocumentStore, RecordingTokenDeployer } from "../fakes/asset-fakes.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";
import { FixedClock, RecordingAssetTokenIssuer } from "../fakes/offering-fakes.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-07-10T00:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");
const CONTENT = Buffer.from("deed").toString("base64");

describe("Offerings API (e2e, real Postgres + ledger, fake chain)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  const investorTokens = new Map<string, string>();
  const investorIds = new Map<string, string>();
  const clock = new FixedClock(DURING);
  const issuer = new RecordingAssetTokenIssuer();

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_STORE)
      .useValue(new FakeDocumentStore())
      .overrideProvider(TOKEN_DEPLOYER)
      .useValue(new RecordingTokenDeployer())
      .overrideProvider(CLAIM_ISSUER)
      .useValue(new RecordingClaimIssuer())
      .overrideProvider(ASSET_TOKEN_ISSUER)
      .useValue(issuer)
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    for (const table of [
      "offering_allocations",
      "offering_subscriptions",
      "offerings",
      "ledger_entries",
      "ledger_accounts",
      "asset_events",
      "asset_documents",
      "assets",
      "onchain_identities",
      "investors",
    ]) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    }

    const officer = await request(server)
      .post("/auth/officer/login")
      .send({ email: "officer@platform.local", password: "officer-dev-pass" })
      .expect(200);
    officerToken = (officer.body as { token: string }).token;

    // Two approved investors with funded ledgers.
    for (const [name, credit] of [
      ["alice", "80000"],
      ["bob", "40000"],
    ] as const) {
      await request(server)
        .post("/investors")
        .send({ email: `${name}@example.com`, password: "s3cure-pass" })
        .expect(201);
      const login = await request(server)
        .post("/auth/login")
        .send({ email: `${name}@example.com`, password: "s3cure-pass" })
        .expect(200);
      const body = login.body as { token: string; investorId: string };
      investorTokens.set(name, body.token);
      investorIds.set(name, body.investorId);
      const http = request(server);
      await http.post("/investors/me/kyc/submit").set(auth(body.token)).expect(204);
      await http
        .post(`/investors/${body.investorId}/kyc/start-review`)
        .set(auth(officerToken))
        .expect(204);
      await http
        .post(`/investors/${body.investorId}/kyc/approve`)
        .set(auth(officerToken))
        .expect(204);
      await http
        .post(`/ledger/${body.investorId}/credit`)
        .set(auth(officerToken))
        .send({ amountRial: credit })
        .expect(204);
    }
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const onboardTokenizedAsset = async (): Promise<string> => {
    const http = request(server);
    const res = await http
      .post("/assets")
      .set(auth(officerToken))
      .send({ name: "Offering SPV" })
      .expect(201);
    const assetId = (res.body as { assetId: string }).assetId;
    await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken)).expect(204);
    for (const kind of REQUIRED_DOSSIER_KINDS) {
      await http
        .post(`/assets/${assetId}/documents`)
        .set(auth(officerToken))
        .send({ kind, title: kind, contentBase64: CONTENT })
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
      .send({ symbol: "OSPV" })
      .expect(201);
    return assetId;
  };

  const offeringBody = (assetId: string, overrides: Record<string, string> = {}) => ({
    assetId,
    supply: "100",
    priceRial: "1000",
    minPerInvestor: "5",
    maxPerInvestor: "80",
    minimumRaise: "20",
    opensAt: OPENS.toISOString(),
    closesAt: CLOSES.toISOString(),
    ...overrides,
  });

  it("runs_the_oversubscribed_offering_to_a_pro_rata_close_with_settlement", async () => {
    clock.current = DURING;
    const assetId = await onboardTokenizedAsset();
    const http = request(server);
    const alice = investorTokens.get("alice") ?? "";
    const bob = investorTokens.get("bob") ?? "";

    const created = await http
      .post("/offerings")
      .set(auth(officerToken))
      .send(offeringBody(assetId))
      .expect(201);
    const offeringId = (created.body as { offeringId: string }).offeringId;

    // Authz: investors cannot create offerings; officers cannot subscribe.
    await http.post("/offerings").set(auth(alice)).send(offeringBody(assetId)).expect(403);
    await http
      .post(`/offerings/${offeringId}/subscribe`)
      .set(auth(officerToken))
      .send({ tokens: "10" })
      .expect(403);

    await http.post(`/offerings/${offeringId}/open`).set(auth(officerToken)).expect(204);

    await http
      .post(`/offerings/${offeringId}/subscribe`)
      .set(auth(alice))
      .send({ tokens: "80" })
      .expect(204);
    // Bob can afford 40 but not 41; insufficient funds must not record anything.
    await http
      .post(`/offerings/${offeringId}/subscribe`)
      .set(auth(bob))
      .send({ tokens: "41" })
      .expect(409);
    await http
      .post(`/offerings/${offeringId}/subscribe`)
      .set(auth(bob))
      .send({ tokens: "40" })
      .expect(204);

    const aliceLedger = await http.get("/ledger/me").set(auth(alice)).expect(200);
    expect(aliceLedger.body).toEqual({ balanceRial: "0", heldRial: "80000" });

    // Close is impossible while the window is open.
    await http.post(`/offerings/${offeringId}/close`).set(auth(officerToken)).expect(409);

    clock.current = AFTER;
    const closed = await http
      .post(`/offerings/${offeringId}/close`)
      .set(auth(officerToken))
      .expect(201);
    expect(closed.body).toMatchObject({ state: "closed_success" });

    // Pro-rata 67/33; ledgers settled; refunds back on balance.
    expect((await http.get("/ledger/me").set(auth(alice)).expect(200)).body).toEqual({
      balanceRial: "13000",
      heldRial: "0",
    });
    expect((await http.get("/ledger/me").set(auth(bob)).expect(200)).body).toEqual({
      balanceRial: "7000",
      heldRial: "0",
    });
    expect(issuer.minted).toEqual([
      { tokenAddress: "0xDeployed1", investorId: investorIds.get("alice"), tokens: 67n },
      { tokenAddress: "0xDeployed1", investorId: investorIds.get("bob"), tokens: 33n },
    ]);
    expect(issuer.finalized).toEqual(["0xDeployed1"]);

    // Investor view: own numbers only, no other identities leaked.
    const view = await http.get(`/offerings/${offeringId}`).set(auth(bob)).expect(200);
    expect(view.body).toMatchObject({
      state: "closed_success",
      totalSubscribed: "120",
      mySubscribed: "40",
      myAllocation: { allocated: "33", refundRial: "7000" },
    });
    expect(JSON.stringify(view.body)).not.toContain(investorIds.get("alice"));
  }, 30_000);

  it("fails_a_raise_below_minimum_and_refunds_in_full", async () => {
    clock.current = DURING;
    const assetId = await onboardTokenizedAsset();
    const http = request(server);
    const bob = investorTokens.get("bob") ?? "";

    const created = await http
      .post("/offerings")
      .set(auth(officerToken))
      .send(offeringBody(assetId, { minimumRaise: "90" }))
      .expect(201);
    const offeringId = (created.body as { offeringId: string }).offeringId;
    await http.post(`/offerings/${offeringId}/open`).set(auth(officerToken)).expect(204);

    const mintsBefore = issuer.minted.length;
    await http
      .post(`/offerings/${offeringId}/subscribe`)
      .set(auth(bob))
      .send({ tokens: "7" })
      .expect(204);

    clock.current = AFTER;
    const closed = await http
      .post(`/offerings/${offeringId}/close`)
      .set(auth(officerToken))
      .expect(201);
    expect(closed.body).toMatchObject({ state: "closed_failed" });
    expect((await http.get("/ledger/me").set(auth(bob)).expect(200)).body).toEqual({
      balanceRial: "7000",
      heldRial: "0",
    });
    expect(issuer.minted).toHaveLength(mintsBefore);
  }, 30_000);
});
