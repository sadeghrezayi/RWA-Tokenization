import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { MINT_ALLOCATION_TYPE } from "../../src/application/offerings/settle-with-retry.js";
import { clearInvestors } from "../support/clear-investors.js";
import type { AllocationAwaitingMintView } from "../../src/application/reporting/allocations-awaiting-mint.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

// K-34's residue, over the real HTTP stack. The query has its own integration
// test; what is proven HERE is the wiring and the wire format — specifically
// that a Rial escrow survives JSON. Every amount is a bigint server-side, and
// bigint is what `JSON.stringify` throws on: a serialization slip would take
// the whole endpoint down with a 500, and no unit test would see it.
describe("Allocations awaiting mint API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officer = "";

  const OFFICER = { email: "awaiting-officer@example.com", password: "0fficer-pass-awaiting" };
  const ASSET_ID = "asset-awaiting-e2e";
  const OFFERING_ID = "off-awaiting-e2e";
  const INVESTOR_ID = "inv-awaiting-e2e";
  // Larger than Number.MAX_SAFE_INTEGER on purpose.
  const HELD = 9_007_199_254_740_993n;

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "awaiting-e2e-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    await prisma.outboxMessage.deleteMany();
    await prisma.allocationMint.deleteMany();
    await prisma.offeringAllocation.deleteMany();
    await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
    await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
    await clearInvestors(prisma);

    await prisma.asset.create({
      data: {
        id: ASSET_ID,
        tenantId: "default",
        name: "Vanak Tower",
        type: "asset_backed",
        state: "proposed",
      },
    });
    await prisma.offering.create({
      data: {
        id: OFFERING_ID,
        tenantId: "default",
        assetId: ASSET_ID,
        tokenAddress: "0xToken",
        supply: 1_000n,
        priceRial: 1_000n,
        minPerInvestor: 1n,
        maxPerInvestor: 1_000n,
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
        email: "awaiting@example.com",
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
        costRial: HELD,
        refundRial: 0n,
      },
    });
    await prisma.outboxMessage.create({
      data: {
        id: "ob-awaiting-e2e",
        type: MINT_ALLOCATION_TYPE,
        payload: { offeringId: OFFERING_ID, investorId: INVESTOR_ID, tokens: "60" },
        status: "failed",
        attempts: 4,
        lastError: "holder not registered",
      },
    });

    const login = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    officer = (login.body as { token: string }).token;
  }, 30_000);

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.offeringAllocation.deleteMany();
    await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
    await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
    await clearInvestors(prisma);
    env.restoreAll();
    await app.close();
  });

  it("lists the stuck allocation, with the escrow intact through JSON", async () => {
    const response = await request(server)
      .get("/reporting/allocations-awaiting-mint")
      .set({ authorization: `Bearer ${officer}` })
      .expect(200);

    const rows = response.body as AllocationAwaitingMintView[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      offeringId: OFFERING_ID,
      assetName: "Vanak Tower",
      investorId: INVESTOR_ID,
      investorEmail: "awaiting@example.com",
      tokens: "60",
      // The digits a float would have eaten.
      heldRial: "9007199254740993",
      mintState: "not_minted",
      retry: { status: "failed", attempts: 4, lastError: "holder not registered" },
    });
  });

  it("refuses a caller without reporting permission", async () => {
    // Who is owed money, and how much, is not public.
    await request(server).get("/reporting/allocations-awaiting-mint").expect(401);
  });
});
