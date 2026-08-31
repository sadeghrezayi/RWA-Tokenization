import argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

// P0-2 step 3's residue: the ONE manual lever that returns an investor's
// stranded escrow, over the real HTTP stack.
//
// The properties worth proving here are not the arithmetic — the use case has
// that — but WHO may pull it and WHAT it refuses. It moves real money on a
// judgement call, so the gate and the refusals are the whole safety story.
describe("Release stranded escrow (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let treasury = "";
  let compliance = "";

  const OFFICER = { email: "release-officer@example.com", password: "0fficer-pass-release" };
  const OFFERING_ID = "off-release";
  const ASSET_ID = "asset-release";
  const INVESTOR_ID = "inv-release";
  const COST = 60_000n;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const REASON = "chain refused the mint for six days; returning the escrow";

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "release-e2e-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const tokenOf = async (email: string, password: string): Promise<string> => {
      const res = await request(server)
        .post("/auth/officer/login")
        .send({ email, password })
        .expect(200);
      return (res.body as { token: string }).token;
    };
    // Seeded by StaffBootstrap with the built-in development password.
    treasury = await tokenOf("treasury@platform.local", "officer-dev-pass");
    compliance = await tokenOf("auditor@platform.local", "officer-dev-pass");
  }, 40_000);

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { investorId: INVESTOR_ID } });
    await prisma.ledgerAccount.deleteMany({ where: { investorId: INVESTOR_ID } });
    await prisma.allocationMint.deleteMany({ where: { offeringId: OFFERING_ID } });
    await prisma.offeringAllocation.deleteMany({ where: { offeringId: OFFERING_ID } });
    await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
    await prisma.investor.deleteMany({ where: { id: INVESTOR_ID } });
    await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
    env.restoreAll();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { investorId: INVESTOR_ID } });
    await prisma.ledgerAccount.deleteMany({ where: { investorId: INVESTOR_ID } });
    await prisma.allocationMint.deleteMany({ where: { offeringId: OFFERING_ID } });
    await prisma.offeringAllocation.deleteMany({ where: { offeringId: OFFERING_ID } });
    await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
    await prisma.investor.deleteMany({ where: { id: INVESTOR_ID } });
    await prisma.asset.deleteMany({ where: { id: ASSET_ID } });

    await prisma.asset.create({
      data: {
        id: ASSET_ID,
        tenantId: "default",
        name: "Release Asset",
        type: "asset_backed",
        state: "tokenized",
        tokenAddress: "0xTokRelease",
      },
    });
    await prisma.offering.create({
      data: {
        id: OFFERING_ID,
        tenantId: "default",
        assetId: ASSET_ID,
        tokenAddress: "0xTokRelease",
        supply: 100n,
        priceRial: 1_000n,
        minPerInvestor: 1n,
        maxPerInvestor: 100n,
        minimumRaise: 1n,
        state: "closed_success",
        opensAt: new Date("2026-08-01T00:00:00.000Z"),
        closesAt: new Date("2026-08-20T00:00:00.000Z"),
      },
    });
    await prisma.investor.create({
      data: {
        id: INVESTOR_ID,
        tenantId: "default",
        email: "release@example.com",
        passwordHash: "x",
        kycState: "approved",
      },
    });
    await prisma.offeringAllocation.create({
      data: {
        tenantId: "default",
        offeringId: OFFERING_ID,
        investorId: INVESTOR_ID,
        requested: 60n,
        allocated: 60n,
        costRial: COST,
        refundRial: 0n,
      },
    });
    await prisma.ledgerAccount.create({
      data: { investorId: INVESTOR_ID, tenantId: "default", balance: 0n, held: COST },
    });
  });

  const release = (token: string, reason = REASON) =>
    request(server)
      .post(`/offerings/${OFFERING_ID}/allocations/${INVESTOR_ID}/release-escrow`)
      .set(auth(token))
      .send({ reason });

  it("lets treasury return the money, and it lands on the investor's balance", async () => {
    await release(treasury).expect(204);

    const account = await prisma.ledgerAccount.findFirstOrThrow({
      where: { investorId: INVESTOR_ID },
    });
    expect(account.held).toBe(0n);
    expect(account.balance).toBe(COST);
  });

  it("refuses a role that may not move money", async () => {
    // The auditor can SEE stranded escrow — that is the point of the screen —
    // and must not be able to return it.
    await release(compliance).expect(403);

    const account = await prisma.ledgerAccount.findFirstOrThrow({
      where: { investorId: INVESTOR_ID },
    });
    expect(account.held).toBe(COST);
  });

  it("refuses an anonymous caller", async () => {
    await request(server)
      .post(`/offerings/${OFFERING_ID}/allocations/${INVESTOR_ID}/release-escrow`)
      .send({ reason: REASON })
      .expect(401);
  });

  it("refuses without a reason", async () => {
    await release(treasury, "   ").expect(400);
  });

  it("REFUSES once the tokens exist", async () => {
    // The failure that would matter most: money back for an allocation that
    // WAS minted leaves the holder with the tokens and the cash.
    await prisma.allocationMint.create({
      data: {
        id: "am-release",
        tenantId: "default",
        offeringId: OFFERING_ID,
        investorId: INVESTOR_ID,
        tokens: "60",
        confirmedAt: new Date(),
      },
    });

    // 409, not merely "some 4xx". The first version of this asserted
    // `>= 400`, which a 500 satisfies — and a 500 is exactly what it was
    // returning, because the domain error had no mapping. A refusal that
    // reports itself as an internal fault tells the operator nothing and logs
    // an incident that did not happen.
    const res = await release(treasury);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("internal server error");

    const account = await prisma.ledgerAccount.findFirstOrThrow({
      where: { investorId: INVESTOR_ID },
    });
    expect(account.held).toBe(COST);
    expect(account.balance).toBe(0n);
  });

  it("returns the money at most once, however many operators ask", async () => {
    await release(treasury).expect(204);
    await release(treasury).expect(204);

    const account = await prisma.ledgerAccount.findFirstOrThrow({
      where: { investorId: INVESTOR_ID },
    });
    expect(account.balance).toBe(COST);
    expect(await prisma.ledgerEntry.count({ where: { kind: "release" } })).toBe(1);
  });

  it("records who returned it and why, in the audit trail", async () => {
    await release(treasury).expect(204);

    const event = await prisma.assetEvent.findFirstOrThrow({
      where: { event: "offering_escrow_released" },
      orderBy: { id: "desc" },
    });
    expect(JSON.stringify(event.details)).toContain(REASON);
  });

  it("refuses a PRE-K-34 allocation whose money was already captured, and says so", async () => {
    // Settlement used to capture BEFORE minting, so an allocation from before
    // 2026-08-25 whose mint failed has its cost TAKEN, not held. The escrow
    // list derives "held" from the allocation COST and cannot tell the two
    // apart, so it will invite an operator to return money that is not there.
    //
    // Without the precondition the rail refuses in its own accounting
    // language — "release exceeds held funds" — which contradicts the screen
    // that just told them this money was held.
    await prisma.ledgerAccount.updateMany({
      where: { investorId: INVESTOR_ID },
      data: { held: 0n, balance: 0n },
    });

    const res = await release(treasury);

    expect(res.status).toBe(409);
    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).toContain("no longer held");
    expect(body).not.toContain("release exceeds held funds");

    const account = await prisma.ledgerAccount.findFirstOrThrow({
      where: { investorId: INVESTOR_ID },
    });
    expect(account.balance).toBe(0n);
  });

  it("tells a second operator the money was RETURNED, not that it is missing", async () => {
    // Both look identical from the balance alone: nothing is held either way.
    // Confusing them would tell a colleague the money was captured years ago
    // when in fact their teammate returned it a minute earlier.
    await release(treasury).expect(204);

    const second = await release(treasury);

    expect(second.status).toBe(204);
    expect(JSON.stringify(second.body).toLowerCase()).not.toContain("no longer held");
    expect(await prisma.ledgerEntry.count({ where: { kind: "release" } })).toBe(1);
  });
});
