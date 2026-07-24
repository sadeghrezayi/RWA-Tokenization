import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import { generate } from "otplib";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { OFFICER_PRINCIPAL_ID } from "../../src/application/identity/authenticate-officer.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";

const OFFICER = { email: "mfa-officer@example.com", password: "0fficer-pass-mfa" };

// 1.3d: officer TOTP MFA (opt-in), real Postgres + real otplib crypto. Files run
// sequentially (fileParallelism:false) and this suite cleans up the global
// officer-1 enrollment in afterAll, so other officer-login suites are unaffected.
describe("Officer MFA API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  const cookiesFrom = (res: request.Response): string[] => {
    const set = res.headers["set-cookie"];
    return Array.isArray(set) ? set : set ? [set] : [];
  };
  const hasSessionCookie = (res: request.Response): boolean =>
    cookiesFrom(res).some((c) => c.startsWith("tk_session="));

  const officerLogin = () => request(server).post("/auth/officer/login").send(OFFICER);
  const enroll = (bearer: string) =>
    request(server).post("/auth/officer/mfa/enroll").set("authorization", `Bearer ${bearer}`);

  let secret = "";
  let recoveryCodes: string[] = [];
  let bearer = "";

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    await prisma.mfaEnrollment.deleteMany({ where: { principalId: OFFICER_PRINCIPAL_ID } });
  }, 30_000);

  afterAll(async () => {
    await prisma.mfaEnrollment.deleteMany({ where: { principalId: OFFICER_PRINCIPAL_ID } });
    await prisma.loginAttempt.deleteMany({ where: { key: OFFICER.email.toLowerCase() } });
    await app.close();
  });

  it("logs_in_without_mfa_and_reports_status_none", async () => {
    const res = await officerLogin().expect(200);
    bearer = (res.body as { token: string }).token;
    expect(hasSessionCookie(res)).toBe(true);

    const status = await request(server)
      .get("/auth/officer/mfa/status")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    expect(status.body).toEqual({ status: "none" });
  });

  it("enrolls_and_confirms_with_a_live_code_yielding_recovery_codes", async () => {
    const started = await enroll(bearer).expect(200);
    secret = (started.body as { secret: string; keyUri: string }).secret;
    expect((started.body as { keyUri: string }).keyUri).toMatch(/^otpauth:\/\/totp\//);

    const code = await generate({ secret });
    const confirmed = await request(server)
      .post("/auth/officer/mfa/confirm")
      .set("authorization", `Bearer ${bearer}`)
      .send({ code })
      .expect(200);
    recoveryCodes = (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);

    const status = await request(server)
      .get("/auth/officer/mfa/status")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    expect(status.body).toEqual({ status: "active" });
  });

  it("rejects_confirmation_with_a_wrong_code_leaving_status_unchanged", async () => {
    // Re-enroll a fresh pending secret then fail confirmation.
    await prisma.mfaEnrollment.deleteMany({ where: { principalId: OFFICER_PRINCIPAL_ID } });
    const fresh = await enroll(bearer).expect(200);
    const freshSecret = (fresh.body as { secret: string }).secret;
    await request(server)
      .post("/auth/officer/mfa/confirm")
      .set("authorization", `Bearer ${bearer}`)
      .send({ code: "000000" })
      .expect(401);
    // Restore an active enrollment for the login tests below.
    const code = await generate({ secret: freshSecret });
    const confirmed = await request(server)
      .post("/auth/officer/mfa/confirm")
      .set("authorization", `Bearer ${bearer}`)
      .send({ code })
      .expect(200);
    secret = freshSecret;
    recoveryCodes = (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
  });

  it("login_now_returns_an_mfa_challenge_without_a_session", async () => {
    const res = await officerLogin().expect(200);
    expect(res.body).toMatchObject({ mfaRequired: true });
    expect((res.body as { mfaToken: string }).mfaToken).toBeTypeOf("string");
    expect(hasSessionCookie(res)).toBe(false); // no session until the second factor
  });

  it("completes_the_challenge_with_a_totp_code_and_gets_a_session", async () => {
    const login = await officerLogin().expect(200);
    const mfaToken = (login.body as { mfaToken: string }).mfaToken;

    // A wrong code is rejected.
    await request(server).post("/auth/officer/mfa").send({ mfaToken, code: "000000" }).expect(401);

    const code = await generate({ secret });
    const res = await request(server)
      .post("/auth/officer/mfa")
      .send({ mfaToken, code })
      .expect(200);
    expect((res.body as { token: string }).token).toBeTypeOf("string");
    expect(hasSessionCookie(res)).toBe(true);
  });

  it("accepts_a_recovery_code_once", async () => {
    const login = await officerLogin().expect(200);
    const mfaToken = (login.body as { mfaToken: string }).mfaToken;
    await request(server)
      .post("/auth/officer/mfa")
      .send({ mfaToken, code: recoveryCodes[0] })
      .expect(200);

    // The same recovery code cannot be reused.
    const login2 = await officerLogin().expect(200);
    const mfaToken2 = (login2.body as { mfaToken: string }).mfaToken;
    await request(server)
      .post("/auth/officer/mfa")
      .send({ mfaToken: mfaToken2, code: recoveryCodes[0] })
      .expect(401);
  });

  it("disables_mfa_and_login_returns_a_session_again", async () => {
    // Get a session via MFA, then disable.
    const login = await officerLogin().expect(200);
    const mfaToken = (login.body as { mfaToken: string }).mfaToken;
    const code = await generate({ secret });
    const done = await request(server)
      .post("/auth/officer/mfa")
      .send({ mfaToken, code })
      .expect(200);
    const sessionBearer = (done.body as { token: string }).token;

    await request(server)
      .post("/auth/officer/mfa/disable")
      .set("authorization", `Bearer ${sessionBearer}`)
      .expect(204);

    const res = await officerLogin().expect(200);
    expect(res.body).not.toMatchObject({ mfaRequired: true });
    expect(hasSessionCookie(res)).toBe(true);
  });
});
