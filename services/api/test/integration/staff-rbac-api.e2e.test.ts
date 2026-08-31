import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

const ADMIN = { email: "rbac-admin@example.com", password: "Admin-pass-1" };
const TREASURY = { email: "rbac-treasury@example.com", password: "Treasury-pass-1" };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

// 1.4c: real multi-user staff with distinct roles. Two REAL logins — a
// super-admin (officer-1) and a treasury user (officer-2) seeded by
// StaffBootstrap — demonstrate least-privilege and four-eyes across two people.
describe("Staff RBAC + real two-officer maker-checker (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let adminToken = "";
  let treasuryToken = "";
  let investorToken = "";
  let investorId = "";
  const investorEmail = `rbac-inv-${randomUUID()}@example.com`;

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "e2e-test-secret");
    env.set("OFFICER_EMAIL", ADMIN.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(ADMIN.password));
    env.set("OFFICER2_EMAIL", TREASURY.email);
    env.set("OFFICER2_PASSWORD_HASH", await argon2.hash(TREASURY.password));
    env.set("LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL", "1000");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // StaffBootstrap seeds officer-1 (super_admin) + officer-2 (treasury)
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    adminToken = await login(ADMIN);
    treasuryToken = await login(TREASURY);

    await request(server)
      .post("/investors")
      .send({ email: investorEmail, password: "Passw0rd-9" })
      .expect(201);
    const inv = await request(server)
      .post("/auth/login")
      .send({ email: investorEmail, password: "Passw0rd-9" })
      .expect(200);
    investorToken = (inv.body as { token: string }).token;
    investorId = (inv.body as { investorId: string }).investorId;
  }, 30_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { recipientId: { in: ["officer-1", "officer-2"] } },
    });
    await prisma.approval.deleteMany({ where: { makerId: { in: ["officer-1", "officer-2"] } } });
    await prisma.loginAttempt.deleteMany({
      where: {
        key: { in: [ADMIN.email.toLowerCase(), TREASURY.email.toLowerCase(), investorEmail] },
      },
    });
    env.restoreAll();
    await app.close();
  });

  const login = async (creds: { email: string; password: string }): Promise<string> => {
    const res = await request(server).post("/auth/officer/login").send(creds).expect(200);
    return (res.body as { token: string }).token;
  };
  const balance = async (): Promise<string> => {
    const res = await request(server).get("/ledger/me").set(auth(investorToken)).expect(200);
    return (res.body as { balanceRial: string }).balanceRial;
  };

  it("treasury_can_credit_but_lacks_the_approval_and_kyc_permissions", async () => {
    // Least privilege: treasury has ledger.credit but not approval.decide/kyc.review.
    await request(server).get("/approvals").set(auth(treasuryToken)).expect(403);
    await request(server).get("/investors/pending-kyc").set(auth(treasuryToken)).expect(403);
    // The super-admin holds both.
    await request(server).get("/approvals").set(auth(adminToken)).expect(200);
    await request(server).get("/investors/pending-kyc").set(auth(adminToken)).expect(200);
  });

  it("four_eyes_across_two_real_people_treasury_requests_admin_approves", async () => {
    // Treasury (maker) requests an above-threshold credit.
    const parked = await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(treasuryToken))
      .send({ amountRial: "5000" })
      .expect(202);
    const approvalId = (parked.body as { approvalId: string }).approvalId;
    expect(await balance()).toBe("0");

    // Treasury cannot approve at all (no approval.decide permission) → 403.
    await request(server)
      .post(`/approvals/${approvalId}/approve`)
      .set(auth(treasuryToken))
      .expect(403);
    expect(await balance()).toBe("0");

    // The super-admin (a different person, with approval.decide) approves → applied.
    await request(server)
      .post(`/approvals/${approvalId}/approve`)
      .set(auth(adminToken))
      .expect(204);
    expect(await balance()).toBe("5000");
  });

  it("closes K-35: a request the SUPER-ADMIN makes can now be decided by the approver", async () => {
    // Before the approver account existed this was unreachable. Only
    // super_admin and approver hold `approval.decide`, self-approval is
    // refused, and no approver could exist — so a request the super-admin made
    // was stranded forever. Since 4.1 every payout goes through four eyes.
    const approverToken = await login({
      email: "approver@platform.local",
      password: "officer-dev-pass",
    });

    const parked = await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(adminToken))
      .send({ amountRial: "7000" })
      .expect(202);
    const approvalId = (parked.body as { approvalId: string }).approvalId;
    const before = await balance();

    // The maker still cannot wave through their own request, even as admin.
    await request(server)
      .post(`/approvals/${approvalId}/approve`)
      .set(auth(adminToken))
      .expect(409);
    expect(await balance()).toBe(before);

    // The approver decides it — the path that did not exist before.
    await request(server)
      .post(`/approvals/${approvalId}/approve`)
      .set(auth(approverToken))
      .expect(204);
    expect(BigInt(await balance())).toBe(BigInt(before) + 7000n);
  });

  it("keeps the approver a checker only — it cannot originate a credit", async () => {
    const approverToken = await login({
      email: "approver@platform.local",
      password: "officer-dev-pass",
    });

    await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(approverToken))
      .send({ amountRial: "1000" })
      .expect(403);
  });

  it("alerts the eligible checker when treasury parks an approval, not the maker (1.7c)", async () => {
    await request(server)
      .post(`/ledger/${investorId}/credit`)
      .set(auth(treasuryToken))
      .send({ amountRial: "2000" })
      .expect(202);

    // The super-admin (a checker, and NOT the maker) is alerted in-app.
    const adminNotifs = await request(server)
      .get("/notifications")
      .set(auth(adminToken))
      .expect(200);
    const pending = (adminNotifs.body as { type: string; body: string }[]).filter(
      (n) => n.type === "approval.pending",
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);
    // Human labels: grouped amount + the investor's email, never a raw id.
    expect(pending[0]?.body).toContain("2,000");
    expect(pending[0]?.body).toContain(investorEmail.toLowerCase());
    expect(pending[0]?.body).not.toContain(investorId);

    // Treasury is the maker → never asked to review its own request (four-eyes).
    const treasuryNotifs = await request(server)
      .get("/notifications")
      .set(auth(treasuryToken))
      .expect(200);
    expect(
      (treasuryNotifs.body as { type: string }[]).filter((n) => n.type === "approval.pending"),
    ).toHaveLength(0);
  });
});
