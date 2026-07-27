import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule, EMAIL_SENDER } from "../../src/app.module.js";
import type { EmailSender } from "../../src/application/identity/ports.js";
import { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";

const OFFICER = { email: "notif-officer@example.com", password: "0fficer-notif-1" };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

// Captures notification emails so the important-notification path can be proven
// end-to-end (the real adapter is the labeled dev sink).
class CapturingEmailSender implements EmailSender {
  readonly notifications: { to: string; title: string; body: string }[] = [];
  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
  sendEmailVerification(): Promise<void> {
    return Promise.resolve();
  }
  sendNotification(to: string, title: string, body: string): Promise<void> {
    this.notifications.push({ to, title, body });
    return Promise.resolve();
  }
}

// 1.7c-ii: a KYC decision reaches the investor BOTH in-app and (because it is
// marked important) by email, delivered durably through the outbox.
describe("Notification triggers: KYC decision (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let drainer: DrainOutbox;
  let officerToken = "";
  let investorToken = "";
  let investorId = "";
  const mailer = new CapturingEmailSender();
  const investorEmail = `kyc-notif-${randomUUID()}@example.com`;
  const PW = "Passw0rd-kyc-1";

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    drainer = app.get(DrainOutbox);
    await prisma.outboxMessage.deleteMany({}); // clean slate for deterministic drains

    const officer = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    officerToken = (officer.body as { token: string }).token;

    await request(server)
      .post("/investors")
      .send({ email: investorEmail, password: PW })
      .expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: investorEmail, password: PW })
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

  it("notifies the investor in-app and by email when their KYC is approved", async () => {
    await request(server).post("/investors/me/kyc/submit").set(auth(investorToken)).expect(204);
    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set(auth(officerToken))
      .expect(204);

    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set(auth(officerToken))
      .expect(204);

    // In-app, immediately.
    const feed = await request(server).get("/notifications").set(auth(investorToken)).expect(200);
    const decided = (feed.body as { type: string; title: string }[]).filter(
      (n) => n.type === "kyc.decided",
    );
    expect(decided).toHaveLength(1);
    expect(decided[0]?.title).toContain("approved");

    // And by email — queued to the outbox, delivered when the drainer runs.
    expect(mailer.notifications).toHaveLength(0); // nothing sent inline
    await drainer.drain();
    const emailed = mailer.notifications.filter((m) => m.to === investorEmail.toLowerCase());
    expect(emailed).toHaveLength(1);
    expect(emailed[0]?.title).toContain("approved");
  });
});
