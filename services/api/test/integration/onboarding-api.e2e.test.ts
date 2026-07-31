import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import type { OnboardingProgressView } from "../../src/application/onboarding/onboarding-view.js";

// 2.3d: the onboarding wizard end to end against real Postgres — the applicant
// path, the officer path, and the boundaries between them.
describe("Onboarding API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let bearer = "";
  let strangerBearer = "";
  let investorId = "";
  let officer = "";

  const email = `onb-${randomUUID()}@example.com`;
  const strangerEmail = `onb-other-${randomUUID()}@example.com`;
  const PW = "Passw0rd-onboarding-1";
  const OFFICER = { email: "onb-officer@example.com", password: "0fficer-pass-onb" };
  const scan = Buffer.from("passport-scan-bytes-for-e2e", "utf8");

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const registerAndLogin = async (address: string): Promise<string> => {
    await request(server).post("/investors").send({ email: address, password: PW }).expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email: address, password: PW })
      .expect(200);
    return (login.body as { token: string }).token;
  };

  const uploadPassport = async (token = bearer, filename = "passport.jpg") =>
    request(server)
      .post("/onboarding/me/evidence")
      .set(auth(token))
      .field("step", "identity_evidence")
      .attach("file", scan, { filename, contentType: "image/jpeg" });

  const completeAllSteps = async (token = bearer): Promise<void> => {
    for (const step of [
      "profile",
      "identity_evidence",
      "bank_account",
      "suitability",
      "agreements",
    ]) {
      await request(server)
        .post(`/onboarding/me/steps/${step}/complete`)
        .set(auth(token))
        .expect(201);
    }
  };

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "e2e-test-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    bearer = await registerAndLogin(email);
    strangerBearer = await registerAndLogin(strangerEmail);
    const me = await request(server).get("/investors/me").set(auth(bearer)).expect(200);
    investorId = (me.body as { id: string }).id;

    const officerLogin = await request(server)
      .post("/auth/officer/login")
      .send(OFFICER)
      .expect(200);
    officer = (officerLogin.body as { token: string }).token;
  }, 30_000);

  afterAll(async () => {
    for (const address of [email, strangerEmail]) {
      const investor = await prisma.investor.findFirst({ where: { email: address.toLowerCase() } });
      if (investor) {
        await prisma.kycEvidence.deleteMany({ where: { investorId: investor.id } });
        await prisma.onboardingApplication.deleteMany({ where: { investorId: investor.id } });
        await prisma.notification.deleteMany({ where: { recipientId: investor.id } });
        await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
        await prisma.investor.deleteMany({ where: { id: investor.id } });
      }
      await prisma.loginAttempt.deleteMany({ where: { key: address.toLowerCase() } });
    }
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("reports nothing started before the applicant begins", async () => {
    const res = await request(server).get("/onboarding/me").set(auth(bearer)).expect(200);
    expect(res.body).toEqual({ started: false });
  });

  it("starts the wizard and resumes it instead of starting a second one", async () => {
    const started = await request(server).post("/onboarding/start").set(auth(bearer)).expect(201);
    const first = started.body as OnboardingProgressView;
    expect(first.status).toBe("in_progress");
    expect(first.outstandingSteps).toHaveLength(5);

    const again = await request(server).post("/onboarding/start").set(auth(bearer)).expect(201);
    expect((again.body as OnboardingProgressView).applicationId).toBe(first.applicationId);
  });

  it("refuses to tick off identity evidence before anything is uploaded (409)", async () => {
    await request(server)
      .post("/onboarding/me/steps/identity_evidence/complete")
      .set(auth(bearer))
      .expect(409);
  });

  it("stores an uploaded document as ciphertext and lists it as metadata", async () => {
    const uploaded = await uploadPassport();
    expect(uploaded.status).toBe(201);
    const descriptor = uploaded.body as { reference: string; byteSize: number };
    expect(descriptor.byteSize).toBe(scan.length);

    const row = await prisma.kycEvidence.findUnique({ where: { reference: descriptor.reference } });
    // The whole point of the storage decision, asserted at the boundary the
    // client actually uses.
    expect(Buffer.from(row?.content ?? []).includes(scan)).toBe(false);

    const progress = await request(server).get("/onboarding/me").set(auth(bearer)).expect(200);
    const view = (progress.body as { application: OnboardingProgressView }).application;
    expect(view.evidence).toHaveLength(1);
    expect(view.evidence[0]).not.toHaveProperty("bytes");
  });

  it("rejects a file type an officer cannot review (400)", async () => {
    await request(server)
      .post("/onboarding/me/evidence")
      .set(auth(bearer))
      .field("step", "identity_evidence")
      .attach("file", Buffer.from("MZ"), {
        filename: "payload.exe",
        contentType: "application/x-msdownload",
      })
      .expect(400);
  });

  it("lets the applicant re-open their own document but not someone else's", async () => {
    const list = await request(server).get("/onboarding/me").set(auth(bearer)).expect(200);
    const reference =
      (list.body as { application: OnboardingProgressView }).application.evidence[0]?.reference ??
      "";

    const mine = await request(server)
      .get(`/onboarding/me/evidence/${reference}`)
      .set(auth(bearer))
      .expect(200);
    const body = mine.body as { contentBase64: string; contentType: string };
    expect(Buffer.from(body.contentBase64, "base64").equals(scan)).toBe(true);
    expect(body.contentType).toBe("image/jpeg");

    // A stranger gets "not found", never a hint that the document exists.
    await request(server).post("/onboarding/start").set(auth(strangerBearer)).expect(201);
    await request(server)
      .get(`/onboarding/me/evidence/${reference}`)
      .set(auth(strangerBearer))
      .expect(404);
  });

  it("submits a complete application and queues it for the officer", async () => {
    await completeAllSteps();

    const submitted = await request(server)
      .post("/onboarding/me/submit")
      .set(auth(bearer))
      .expect(201);
    expect((submitted.body as OnboardingProgressView).status).toBe("submitted");

    const pending = await request(server)
      .get("/investors/pending-kyc")
      .set(auth(officer))
      .expect(200);
    expect((pending.body as { id: string }[]).map((i) => i.id)).toContain(investorId);
  });

  it("refuses to change an application that is with the reviewer (409)", async () => {
    const blocked = await uploadPassport();
    expect(blocked.status).toBe(409);
  });

  it("lets the officer read the application and open the document", async () => {
    const seen = await request(server)
      .get(`/onboarding/${investorId}`)
      .set(auth(officer))
      .expect(200);
    const view = (seen.body as { application: OnboardingProgressView }).application;
    expect(view.status).toBe("submitted");

    const reference = view.evidence[0]?.reference ?? "";
    const document = await request(server)
      .get(`/onboarding/evidence/${reference}`)
      .set(auth(officer))
      .expect(200);
    expect(
      Buffer.from((document.body as { contentBase64: string }).contentBase64, "base64").equals(
        scan,
      ),
    ).toBe(true);
  });

  it("keeps an applicant away from the officer's endpoints (403)", async () => {
    await request(server).get(`/onboarding/${investorId}`).set(auth(bearer)).expect(403);
    await request(server)
      .post(`/onboarding/${investorId}/request-changes`)
      .set(auth(bearer))
      .send({ requests: [{ step: "profile", reason: "nope" }] })
      .expect(403);
  });

  it("sends the application back with reasons, and tells the applicant", async () => {
    const returned = await request(server)
      .post(`/onboarding/${investorId}/request-changes`)
      .set(auth(officer))
      .send({ requests: [{ step: "bank_account", reason: "the account name does not match" }] })
      .expect(201);

    const view = returned.body as OnboardingProgressView;
    expect(view.status).toBe("changes_requested");
    expect(view.outstandingSteps).toEqual(["bank_account"]);

    const inbox = await request(server).get("/notifications").set(auth(bearer)).expect(200);
    const titles = (inbox.body as { title: string; body: string }[]).map((n) => n.title);
    expect(titles).toContain("Your application needs changes");
  });

  it("refuses a change request with no reason (400)", async () => {
    await request(server)
      .post(`/onboarding/${investorId}/request-changes`)
      .set(auth(officer))
      .send({ requests: [] })
      .expect(400);
  });

  it("lets the applicant fix the named step and resubmit", async () => {
    await request(server)
      .post("/onboarding/me/steps/bank_account/complete")
      .set(auth(bearer))
      .expect(201);

    const resubmitted = await request(server)
      .post("/onboarding/me/submit")
      .set(auth(bearer))
      .expect(201);
    expect((resubmitted.body as OnboardingProgressView).status).toBe("submitted");
  });

  it("requires authentication", async () => {
    await request(server).get("/onboarding/me").expect(401);
    await request(server).post("/onboarding/start").expect(401);
  });
});
