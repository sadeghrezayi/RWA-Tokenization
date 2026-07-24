import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, EMAIL_SENDER } from "../../src/app.module.js";
import type { EmailSender } from "../../src/application/identity/ports.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";

// Captures both mail kinds so the test can drive the out-of-band flow and assert
// that registration triggers exactly one verification email.
class CapturingEmailSender implements EmailSender {
  readonly sent: { to: string; kind: string; token: string }[] = [];
  sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ to, kind: "password_reset", token });
    return Promise.resolve();
  }
  sendEmailVerification(to: string, token: string): Promise<void> {
    this.sent.push({ to, kind: "email_verification", token });
    return Promise.resolve();
  }
  verificationTokensFor(to: string): string[] {
    return this.sent
      .filter((e) => e.kind === "email_verification" && e.to === to.toLowerCase())
      .map((e) => e.token);
  }
}

// 1.3c-ii: email verification (T4). Real Postgres; a capturing email adapter
// recovers the mailed token to drive the verify half.
describe("Auth email-verification API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const email = `verify-${randomUUID()}@example.com`;
  const PW = "Passw0rd-verify-1";
  const mailer = new CapturingEmailSender();
  let bearer: string;

  const login = async (): Promise<string> => {
    const res = await request(server).post("/auth/login").send({ email, password: PW }).expect(200);
    return (res.body as { token: string }).token;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).post("/investors").send({ email, password: PW }).expect(201);
    bearer = await login();
  }, 30_000);

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const investor = await prisma.investor.findFirst({ where: { email: email.toLowerCase() } });
    if (investor) {
      await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
    }
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
    await app.close();
  });

  it("registration_sends_one_verification_email_and_me_starts_unverified", async () => {
    expect(mailer.verificationTokensFor(email)).toHaveLength(1);
    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    expect((me.body as { emailVerified: boolean }).emailVerified).toBe(false);
  });

  it("verifies_the_email_with_the_mailed_token", async () => {
    const token = mailer.verificationTokensFor(email)[0];
    await request(server).post("/auth/verify-email").send({ token }).expect(204);

    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    expect((me.body as { emailVerified: boolean }).emailVerified).toBe(true);
  });

  it("rejects_reusing_a_consumed_token", async () => {
    const token = mailer.verificationTokensFor(email)[0];
    await request(server).post("/auth/verify-email").send({ token }).expect(400);
  });

  it("does_not_re_send_for_an_already_verified_address", async () => {
    const before = mailer.verificationTokensFor(email).length;
    await request(server)
      .post("/auth/email-verification/request")
      .send({ email })
      .expect(202)
      .expect({ status: "accepted" });
    expect(mailer.verificationTokensFor(email)).toHaveLength(before); // no new mail
  });

  it("accepts_a_request_for_an_unknown_email_without_sending_mail", async () => {
    const ghost = `ghost-${randomUUID()}@example.com`;
    await request(server)
      .post("/auth/email-verification/request")
      .send({ email: ghost })
      .expect(202);
    expect(mailer.verificationTokensFor(ghost)).toHaveLength(0);
  });

  it("rejects_an_unknown_token", async () => {
    await request(server).post("/auth/verify-email").send({ token: "not-real" }).expect(400);
  });

  it("requires_a_token_string", async () => {
    await request(server).post("/auth/verify-email").send({}).expect(400);
  });
});
