import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import type { WorkQueueView } from "../../src/application/ops/get-work-queue.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { seedSubmittedKyc } from "./support/kyc.js";

const OFFICER = { email: "ops-officer@example.com", password: "0fficer-ops-1" };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

// 1.8: the ops work queue over real Postgres — the triage surface that tells an
// operator what is waiting on a human right now.
describe("Work queue API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let officerToken = "";
  let investorToken = "";
  let investorId = "";
  const investorEmail = `ops-inv-${randomUUID()}@example.com`;

  const queue = async (): Promise<WorkQueueView> => {
    const res = await request(server)
      .get("/reporting/work-queue")
      .set(auth(officerToken))
      .expect(200);
    return res.body as WorkQueueView;
  };
  const section = (view: WorkQueueView, key: string) => view.sections.find((s) => s.key === key);

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    const officer = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    officerToken = (officer.body as { token: string }).token;

    await request(server)
      .post("/investors")
      .send({ email: investorEmail, password: "Passw0rd-ops-1" })
      .expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: investorEmail, password: "Passw0rd-ops-1" })
      .expect(200);
    investorToken = (login.body as { token: string }).token;
    investorId = (login.body as { investorId: string }).investorId;
  }, 30_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { recipientId: investorId } });
    await prisma.emailVerificationToken.deleteMany({ where: { investorId } });
    await prisma.loginAttempt.deleteMany({
      where: { key: { in: [OFFICER.email.toLowerCase(), investorEmail.toLowerCase()] } },
    });
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("reports all three queues with true totals", async () => {
    const view = await queue();
    expect(view.sections.map((s) => s.key)).toEqual(["kyc", "approvals", "redemptions"]);
    expect(view.totalOutstanding).toBe(view.sections.reduce((sum, s) => sum + s.total, 0));
  });

  it("picks up a KYC submission as outstanding work", async () => {
    const before = section(await queue(), "kyc")?.total ?? 0;

    await seedSubmittedKyc(prisma, investorId);

    const after = await queue();
    expect(section(after, "kyc")?.total).toBe(before + 1);
    // Labelled by something a human recognises, not a raw id.
    const mine = section(after, "kyc")?.items.find((i) => i.id === investorId);
    expect(mine?.label).toContain(investorEmail.toLowerCase());
  });

  it("drops the item once the work is done", async () => {
    const before = section(await queue(), "kyc")?.total ?? 0;

    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set(auth(officerToken))
      .expect(204);
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set(auth(officerToken))
      .expect(204);

    const after = await queue();
    expect(section(after, "kyc")?.total).toBe(before - 1);
    expect(section(after, "kyc")?.items.some((i) => i.id === investorId)).toBe(false);
  });

  it("requires the reporting permission", async () => {
    await request(server).get("/reporting/work-queue").set(auth(investorToken)).expect(403);
    await request(server).get("/reporting/work-queue").expect(401);
  });
});
