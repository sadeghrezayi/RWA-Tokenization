import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule, CLAIM_ISSUER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
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

    await request(server)
      .post("/investors/me/kyc/submit")
      .set("authorization", `Bearer ${token}`)
      .expect(204);

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

  it("records_a_rejection_reason_visible_to_the_investor", async () => {
    const { investorId, token } = await registerAndLogin();
    const officer = await officerToken();

    await request(server)
      .post("/investors/me/kyc/submit")
      .set("authorization", `Bearer ${token}`)
      .expect(204);
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
