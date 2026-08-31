import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { AppModule, CLAIM_ISSUER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { seedSubmittedKyc } from "./support/kyc.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";
import { clearInvestors } from "../support/clear-investors.js";
import { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";
import { scopedEnv } from "../support/scoped-env.js";

// K-41: these suites share one process, so every override is put back.
const env = scopedEnv();

const OFFICER = { email: "officer@example.com", password: "0fficer-pass" };
const INVESTOR = { email: "investor@example.com", password: "s3cure-pass" };

describe("Investors API (e2e, real Postgres, authenticated)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const claims = new RecordingClaimIssuer();

  beforeAll(async () => {
    env.set("AUTH_TOKEN_SECRET", "e2e-test-secret");
    env.set("OFFICER_EMAIL", OFFICER.email);
    env.set("OFFICER_PASSWORD_HASH", await argon2.hash(OFFICER.password));

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
    // Several tables reference investors with ON DELETE RESTRICT, and the list
    // grows. The helper owns that list so a new child is added in one place
    // rather than in every suite that wipes investors.
    await clearInvestors(prisma);
    claims.issuedFor.length = 0;
  });

  afterAll(async () => {
    env.restoreAll();
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

  it("rates an applicant against the model the server publishes, and keeps the reasoning", async () => {
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();

    const model = await request(server)
      .get("/investors/risk-model/current")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    const published = model.body as {
      provisional: boolean;
      notice: string;
      factors: { id: string; options: { value: string }[] }[];
    };
    expect(published.provisional).toBe(true);
    expect(published.notice).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);

    // Answer exactly what the server asked for, using the server's own options.
    const answers: Record<string, string> = {};
    for (const factor of published.factors) {
      answers[factor.id] = factor.options[0]?.value ?? "";
    }

    const rated = await request(server)
      .post(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${officer}`)
      .send({ answers })
      .expect(201);
    const view = rated.body as {
      band: string;
      answers: unknown[];
      assessedBy: string;
      advisory: string;
    };
    expect(view.band).toBe("low");
    expect(view.answers).toHaveLength(published.factors.length);
    // Attributed to the signed-in officer, not to anything the client sent.
    expect(view.assessedBy).not.toBe("");
    // And it says, in the response itself, that it decides nothing.
    expect(view.advisory).toMatch(/advisory/i);

    const history = await request(server)
      .get(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    expect((history.body as unknown[]).length).toBe(1);
  });

  it("refuses a partial rating rather than filing one that scores low for being incomplete", async () => {
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();

    await request(server)
      .post(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${officer}`)
      .send({ answers: { geography: "domestic" } })
      .expect(409);

    // Nothing was filed: a refused rating must not leave a trace that reads
    // like a judgement.
    const history = await request(server)
      .get(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    expect(history.body).toEqual([]);
  });

  it("lists an approved customer nobody has rated as never reviewed, and drops them once rated", async () => {
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();
    // Only APPROVED customers are in periodic review, so walk them there.
    await seedSubmittedKyc(prisma, investorId);
    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);

    const before = await request(server)
      .get("/investors/reviews/due")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    const listed = (before.body as { investorId: string; state: string }[]).find(
      (row) => row.investorId === investorId,
    );
    // The people no record covers must be the loudest entry, not an absence.
    expect(listed?.state).toBe("never_reviewed");

    const model = await request(server)
      .get("/investors/risk-model/current")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    const answers: Record<string, string> = {};
    for (const factor of (model.body as { factors: { id: string; options: { value: string }[] }[] })
      .factors) {
      answers[factor.id] = factor.options[0]?.value ?? "";
    }
    await request(server)
      .post(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${officer}`)
      .send({ answers })
      .expect(201);

    const after = await request(server)
      .get("/investors/reviews/due")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    expect(
      (after.body as { investorId: string }[]).find((row) => row.investorId === investorId),
    ).toBeUndefined();
  });

  it("publishes the review cadence as provisional, not as a rule the platform owns", async () => {
    const officer = await officerToken();

    const cadence = await request(server)
      .get("/investors/reviews/cadence")
      .set("authorization", `Bearer ${officer}`)
      .expect(200);
    const body = cadence.body as { provisional: boolean; notice: string };
    expect(body.provisional).toBe(true);
    expect(body.notice).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);
  });

  it("keeps the due-review list away from investors", async () => {
    const { token } = await registerAndLogin();

    await request(server)
      .get("/investors/reviews/due")
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("keeps risk ratings away from the investor themselves", async () => {
    const { investorId, token } = await registerAndLogin();

    await request(server)
      .get(`/investors/${investorId}/risk-assessments`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("keeps screenings away from the investor themselves", async () => {
    const { investorId, token } = await registerAndLogin();

    await request(server)
      .get(`/investors/${investorId}/screenings`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("approves through a chain outage and lands the claim on the queued retry", async () => {
    // P0-2 step 4, end to end over real HTTP and Postgres. A devnet outage
    // during approval used to answer 503 and wait for an officer to press
    // reissue; the claim now retries itself.
    const { investorId } = await registerAndLogin();
    const officer = await officerToken();
    await seedSubmittedKyc(prisma, investorId);
    await request(server)
      .post(`/investors/${investorId}/kyc/start-review`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);

    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");
    // The approval SUCCEEDS — this was a 503 before.
    await request(server)
      .post(`/investors/${investorId}/kyc/approve`)
      .set("authorization", `Bearer ${officer}`)
      .expect(204);
    expect(claims.issuedFor).toEqual([]);

    // The work is durable, and the chain comes back.
    const queued = await prisma.outboxMessage.findFirst({
      where: { type: "identity.issue_kyc_claim", status: "pending" },
    });
    expect(queued).not.toBeNull();
    claims.failWith = undefined;

    await app.get(DrainOutbox).drain();

    expect(claims.issuedFor).toEqual([investorId]);
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
