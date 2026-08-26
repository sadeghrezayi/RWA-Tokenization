import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, TOKEN_EVENT_SOURCE } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { FakeTokenEventSource } from "../fakes/registry-fakes.js";
import type { IssuerHoldersView } from "../../src/application/issuers/issuer-asset-holders.js";

// P1-2 / FR-PT-2 — the HAPPY PATH, which the first pass at this deliberately
// left uncovered: an issuer reading a REAL cap table through the whole stack.
//
// The chain event source is faked, as the admin registry's own e2e does: the
// ethers adapter has its own anvil-backed tests, and standing up a tokenized
// asset with real mints here would test that adapter a second time rather than
// this projection. Everything else is real — HTTP, authorisation, Postgres
// allocations, and the registry rebuilt from an event stream.
const ALICE_WALLET = "0xA11ce0000000000000000000000000000000ho1d";
const BOB_WALLET = "0xB0b00000000000000000000000000000000ho1d2";
const T0 = new Date("2026-08-20T09:00:00.000Z");
const ASSET_ID = "asset-issuer-holders";
const TOKEN = "0xTokIssuerHolders";

describe("Issuer holder registry (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let founder = "";
  let officer = "";
  let organisationId = "";
  let aliceId = "";
  let bobId = "";

  const events = new FakeTokenEventSource();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const OFFICER = { email: "holders-officer@example.com", password: "0fficer-pass-holders" };
  const founderEmail = `holders-founder-${randomUUID()}@example.com`;
  const aliceEmail = `holders-alice-${randomUUID()}@example.com`;
  const bobEmail = `holders-bob-${randomUUID()}@example.com`;
  const PW = "Passw0rd-holders-1";

  const registerVerified = async (email: string): Promise<string> => {
    await request(server).post("/investors").send({ email, password: PW }).expect(201);
    await prisma.investor.updateMany({
      where: { email: email.toLowerCase() },
      data: { kycState: "approved", emailVerified: true },
    });
    return (await prisma.investor.findFirstOrThrow({ where: { email: email.toLowerCase() } })).id;
  };

  const login = async (email: string): Promise<string> => {
    const res = await request(server).post("/auth/login").send({ email, password: PW }).expect(200);
    return (res.body as { token: string }).token;
  };

  // The integration config runs files SEQUENTIALLY IN ONE PROCESS, so these are
  // shared mutable state, not per-suite settings. Overwriting them and walking
  // away breaks every later suite that signs in as the default officer — which
  // is exactly what happened: two unrelated e2e suites failed in a full run and
  // passed in isolation.
  const originalEnv: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string): void => {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  };

  beforeAll(async () => {
    setEnv("AUTH_TOKEN_SECRET", "holders-e2e-secret");
    setEnv("OFFICER_EMAIL", OFFICER.email);
    setEnv("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_EVENT_SOURCE)
      .useValue(events)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const officerLogin = await request(server)
      .post("/auth/officer/login")
      .send(OFFICER)
      .expect(200);
    officer = (officerLogin.body as { token: string }).token;

    await registerVerified(founderEmail);
    // The founder must be individually verified before applying — the rule of
    // 2026-08-15, enforced by the issuers controller.
    await prisma.investor.updateMany({
      where: { email: founderEmail.toLowerCase() },
      data: { kycState: "approved" },
    });
    founder = await login(founderEmail);

    const applied = await request(server)
      .post("/issuers")
      .set(auth(founder))
      .send({
        legalName: "Holder Registry Holdings PJSC",
        registrationNumber: `IR-${randomUUID().slice(0, 8)}`,
        contactEmail: "ops@holders.example",
      })
      .expect(201);
    organisationId = (applied.body as { organisationId: string }).organisationId;
    await request(server)
      .post(`/issuers/${organisationId}/start-review`)
      .set(auth(officer))
      .expect(204);
    await request(server).post(`/issuers/${organisationId}/approve`).set(auth(officer)).expect(204);

    aliceId = await registerVerified(aliceEmail);
    bobId = await registerVerified(bobEmail);
    await prisma.investorWallet.createMany({
      data: [
        { investorId: aliceId, address: ALICE_WALLET },
        { investorId: bobId, address: BOB_WALLET },
      ],
    });

    // The asset this issuer brought, already tokenized.
    await prisma.asset.create({
      data: {
        id: ASSET_ID,
        tenantId: "default",
        name: "Vanak Tower",
        type: "asset_backed",
        state: "tokenized",
        tokenAddress: TOKEN,
        organisationId,
      },
    });
    await prisma.offering.create({
      data: {
        id: "off-issuer-holders",
        tenantId: "default",
        assetId: ASSET_ID,
        tokenAddress: TOKEN,
        supply: 100n,
        priceRial: 1_000n,
        minPerInvestor: 1n,
        maxPerInvestor: 100n,
        minimumRaise: 1n,
        state: "closed_success",
        opensAt: new Date("2026-08-01T00:00:00.000Z"),
        closesAt: new Date("2026-08-19T00:00:00.000Z"),
      },
    });
    await prisma.offeringAllocation.createMany({
      data: [
        {
          tenantId: "default",
          offeringId: "off-issuer-holders",
          investorId: aliceId,
          requested: 60n,
          allocated: 60n,
          costRial: 60_000n,
          refundRial: 5_000n,
        },
        {
          tenantId: "default",
          offeringId: "off-issuer-holders",
          investorId: bobId,
          requested: 40n,
          allocated: 40n,
          costRial: 40_000n,
          refundRial: 0n,
        },
      ],
    });

    events.seed(
      TOKEN,
      [
        { kind: "mint", to: ALICE_WALLET, tokens: 60n, at: T0, ref: "0xm1" },
        { kind: "mint", to: BOB_WALLET, tokens: 40n, at: T0, ref: "0xm2" },
      ],
      100n,
    );
  }, 40_000);

  afterAll(async () => {
    // Fake custodial addresses left behind are not clutter: a holder snapshot
    // reads every wallet on record, so one unusable address refuses every later
    // distribution on this database.
    await prisma.offeringAllocation.deleteMany({ where: { offeringId: "off-issuer-holders" } });
    await prisma.offering.deleteMany({ where: { id: "off-issuer-holders" } });
    await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
    await prisma.issuerMembership.deleteMany({ where: { organisationId } });
    await prisma.issuerOrganisation.deleteMany({ where: { id: organisationId } });
    for (const id of [aliceId, bobId]) {
      await prisma.investorWallet.deleteMany({ where: { investorId: id } });
      await prisma.onchainIdentity.deleteMany({ where: { investorId: id } });
      await prisma.notification.deleteMany({ where: { recipientId: id } });
      await prisma.emailVerificationToken.deleteMany({ where: { investorId: id } });
    }
    await prisma.investor.deleteMany({
      where: { email: { in: [founderEmail, aliceEmail, bobEmail].map((e) => e.toLowerCase()) } },
    });
    await app.close();
    // Put back exactly what was there, INCLUDING absence: assigning "" or
    // leaving a stale value would be its own version of this bug.
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        // Reflect rather than `delete process.env[key]`: the lint rule against
        // dynamically computed deletes is right in general, and this is the
        // explicit way to say "remove exactly this key".
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  });

  it("serves the issuer a real cap table for their own asset", async () => {
    const res = await request(server)
      .get(`/issuers/${organisationId}/assets/${ASSET_ID}/holders`)
      .set(auth(founder))
      .expect(200);

    const body = res.body as IssuerHoldersView;
    expect(body.assetName).toBe("Vanak Tower");
    expect(body.holders).toHaveLength(2);

    const byTokens = [...body.holders].sort((a, b) => Number(b.tokens) - Number(a.tokens));
    expect(byTokens[0]).toMatchObject({
      tokens: "60",
      shareBps: 6_000,
      tokensAllocated: "60",
      amountInvestedRial: "60000",
      amountRefundedRial: "5000",
    });
    expect(byTokens[1]).toMatchObject({
      tokens: "40",
      shareBps: 4_000,
      amountInvestedRial: "40000",
    });
    // A stable handle, not an address and not a platform id.
    expect(byTokens[0]?.holderReference).toMatch(/^[0-9a-f]{16}$/);
  });

  it("discloses no identity, address or platform identifier over the wire", async () => {
    // The assertion that matters, made against the RAW response rather than a
    // parsed shape: a leak arriving through an unexpected field would still be
    // in the bytes.
    const res = await request(server)
      .get(`/issuers/${organisationId}/assets/${ASSET_ID}/holders`)
      .set(auth(founder))
      .expect(200);

    const raw = JSON.stringify(res.body).toLowerCase();
    expect(raw).not.toContain(aliceEmail.toLowerCase());
    expect(raw).not.toContain(bobEmail.toLowerCase());
    expect(raw).not.toContain("@");
    expect(raw).not.toContain(ALICE_WALLET.toLowerCase());
    expect(raw).not.toContain(BOB_WALLET.toLowerCase());
    expect(raw).not.toContain(aliceId.toLowerCase());
    expect(raw).not.toContain(bobId.toLowerCase());
  });

  it("gives the SAME holder a different reference under a different asset", async () => {
    // The cross-asset linkability the design exists to prevent, proven through
    // the API rather than only against the hashing helper.
    const mine = await request(server)
      .get(`/issuers/${organisationId}/assets/${ASSET_ID}/holders`)
      .set(auth(founder))
      .expect(200);

    await prisma.asset.create({
      data: {
        id: "asset-issuer-holders-2",
        tenantId: "default",
        name: "Second Asset",
        type: "asset_backed",
        state: "tokenized",
        tokenAddress: TOKEN,
        organisationId,
      },
    });
    const other = await request(server)
      .get(`/issuers/${organisationId}/assets/asset-issuer-holders-2/holders`)
      .set(auth(founder))
      .expect(200);
    await prisma.asset.deleteMany({ where: { id: "asset-issuer-holders-2" } });

    const first = (mine.body as IssuerHoldersView).holders
      .map((holder) => holder.holderReference)
      .sort();
    const second = (other.body as IssuerHoldersView).holders
      .map((holder) => holder.holderReference)
      .sort();
    // Same people, same token stream, different asset — and no reference in
    // common, so two issuers cannot discover they share a holder.
    expect(second).toHaveLength(2);
    expect(first.some((reference) => second.includes(reference))).toBe(false);
  });
});
