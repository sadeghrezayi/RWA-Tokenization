import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import type { FundingRequestView } from "../../src/application/funding/funding-view.js";
import type { PaymentInstructions } from "../../src/application/funding/ports.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

// 2.4b: the OD-6 money-in path end to end against real Postgres — the investor
// declares a transfer, treasury confirms what arrived, and the ledger moves.
describe("Funding API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let bearer = "";
  let strangerBearer = "";
  let investorId = "";
  let officer = "";

  const email = `fund-${randomUUID()}@example.com`;
  const strangerEmail = `fund-other-${randomUUID()}@example.com`;
  const PW = "Passw0rd-funding-1";
  const OFFICER = { email: "fund-officer@example.com", password: "0fficer-pass-fund" };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const registerAndLogin = async (address: string): Promise<string> => {
    await request(server).post("/investors").send({ email: address, password: PW }).expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: address, password: PW })
      .expect(200);
    return (login.body as { token: string }).token;
  };

  const balanceOf = async (token: string): Promise<string> => {
    const res = await request(server).get("/ledger/me").set(auth(token)).expect(200);
    return (res.body as { balanceRial: string }).balanceRial;
  };

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "e2e-test-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));
    env.set("FUNDING_BANK_NAME", "E2E Test Bank");
    env.set("FUNDING_ACCOUNT_HOLDER", "Tokenization Platform (test)");
    env.set("FUNDING_ACCOUNT_NUMBER", "IR000000000000000000000001");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    bearer = await registerAndLogin(email);
    strangerBearer = await registerAndLogin(strangerEmail);
    const me = await request(server).get("/investors/me").set(auth(bearer)).expect(200);
    investorId = (me.body as { id: string }).id;

    const officerLogin = await request(server)
      .post("/auth/officer/login")
      .send(OFFICER)
      .expect(200);
    officer = (officerLogin.body as { token: string }).token;
  }, 30_000);

  afterAll(async () => {
    for (const address of [email, strangerEmail]) {
      const investor = await prisma.investor.findFirst({ where: { email: address.toLowerCase() } });
      if (investor) {
        await prisma.fundingRequest.deleteMany({ where: { investorId: investor.id } });
        await prisma.ledgerEntry.deleteMany({ where: { investorId: investor.id } });
        await prisma.ledgerAccount.deleteMany({ where: { investorId: investor.id } });
        await prisma.notification.deleteMany({ where: { recipientId: investor.id } });
        await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
        await prisma.investor.deleteMany({ where: { id: investor.id } });
      }
      await prisma.loginAttempt.deleteMany({ where: { key: address.toLowerCase() } });
    }
    await prisma.outboxMessage.deleteMany({});
    env.restoreAll();
    await app.close();
  });

  it("hands the investor a reference and where to send the money", async () => {
    const res = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "50000000" })
      .expect(201);
    const body = res.body as { request: FundingRequestView; instructions: PaymentInstructions };

    expect(body.request.status).toBe("pending");
    expect(body.request.reference).toMatch(/^TP-[A-Z2-9]+$/);
    expect(body.instructions.bankName).toBe("E2E Test Bank");
    expect(body.instructions.accountNumber).toBe("IR000000000000000000000001");
  });

  it("refuses an amount that is not positive (400)", async () => {
    await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "0" })
      .expect(400);
  });

  it("credits the ledger with what actually arrived when treasury confirms", async () => {
    const before = BigInt(await balanceOf(bearer));
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "10000000" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;

    // The investor actually sent slightly less than they declared.
    const confirmed = await request(server)
      .post(`/funding/${id}/confirm`)
      .set(auth(officer))
      .send({ receivedRial: "9950000" })
      .expect(201);
    const body = confirmed.body as {
      request: FundingRequestView;
      creditStatus: { status: string };
    };

    expect(body.request.status).toBe("confirmed");
    expect(body.request.settledAmountRial).toBe("9950000");
    expect(body.creditStatus.status).toBe("credited");
    expect(BigInt(await balanceOf(bearer))).toBe(before + 9_950_000n);
  });

  it("cannot confirm the same deposit twice (409)", async () => {
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "1000" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;
    await request(server)
      .post(`/funding/${id}/confirm`)
      .set(auth(officer))
      .send({ receivedRial: "1000" })
      .expect(201);

    const before = BigInt(await balanceOf(bearer));
    await request(server)
      .post(`/funding/${id}/confirm`)
      .set(auth(officer))
      .send({ receivedRial: "1000" })
      .expect(409);
    // The refusal is what keeps the balance right.
    expect(BigInt(await balanceOf(bearer))).toBe(before);
  });

  it("rejects with a reason and credits nothing", async () => {
    const before = BigInt(await balanceOf(bearer));
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "7777" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;

    const rejected = await request(server)
      .post(`/funding/${id}/reject`)
      .set(auth(officer))
      .send({ reason: "no matching bank credit" })
      .expect(201);

    expect((rejected.body as FundingRequestView).rejectionReason).toBe("no matching bank credit");
    expect(BigInt(await balanceOf(bearer))).toBe(before);
  });

  it("refuses a rejection with no reason (400)", async () => {
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "555" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;

    await request(server)
      .post(`/funding/${id}/reject`)
      .set(auth(officer))
      .send({ reason: "   " })
      .expect(400);
  });

  it("lets the investor cancel their own request but not someone else's", async () => {
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "4242" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;

    // A stranger gets "not found" — never a hint that the request exists.
    await request(server).post(`/funding/me/${id}/cancel`).set(auth(strangerBearer)).expect(404);

    const cancelled = await request(server)
      .post(`/funding/me/${id}/cancel`)
      .set(auth(bearer))
      .expect(201);
    expect((cancelled.body as FundingRequestView).status).toBe("cancelled");
  });

  it("shows treasury only what is still waiting, with a human label", async () => {
    const opened = await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "31337" })
      .expect(201);
    const id = (opened.body as { request: FundingRequestView }).request.id;

    const queue = await request(server).get("/funding/pending").set(auth(officer)).expect(200);
    const rows = queue.body as { id: string; investorEmail: string; status: string }[];

    const mine = rows.find((row) => row.id === id);
    expect(mine?.investorEmail).toBe(email.toLowerCase());
    expect(rows.every((row) => row.status === "pending")).toBe(true);
  });

  it("lets an officer read ONE investor's cash movements, for the 360", async () => {
    // The Cash & payments tab stands on this: an officer reviewing a file has
    // to see the money that moved, not only the balance it left behind.
    await request(server)
      .post("/funding/me")
      .set(auth(bearer))
      .send({ amountRial: "77000000" })
      .expect(201);

    const res = await request(server)
      .get(`/funding/investors/${investorId}`)
      .set(auth(officer))
      .expect(200);

    const rows = res.body as { amountRial: string; reference: string; status: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.amountRial === "77000000")).toBe(true);
    // The reference is what an officer matches against a bank statement.
    expect(rows[0]?.reference).toMatch(/^TP-/);
  });

  it("keeps one investor's cash movements away from another investor (403)", async () => {
    await request(server)
      .get(`/funding/investors/${investorId}`)
      .set(auth(strangerBearer))
      .expect(403);
  });

  it("keeps an investor out of treasury's endpoints (403)", async () => {
    await request(server).get("/funding/pending").set(auth(bearer)).expect(403);
    await request(server)
      .post(`/funding/${investorId}/confirm`)
      .set(auth(bearer))
      .send({ receivedRial: "1" })
      .expect(403);
  });

  it("requires authentication", async () => {
    await request(server).get("/funding/me").expect(401);
    await request(server).post("/funding/me").send({ amountRial: "1" }).expect(401);
  });
});
