import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule, TOKEN_ISSUER } from "../../src/app.module.js";
import type { TokenIssuer } from "../../src/application/identity/ports.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

const OFFICER = { email: "apr-officer@example.com", password: "0fficer-pass-apr" };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

// 1.4b: threshold maker-checker on ledger credit (T1/T3). A second officer
// principal (officer-2) is minted directly via the token issuer to exercise the
// four-eyes approve path (real second-officer logins arrive with 1.4c).
describe("Approvals API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officer1 = "";
  let officer2 = "";
  let investorToken = "";
  let investorId = "";
  const investorEmail = `apr-inv-${randomUUID()}@example.com`;

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "e2e-test-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));
    env.set("LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL", "1000");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const login = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    officer1 = (login.body as { token: string }).token;
    // A distinct second officer principal for the checker side of four-eyes.
    officer2 = await app.get<TokenIssuer>(TOKEN_ISSUER).issue({
      kind: "officer",
      officerId: "officer-2",
    });

    await request(server)
      .post("/investors")
      .send({ email: investorEmail, password: "Passw0rd-9" })
      .expect(201);
    const invLogin = await request(server)
      .post("/auth/login")
      .send({ email: investorEmail, password: "Passw0rd-9" })
      .expect(200);
    investorToken = (invLogin.body as { token: string }).token;
    investorId = (invLogin.body as { investorId: string }).investorId;
  }, 30_000);

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { makerId: { in: ["officer-1"] } } });
    await prisma.loginAttempt.deleteMany({
      where: { key: { in: [OFFICER.email.toLowerCase(), investorEmail.toLowerCase()] } },
    });
    env.restoreAll();
    await app.close();
  });

  const balance = async (): Promise<string> => {
    const res = await request(server).get("/ledger/me").set(auth(investorToken)).expect(200);
    return (res.body as { balanceRial: string }).balanceRial;
  };

  it("credits_directly_below_the_threshold", async () => {
    await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(officer1))
      .send({ amountRial: "500" })
      .expect(204);
    expect(await balance()).toBe("500");
  });

  it("parks_an_at_or_above_threshold_credit_for_approval", async () => {
    const res = await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(officer1))
      .send({ amountRial: "1000" })
      .expect(202);
    expect((res.body as { status: string }).status).toBe("pending_approval");
    expect((res.body as { approvalId: string }).approvalId).toBeTypeOf("string");
    // Nothing moved yet.
    expect(await balance()).toBe("500");
  });

  it("shows_the_pending_approval_in_the_queue", async () => {
    const res = await request(server).get("/approvals").set(auth(officer1)).expect(200);
    const pending = res.body as { status: string; summary: string }[];
    // Human labels (P2): the amount is grouped and the investor is named by
    // email — a person deciding about money should not be shown a raw UUID.
    const mine = pending.find(
      (a) => a.status === "pending" && a.summary.includes(investorEmail.toLowerCase()),
    );
    expect(mine).toBeDefined();
    expect(mine?.summary).toContain("1,000");
    expect(mine?.summary).not.toContain(investorId);
  });

  it("forbids_the_maker_from_approving_their_own_request_and_applies_on_second_approval", async () => {
    // Park its OWN approval and decide THAT one. Taking the head of the queue
    // was safe only while ledger.credit was the single action; since 4.1 a
    // distribution payout parks here too, so "the first pending approval" is no
    // longer necessarily this test's.
    const parked = await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(officer1))
      .send({ amountRial: "1000" })
      .expect(202);
    const id = (parked.body as { approvalId: string }).approvalId;

    // officer-1 is the maker → self-approval rejected (four-eyes).
    await request(server).post(`/approvals/${id}/approve`).set(auth(officer1)).expect(409);
    expect(await balance()).toBe("500");

    // officer-2 (a different reviewer) approves → the credit is applied.
    await request(server).post(`/approvals/${id}/approve`).set(auth(officer2)).expect(204);
    expect(await balance()).toBe("1500");

    // The approval is no longer pending, and can't be decided again.
    await request(server).post(`/approvals/${id}/approve`).set(auth(officer2)).expect(409);
    const queue2 = await request(server).get("/approvals").set(auth(officer1)).expect(200);
    expect((queue2.body as { id: string }[]).some((a) => a.id === id)).toBe(false);
  });

  it("rejects_an_approval_without_applying_it", async () => {
    const res = await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(officer1))
      .send({ amountRial: "5000" })
      .expect(202);
    const id = (res.body as { approvalId: string }).approvalId;

    await request(server)
      .post(`/approvals/${id}/reject`)
      .set(auth(officer2))
      .send({ reason: "insufficient bank evidence" })
      .expect(204);

    expect(await balance()).toBe("1500"); // unchanged — the 5000 was not applied
  });

  it("returns_404_for_an_unknown_approval", async () => {
    await request(server).post("/approvals/does-not-exist/approve").set(auth(officer2)).expect(404);
  });

  it("denies_an_investor_the_approvals_queue", async () => {
    await request(server).get("/approvals").set(auth(investorToken)).expect(403);
  });
});
