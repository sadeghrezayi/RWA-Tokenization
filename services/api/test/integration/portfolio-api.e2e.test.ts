import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import type { PortfolioView } from "../../src/application/portfolio/get-my-portfolio.js";

// 2.5a: the holder's own portfolio over HTTP against real Postgres. Holdings
// come from the chain, so this seeds only what the read model reads from the
// database — invested cost, a paid distribution — and asserts the shape and
// the self-scoping.
describe("Portfolio API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let bearer = "";
  let investorId = "";
  const email = `pf-${randomUUID()}@example.com`;
  const PW = "Passw0rd-portfolio-1";
  const assetId = `asset-pf-${randomUUID()}`;
  const distributionId = `dist-pf-${randomUUID()}`;
  const PAID_AT = new Date("2026-07-15T10:00:00Z");

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    await request(server).post("/investors").send({ email, password: PW }).expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email, password: PW })
      .expect(200);
    bearer = (login.body as { token: string }).token;
    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    investorId = (me.body as { id: string }).id;

    await prisma.asset.create({
      data: {
        id: assetId,
        tenantId: "default",
        name: "Portfolio Test Tower",
        type: "asset_backed",
        state: "tokenized",
        tokenAddress: `0xPf-${assetId.slice(-8)}`,
      },
    });
    await prisma.distribution.create({
      data: {
        id: distributionId,
        tenantId: "default",
        assetId,
        tokenAddress: `0xPf-${assetId.slice(-8)}`,
        totalAmountRial: 3_000_000n,
        state: "paid",
        paidAt: PAID_AT,
        payouts: {
          create: [{ tenantId: "default", investorId, tokens: 10n, amountRial: 3_000_000n }],
        },
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.distributionPayout.deleteMany({ where: { distributionId } });
    await prisma.distribution.deleteMany({ where: { id: distributionId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    const investor = await prisma.investor.findFirst({ where: { email: email.toLowerCase() } });
    if (investor) {
      await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
      await prisma.investor.deleteMany({ where: { id: investor.id } });
    }
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("reports the income actually paid to this holder, dated", async () => {
    const res = await request(server)
      .get("/portfolio/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    const view = res.body as PortfolioView;

    expect(view.incomeReceivedRial).toBe("3000000");
    expect(view.income).toHaveLength(1);
    expect(view.income[0]).toEqual({
      distributionId,
      assetId,
      assetName: "Portfolio Test Tower",
      amountRial: "3000000",
      paidAt: PAID_AT.toISOString(),
    });
  });

  it("reports an empty position honestly rather than failing", async () => {
    const res = await request(server)
      .get("/portfolio/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    const view = res.body as PortfolioView;

    // This holder never subscribed and holds no tokens on-chain.
    expect(view.holdings).toEqual([]);
    expect(view.totalInvestedRial).toBe("0");
    expect(view.portfolioValueRial).toBe("0");
    expect(view.valuedAt).toBeUndefined();
  });

  it("is self-scoped: there is no route to another holder's portfolio", async () => {
    await request(server)
      .get(`/portfolio/${investorId}`)
      .set("authorization", `Bearer ${bearer}`)
      .expect(404);
  });

  it("requires authentication", async () => {
    await request(server).get("/portfolio/me").expect(401);
  });
});
