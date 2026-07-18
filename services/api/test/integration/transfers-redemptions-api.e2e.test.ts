import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  AppModule,
  ASSET_TOKEN_BURNER,
  ASSET_TOKEN_TRANSFERRER,
  ATTESTATION_ANCHOR,
  HOLDER_SNAPSHOT_PROVIDER,
} from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { FakeAssetTokenTransferrer } from "../fakes/transfer-fakes.js";
import { RecordingAssetTokenBurner } from "../fakes/redemption-fakes.js";
import { RecordingAttestationAnchor } from "../fakes/attestation-fakes.js";
import { StubHolderSnapshotProvider } from "../fakes/distribution-fakes.js";

describe("Transfers & Redemptions API (e2e, real Postgres, fake chain)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  let aliceToken: string;
  let aliceId: string;
  const chain = new FakeAssetTokenTransferrer();
  const burner = new RecordingAssetTokenBurner();
  const snapshot = new StubHolderSnapshotProvider();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ASSET_TOKEN_TRANSFERRER)
      .useValue(chain)
      .overrideProvider(ASSET_TOKEN_BURNER)
      .useValue(burner)
      .overrideProvider(ATTESTATION_ANCHOR)
      .useValue(new RecordingAttestationAnchor())
      .overrideProvider(HOLDER_SNAPSHOT_PROVIDER)
      .useValue(snapshot)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const tokenOf = (res: { body: unknown }) => (res.body as { token: string }).token;
    officerToken = tokenOf(
      await request(server)
        .post("/auth/officer/login")
        .send({ email: "officer@platform.local", password: "officer-dev-pass" })
        .expect(200),
    );

    // alice (approved) + bob (approved) + carol (draft KYC) — idempotent.
    const investors: [string, "approved" | "draft"][] = [
      ["tr.alice@example.com", "approved"],
      ["tr.bob@example.com", "approved"],
      ["tr.carol@example.com", "draft"],
    ];
    for (const [email] of investors) {
      await request(server).post("/investors").send({ email, password: "Passw0rd1" });
    }
    aliceToken = tokenOf(
      await request(server)
        .post("/auth/login")
        .send({ email: "tr.alice@example.com", password: "Passw0rd1" })
        .expect(200),
    );
    for (const [email, state] of investors) {
      await prisma.investor.updateMany({ where: { email }, data: { kycState: state } });
    }
    aliceId = (await prisma.investor.findFirstOrThrow({ where: { email: "tr.alice@example.com" } }))
      .id;
  }, 30_000);

  beforeEach(async () => {
    await prisma.tokenTransfer.deleteMany();
    await prisma.redemption.deleteMany();
    await prisma.attestation.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.asset.create({
      data: {
        id: "asset-tr-1",
        name: "Vanak Tower SPV",
        type: "asset_backed",
        state: "tokenized",
        tokenAddress: "0xTokTr1",
      },
    });
    chain.reset();
    chain.credit(aliceId, 100n);
    burner.burned.length = 0;
    snapshot.set([{ investorId: aliceId, tokens: 100n }]);
  });

  afterAll(async () => {
    await app.close();
  });

  const publishValuation = () =>
    request(server)
      .post("/attestations")
      .set(auth(officerToken))
      .send({
        assetId: "asset-tr-1",
        kind: "valuation",
        valueRial: "12500000000",
        validUntil: "2027-12-31T00:00:00.000Z",
      })
      .expect(201);

  it("transfers_by_email_and_lists_the_history", async () => {
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", toEmail: "tr.bob@example.com", tokens: "25" })
      .expect(201);

    const mine = await request(server).get("/transfers/me").set(auth(aliceToken)).expect(200);
    const transfers = mine.body as Record<string, unknown>[];
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ tokens: "25" });
    expect(chain.transfers).toHaveLength(1);
  });

  it("rejects_transfer_to_an_unknown_email_with_404_and_to_an_ineligible_investor_with_403", async () => {
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", toEmail: "ghost@example.com", tokens: "5" })
      .expect(404);
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", toEmail: "tr.carol@example.com", tokens: "5" })
      .expect(403);
  });

  it("rejects_an_over_balance_transfer_with_409", async () => {
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", toEmail: "tr.bob@example.com", tokens: "500" })
      .expect(409);
  });

  it("walks_the_full_redemption_flow_request_fulfill_and_ledger_credit", async () => {
    await publishValuation();

    const req = await request(server)
      .post("/redemptions")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", tokens: "25" })
      .expect(201);
    const redemptionId = (req.body as { redemptionId: string }).redemptionId;

    const queue = await request(server).get("/redemptions").set(auth(officerToken)).expect(200);
    expect((queue.body as unknown[]).length).toBe(1);

    const fulfilled = await request(server)
      .post(`/redemptions/${redemptionId}/fulfill`)
      .set(auth(officerToken))
      .expect(201);
    // 12.5B valuation / 100 circulating × 25 = 3.125B
    expect((fulfilled.body as { payoutRial: string }).payoutRial).toBe("3125000000");
    expect(burner.burned).toEqual([{ tokenAddress: "0xTokTr1", investorId: aliceId, tokens: 25n }]);

    const ledger = await request(server).get("/ledger/me").set(auth(aliceToken)).expect(200);
    expect((ledger.body as { balanceRial: string }).balanceRial).toBe("3125000000");

    // No double-fulfillment.
    await request(server)
      .post(`/redemptions/${redemptionId}/fulfill`)
      .set(auth(officerToken))
      .expect(409);
  });

  it("blocks_fulfillment_without_a_fresh_valuation_with_409", async () => {
    const req = await request(server)
      .post("/redemptions")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", tokens: "10" })
      .expect(201);

    await request(server)
      .post(`/redemptions/${(req.body as { redemptionId: string }).redemptionId}/fulfill`)
      .set(auth(officerToken))
      .expect(409);
    expect(burner.burned).toEqual([]);
  });

  it("rejects_a_redemption_with_a_reason_and_shows_it_to_the_investor", async () => {
    const req = await request(server)
      .post("/redemptions")
      .set(auth(aliceToken))
      .send({ assetId: "asset-tr-1", tokens: "10" })
      .expect(201);
    const id = (req.body as { redemptionId: string }).redemptionId;

    await request(server)
      .post(`/redemptions/${id}/reject`)
      .set(auth(officerToken))
      .send({ reason: "awaiting quarterly valuation" })
      .expect(204);

    const mine = await request(server).get("/redemptions/me").set(auth(aliceToken)).expect(200);
    expect((mine.body as Record<string, unknown>[])[0]).toMatchObject({
      state: "rejected",
      rejectionReason: "awaiting quarterly valuation",
    });
  });

  it("forbids_investors_from_the_officer_queue_and_fulfillment", async () => {
    await request(server).get("/redemptions").set(auth(aliceToken)).expect(403);
    await request(server).post("/redemptions/any/fulfill").set(auth(aliceToken)).expect(403);
  });
});
