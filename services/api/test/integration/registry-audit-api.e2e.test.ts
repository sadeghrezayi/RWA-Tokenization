import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, ASSET_TOKEN_TRANSFERRER, TOKEN_EVENT_SOURCE } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { FakeAssetTokenTransferrer } from "../fakes/transfer-fakes.js";
import { FakeTokenEventSource } from "../fakes/registry-fakes.js";

const RUN = randomUUID().slice(0, 8);
const ALICE_WALLET = `0xreg${RUN}aaaa`;
const BOB_WALLET = `0xreg${RUN}bbbb`;
const T0 = new Date("2026-07-01T00:00:00Z");

// FR-RA over the real HTTP + Postgres stack. The chain event stream is faked
// (the real adapter is proven against anvil in ethers-token-event-source);
// here we prove wiring, authz, CSV downloads, and the audit surface.
describe("Registry & Audit API (e2e, real Postgres, fake chain)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  let aliceToken: string;
  let aliceId: string;
  let bobId: string;
  const events = new FakeTokenEventSource();
  const chain = new FakeAssetTokenTransferrer();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_EVENT_SOURCE)
      .useValue(events)
      .overrideProvider(ASSET_TOKEN_TRANSFERRER)
      .useValue(chain)
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
    for (const email of ["reg.alice@example.com", "reg.bob@example.com"]) {
      await request(server).post("/investors").send({ email, password: "Passw0rd1" });
      await prisma.investor.updateMany({ where: { email }, data: { kycState: "approved" } });
    }
    aliceToken = tokenOf(
      await request(server)
        .post("/auth/login")
        .send({ email: "reg.alice@example.com", password: "Passw0rd1" })
        .expect(200),
    );
    aliceId = (
      await prisma.investor.findFirstOrThrow({ where: { email: "reg.alice@example.com" } })
    ).id;
    bobId = (await prisma.investor.findFirstOrThrow({ where: { email: "reg.bob@example.com" } }))
      .id;
    // Custodial wallets the fake event stream references (P2 mapping source).
    await prisma.investorWallet.deleteMany({ where: { investorId: { in: [aliceId, bobId] } } });
    await prisma.investorWallet.createMany({
      data: [
        { investorId: aliceId, address: ALICE_WALLET },
        { investorId: bobId, address: BOB_WALLET },
      ],
    });
  }, 30_000);

  beforeEach(async () => {
    await prisma.tokenTransfer.deleteMany();
    await prisma.redemption.deleteMany();
    await prisma.attestation.deleteMany();
    await prisma.assetEvent.deleteMany();
    await prisma.crmNote.deleteMany();
    await prisma.crmFollowUp.deleteMany();
    await prisma.crmProfile.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.asset.createMany({
      data: [
        {
          id: "asset-reg-1",
          name: "Registry Test SPV",
          type: "asset_backed",
          state: "tokenized",
          tokenAddress: "0xTokReg1",
        },
        { id: "asset-reg-2", name: "Unfinished SPV", type: "asset_backed", state: "approved" },
      ],
    });
    chain.reset();
    chain.credit(aliceId, 35n);
    events.seed(
      "0xTokReg1",
      [
        { kind: "mint", to: ALICE_WALLET, tokens: 60n, at: T0, ref: "0xm1" },
        { kind: "mint", to: BOB_WALLET, tokens: 40n, at: T0, ref: "0xm2" },
        { kind: "transfer", from: ALICE_WALLET, to: BOB_WALLET, tokens: 15n, at: T0, ref: "0xt1" },
        { kind: "burn", from: ALICE_WALLET, tokens: 10n, at: T0, ref: "0xb1" },
      ],
      90n,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves_the_holder_registry_with_people_not_addresses", async () => {
    const res = await request(server)
      .get("/reporting/assets/asset-reg-1/registry")
      .set(auth(officerToken))
      .expect(200);

    const body = res.body as {
      assetName: string;
      matchesChain: boolean;
      holders: { email?: string; tokens: string; shareBps: number }[];
      history: unknown[];
    };
    expect(body.assetName).toBe("Registry Test SPV");
    expect(body.matchesChain).toBe(true);
    expect(body.holders).toEqual([
      expect.objectContaining({ email: "reg.bob@example.com", tokens: "55", shareBps: 6111 }),
      expect.objectContaining({ email: "reg.alice@example.com", tokens: "35", shareBps: 3888 }),
    ]);
    expect(body.history).toHaveLength(4);
  });

  it("downloads_the_registry_and_history_as_csv_attachments", async () => {
    const registry = await request(server)
      .get("/reporting/assets/asset-reg-1/registry.csv")
      .set(auth(officerToken))
      .expect(200);
    expect(registry.headers["content-type"]).toContain("text/csv");
    expect(registry.headers["content-disposition"]).toBe(
      'attachment; filename="holder-registry-asset-reg-1.csv"',
    );
    expect(registry.text.split("\n")[0]).toBe("email,investor_id,wallet,tokens,holder_since");
    expect(registry.text).toContain(`reg.bob@example.com,${bobId},${BOB_WALLET},55,`);

    const history = await request(server)
      .get("/reporting/assets/asset-reg-1/transfers.csv")
      .set(auth(officerToken))
      .expect(200);
    expect(history.headers["content-disposition"]).toBe(
      'attachment; filename="transfer-history-asset-reg-1.csv"',
    );
    expect(history.text.split("\n")).toHaveLength(5); // header + 4 events
  });

  it("refuses_a_registry_for_an_untokenized_asset_with_409_and_unknown_with_404", async () => {
    await request(server)
      .get("/reporting/assets/asset-reg-2/registry")
      .set(auth(officerToken))
      .expect(409);
    await request(server)
      .get("/reporting/assets/ghost/registry")
      .set(auth(officerToken))
      .expect(404);
  });

  it("surfaces_privileged_actions_on_the_audit_trail_with_resolved_actors", async () => {
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-reg-1", toEmail: "reg.bob@example.com", tokens: "5" })
      .expect(201);

    const res = await request(server)
      .get("/reporting/audit?assetId=asset-reg-1")
      .set(auth(officerToken))
      .expect(200);

    const trail = res.body as { event: string; actor: string; assetName: string }[];
    expect(trail[0]).toMatchObject({
      event: "tokens_transferred",
      actor: "reg.alice@example.com",
      assetName: "Registry Test SPV",
    });
  });

  it("respects_the_audit_limit_query", async () => {
    for (const tokens of ["1", "2", "3"]) {
      await request(server)
        .post("/transfers")
        .set(auth(aliceToken))
        .send({ assetId: "asset-reg-1", toEmail: "reg.bob@example.com", tokens })
        .expect(201);
    }
    const res = await request(server)
      .get("/reporting/audit?assetId=asset-reg-1&limit=2")
      .set(auth(officerToken))
      .expect(200);
    expect(res.body as unknown[]).toHaveLength(2);
  });

  it("lists_the_investor_directory_with_kyc_balances_crm_and_summary", async () => {
    const res = await request(server).get("/investors").set(auth(officerToken)).expect(200);

    const body = res.body as {
      investors: { email: string; kycState: string; balanceRial: string; stage: string }[];
      summary: { investorCount: number; totalBalanceRial: string };
    };
    const alice = body.investors.find((entry) => entry.email === "reg.alice@example.com");
    expect(alice).toMatchObject({
      kycState: "approved",
      balanceRial: "0",
      heldRial: "0",
      stage: "lead",
      tags: [],
    });
    expect(body.summary.investorCount).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("runs_the_crm_flow_stage_tags_note_and_follow_up_end_to_end", async () => {
    await request(server)
      .put(`/crm/${aliceId}/stage`)
      .set(auth(officerToken))
      .send({ stage: "active" })
      .expect(204);
    await request(server)
      .post(`/crm/${aliceId}/tags`)
      .set(auth(officerToken))
      .send({ tag: "qualified" })
      .expect(204);
    await request(server)
      .post(`/crm/${aliceId}/notes`)
      .set(auth(officerToken))
      .send({ text: "Called about the offering." })
      .expect(201);
    const followUp = await request(server)
      .post(`/crm/${aliceId}/follow-ups`)
      .set(auth(officerToken))
      .send({ text: "Send prospectus", dueAt: "2026-01-01T00:00:00.000Z" })
      .expect(201);

    const detail = (
      await request(server).get(`/investors/${aliceId}/detail`).set(auth(officerToken)).expect(200)
    ).body as {
      crm: { stage: string; tags: string[]; followUps: { overdue: boolean }[] };
      sales: { totalInvestedRial: string };
      timeline: { kind: string; text: string }[];
    };
    expect(detail.crm.stage).toBe("active");
    expect(detail.crm.tags).toEqual(["qualified"]);
    expect(detail.crm.followUps[0]?.overdue).toBe(true); // due date in the past
    expect(detail.timeline.some((i) => i.kind === "note")).toBe(true);
    expect(detail.sales.totalInvestedRial).toBe("0");

    const queue = (await request(server).get("/crm/follow-ups").set(auth(officerToken)).expect(200))
      .body as { id: string; email: string; overdue: boolean }[];
    const mine = queue.find((f) => f.email === "reg.alice@example.com");
    expect(mine?.overdue).toBe(true);

    await request(server)
      .post(`/crm/follow-ups/${(followUp.body as { followUpId: string }).followUpId}/complete`)
      .set(auth(officerToken))
      .expect(204);
    const after = (await request(server).get("/crm/follow-ups").set(auth(officerToken)).expect(200))
      .body as { email: string }[];
    expect(after.some((f) => f.email === "reg.alice@example.com")).toBe(false);
  });

  it("rejects_bad_crm_input_with_400_and_unknown_follow_up_with_404", async () => {
    await request(server)
      .put(`/crm/${aliceId}/stage`)
      .set(auth(officerToken))
      .send({ stage: "vip" })
      .expect(400);
    await request(server)
      .post(`/crm/${aliceId}/notes`)
      .set(auth(officerToken))
      .send({ text: "   " })
      .expect(400);
    await request(server)
      .post("/crm/follow-ups/ghost/complete")
      .set(auth(officerToken))
      .expect(404);
  });

  it("forbids_investors_from_the_crm_surface", async () => {
    await request(server)
      .put(`/crm/${aliceId}/stage`)
      .set(auth(aliceToken))
      .send({ stage: "active" })
      .expect(403);
    await request(server).get("/crm/follow-ups").set(auth(aliceToken)).expect(403);
  });

  it("drills_into_one_investor_with_chain_portfolio_and_history", async () => {
    await request(server)
      .post("/transfers")
      .set(auth(aliceToken))
      .send({ assetId: "asset-reg-1", toEmail: "reg.bob@example.com", tokens: "5" })
      .expect(201);

    const res = await request(server)
      .get(`/investors/${aliceId}/detail`)
      .set(auth(officerToken))
      .expect(200);

    const detail = res.body as {
      investor: { email: string };
      chain: { walletAddress?: string; identityAddress?: string };
      holdings: { assetId: string; tokens: string }[];
      transfers: { direction: string; counterparty: string; tokens: string; assetName: string }[];
    };
    expect(detail.investor.email).toBe("reg.alice@example.com");
    expect(detail.chain.walletAddress).toBe(ALICE_WALLET);
    expect(detail.holdings).toEqual([
      expect.objectContaining({ assetId: "asset-reg-1", tokens: "30" }),
    ]);
    expect(detail.transfers[0]).toMatchObject({
      direction: "sent",
      counterparty: "reg.bob@example.com",
      tokens: "5",
      assetName: "Registry Test SPV",
    });
  });

  it("returns_404_for_an_unknown_investor_detail", async () => {
    await request(server).get("/investors/ghost/detail").set(auth(officerToken)).expect(404);
  });

  it("forbids_investors_from_the_directory", async () => {
    await request(server).get("/investors").set(auth(aliceToken)).expect(403);
    await request(server).get(`/investors/${aliceId}/detail`).set(auth(aliceToken)).expect(403);
  });

  it("forbids_investors_from_every_reporting_surface", async () => {
    for (const path of [
      "/reporting/assets/asset-reg-1/registry",
      "/reporting/assets/asset-reg-1/registry.csv",
      "/reporting/assets/asset-reg-1/transfers.csv",
      "/reporting/audit",
    ]) {
      await request(server).get(path).set(auth(aliceToken)).expect(403);
    }
  });
});
