import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import type { PublicOfferingView } from "../../src/application/public/get-public-catalog.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

const OFFICER = { email: "pub-officer@example.com", password: "0fficer-pub-1" };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

// 2.1a (OD-5 public catalog, gated subscription). The point of this suite is the
// NEGATIVE case: an offering that was never published must be invisible to an
// anonymous visitor, and publishing must be a deliberate, permissioned act.
describe("Public catalog API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let officerToken = "";
  let assetId = "";
  let publishedId = "";
  let privateId = "";
  const offeringIds: string[] = [];

  const publicList = async (): Promise<PublicOfferingView[]> => {
    // No authorization header anywhere in this helper — that is the test.
    const res = await request(server).get("/public/offerings").expect(200);
    return res.body as PublicOfferingView[];
  };

  // Seeded directly: creating an offering through the API needs a fully
  // tokenized asset (chain deploy), which is irrelevant to what this suite
  // proves — that publication controls public visibility.
  const createOpenOffering = async (): Promise<string> => {
    const id = `off-pub-${randomUUID()}`;
    offeringIds.push(id);
    await prisma.offering.create({
      data: {
        id,
        tenantId: "default",
        assetId,
        tokenAddress: "0xPublicCatalogTest",
        supply: 100n,
        priceRial: 1_000_000n,
        minPerInvestor: 1n,
        maxPerInvestor: 50n,
        minimumRaise: 10n,
        opensAt: new Date(Date.now() - 3_600_000),
        closesAt: new Date(Date.now() + 30 * 86_400_000),
        state: "open",
      },
    });
    return id;
  };

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "e2e-test-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    const officer = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    officerToken = (officer.body as { token: string }).token;

    assetId = `asset-pub-${randomUUID()}`;
    await prisma.asset.create({
      data: {
        id: assetId,
        tenantId: "default",
        name: `Public Tower ${randomUUID().slice(0, 8)}`,
        type: "real_estate",
        state: "tokenized",
      },
    });

    publishedId = await createOpenOffering();
    privateId = await createOpenOffering();
    await request(server)
      .post(`/offerings/${publishedId}/publish`)
      .set(auth(officerToken))
      .expect(204);
  }, 30_000);

  afterAll(async () => {
    await prisma.offeringSubscription.deleteMany({ where: { offeringId: { in: offeringIds } } });
    await prisma.offering.deleteMany({ where: { id: { in: offeringIds } } });
    await prisma.assetEvent.deleteMany({ where: { assetId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.loginAttempt.deleteMany({ where: { key: OFFICER.email.toLowerCase() } });
    await prisma.outboxMessage.deleteMany({});
    env.restoreAll();
    await app.close();
  });

  it("serves the catalog to an anonymous visitor", async () => {
    const listed = await publicList();
    expect(listed.map((o) => o.id)).toContain(publishedId);
  });

  it("never exposes an open-but-unpublished offering", async () => {
    const listed = await publicList();
    expect(listed.map((o) => o.id)).not.toContain(privateId);
    // And it is a plain 404 — not a 403, which would confirm the id exists.
    await request(server).get(`/public/offerings/${privateId}`).expect(404);
  });

  it("shows only factual terms, never a projected return or a subscriber", async () => {
    const res = await request(server).get(`/public/offerings/${publishedId}`).expect(200);
    const body = res.body as Record<string, unknown>;

    expect(body.priceRial).toBe("1000000");
    expect(body.assetName).toBeTypeOf("string");
    expect(Object.keys(body)).not.toContain("projectedYield");
    expect(Object.keys(body)).not.toContain("subscriptions");
    expect(Object.keys(body)).not.toContain("allocations");
  });

  it("withdraws the listing when unpublished", async () => {
    await request(server)
      .post(`/offerings/${publishedId}/unpublish`)
      .set(auth(officerToken))
      .expect(204);

    expect((await publicList()).map((o) => o.id)).not.toContain(publishedId);
    await request(server).get(`/public/offerings/${publishedId}`).expect(404);

    // Restore for independence from test order.
    await request(server)
      .post(`/offerings/${publishedId}/publish`)
      .set(auth(officerToken))
      .expect(204);
  });

  it("requires the offering.manage permission to publish", async () => {
    await request(server).post(`/offerings/${privateId}/publish`).expect(401);
  });
});
