import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, EMAIL_SENDER } from "../../src/app.module.js";
import type { EmailSender } from "../../src/application/identity/ports.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";

// Captures the raw reset token the platform would have emailed, so the test can
// complete the out-of-band flow. Stands in for the DevEmailSender/SMTP adapter.
class CapturingEmailSender implements EmailSender {
  readonly sent: { to: string; token: string }[] = [];
  sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ to, token });
    return Promise.resolve();
  }
  sendEmailVerification(): Promise<void> {
    return Promise.resolve(); // not exercised by the reset suite
  }
  tokenFor(to: string): string | undefined {
    return [...this.sent].reverse().find((e) => e.to === to.toLowerCase())?.token;
  }
}

// 1.3c-i: self-service password reset (T4). Real Postgres; a capturing email
// adapter recovers the mailed token to drive the reset half.
describe("Auth password-reset API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const email = `reset-${randomUUID()}@example.com`;
  const OLD = "Passw0rd-old-1";
  const NEW = "Passw0rd-new-2";
  const mailer = new CapturingEmailSender();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).post("/investors").send({ email, password: OLD }).expect(201);
  }, 30_000);

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const investor = await prisma.investor.findFirst({ where: { email: email.toLowerCase() } });
    if (investor) {
      await prisma.passwordResetToken.deleteMany({ where: { investorId: investor.id } });
    }
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
    await app.close();
  });

  it("completes_the_request_then_reset_then_login_with_the_new_password", async () => {
    await request(server)
      .post("/auth/password-reset/request")
      .send({ email })
      .expect(202)
      .expect({ status: "accepted" });

    const token = mailer.tokenFor(email);
    expect(token).toBeTypeOf("string");

    await request(server).post("/auth/password-reset").send({ token, password: NEW }).expect(204);

    // Old password no longer works; the new one does.
    await request(server).post("/auth/login").send({ email, password: OLD }).expect(401);
    await request(server).post("/auth/login").send({ email, password: NEW }).expect(200);
  });

  it("rejects_reusing_a_consumed_token", async () => {
    const token = mailer.tokenFor(email);
    await request(server)
      .post("/auth/password-reset")
      .send({ token, password: "Passw0rd-third-3" })
      .expect(400);
  });

  it("accepts_a_request_for_an_unknown_email_without_sending_mail", async () => {
    const ghost = `ghost-${randomUUID()}@example.com`;
    const before = mailer.sent.length;
    await request(server)
      .post("/auth/password-reset/request")
      .send({ email: ghost })
      .expect(202)
      .expect({ status: "accepted" });
    expect(mailer.tokenFor(ghost)).toBeUndefined();
    expect(mailer.sent).toHaveLength(before); // no mail for a non-account
  });

  it("rejects_an_unknown_token", async () => {
    await request(server)
      .post("/auth/password-reset")
      .send({ token: "not-a-real-token", password: NEW })
      .expect(400);
  });

  it("enforces_the_password_policy_on_reset", async () => {
    // A fresh valid token, then a too-short password.
    await request(server).post("/auth/password-reset/request").send({ email }).expect(202);
    const token = mailer.tokenFor(email);
    await request(server)
      .post("/auth/password-reset")
      .send({ token, password: "short" })
      .expect(400);
  });

  it("requires_an_email_string_on_request", async () => {
    await request(server).post("/auth/password-reset/request").send({}).expect(400);
  });
});
