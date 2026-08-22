import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule, CLAIM_ISSUER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { seedSubmittedKyc } from "./support/kyc.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";

const OFFICER = { email: "officer@example.com", password: "0fficer-pass" };
const INVESTOR = { email: "investor@example.com", password: "s3cure-pass" };

describe("Investors API (e2e, real Postgres, authenticated)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const claims = new RecordingClaimIssuer();

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLAIM_ISSUER)
      .useValue(claims)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    // Children first: screenings and identities both reference investors with
    // ON DELETE RESTRICT, so deleting the parent while either exists fails.
    await prisma.screeningResult.deleteMany();
    await prisma.onchainIdentity.deleteMany();
    await prisma.investor.deleteMany();
    claims.issuedFor.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const registerAndLogin = async (): Promise<{ investorId: string; token: string }> => {
    const reg = await request(server).post("/investors").send(INVESTOR).expect(201);
    const login = await request(server).post("/auth/login").send(INVESTOR).expect(200);
    const { investorId } = reg.body as { investorId: string };
    const { token } = login.body as { token: string };
    return { investorId, token };
  };

  const officerToken = async (): Promise<string> => {
    const res = await request(server).post("/auth/officer/login").send(OFFICER).expect(200);
    return (res.body as { token: string }).token;
  };

  it("registers_then_logs_in_and_reads_own_profile", async () => {
    const { investorId, token } = await registerAndLogin();

    const res = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      id: investorId,
      email: INVESTOR.email,
      emailVerified: false, // T4: unverified until the emailed link is confirmed
      kycState: "draft",
      eligibleForClaims: false,
    });
  });

  it("rejects_a_weak_password_with_400", async () => {
    await request(server)
      .post("/investors")
      .send({ email: INVESTOR.email, password: "short7c" })
      .expect(400);
  });

  it("rejects_bad_login_credentials_with_401", async () => {
    await registerAndLogin();
    await request(server)
      .post("/auth/login")
      .send({ email: INVESTOR.email, password: "wrong-pass" })
      .expect(401);
  });

  it("rejects_profile_access_without_a_token_with_401", async () => {
    await request(server).get("/investors/me").expect(401);
  });

  it("rejects_officer_actions_for_investor_tokens_with_403", async () => {
    const { investorId, token } = await registerAndLogin();
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
    expect(claims.issuedFor).toEqual([]);
  });

  it("walks_the_authenticated_kyc_flow_to_approval_and_claim", async () => {
    const { investorId, token } = await registerAndLogin();
    const officer = await officerToken();

    await seedSubmittedKyc(prisma, investorId);

    const pending = await request(server)
      .get("/investors/pending-kyc")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    expect((pending.body as { id: string }[]).map((v) => v.id)).toEqual([investorId]);

    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);

    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({ kycState: "approved", eligibleForClaims: true });
    expect(claims.issuedFor).toEqual([investorId]);
  });

  // 4.2: an officer runs a sanctions/PEP check and the result is kept. The
  // provider today is a mock, and every result it produces says so — which is
  // the part that must reach whoever reads it.
  it("screens an applicant and records what produced the result", async () => {
    const { investorId, token } = await registerAndLogin();
    const officer = await officerToken();
    // Through the real wizard: answers are stored ENCRYPTED, so writing a row
    // by hand would seed something the application could never read back.
    await request(server)
      .post("/onboarding/start")
      .set("authorization", `Bearer ${token}`)
      .expect(201);
    await request(server)
      .post("/onboarding/me/steps/profile/answers")
      .set("authorization", `Bearer ${token}`)
      .send({
        answers: {
          fullName: "Ordinary Person",
          nationalId: "0012345678",
          dateOfBirth: "1990-05-05",
          addressLine: "12 Vanak Street",
          city: "Tehran",
        },
      })
      .expect(201);

    const screened = await request(server)
      .post(`/investors/${investorId}/screenings`)
      .set("authorization", `Bearer ${officer}`)
      .expect(201);

    expect(screened.body).toMatchObject({ outcome: "clear", provider: "mock", simulated: true });
    // The disclaimer travels with the result, not just with the screen.
    expect((screened.body as { disclaimer?: string }).disclaimer).toMatch(/simulated/i);

    const history = await request(server)
      .get(`/investors/${investorId}/screenings`)
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    expect((history.body as unknown[]).length).toBe(1);
  });

  it("refuses to screen an applicant who has declared no name", async () => {
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();

    // Nothing declared: a "clear" here would be a clean result for someone
    // nobody checked.
    await request(server)
      .post(`/investors/${investorId}/screenings`)
      .set("authorization", `Bearer ${officer}`)
      .expect(409);
  });

  it("keeps screenings away from the investor themselves", async () => {
    const { investorId, token } = await registerAndLogin();

    await request(server)
      .get(`/investors/${investorId}/screenings`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("records_a_rejection_reason_visible_to_the_investor", async () => {
    const { investorId, token } = await registerAndLogin();
    const officer = await officerToken();

    await seedSubmittedKyc(prisma, investorId);
    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);
    await request(server)
      .post(`/investors/${investorId}/kyc/reject`)
      .set("authorization", `Bearer ${officer}`)
      .send({ reason: "liveness failed" })
      .expect(204);

    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({
      kycState: "rejected",
      kycRejectionReason: "liveness failed",
      eligibleForClaims: false,
    });
  });

  it("rejects_an_invalid_kyc_transition_with_409_for_officers", async () => {
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set("authorization", `Bearer ${officer}`)
      .expect(409);
  });

  it("never_returns_the_password_hash_anywhere", async () => {
    const { investorId, token } = await registerAndLogin();
    const officer = await officerToken();

    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const byId = await request(server)
      .get(`/investors/${investorId}`)
      .set("authorization", `Bearer ${officer}`)
      .expect(200);

    for (const body of [me.body, byId.body]) {
      expect(JSON.stringify(body)).not.toContain("argon2");
      expect(body).not.toHaveProperty("passwordHash");
    }
  });
});
