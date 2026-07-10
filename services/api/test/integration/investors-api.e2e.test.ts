import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, CLAIM_ISSUER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";

describe("Investors API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const claims = new RecordingClaimIssuer();

  beforeAll(async () => {
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

  const registerInvestor = async (): Promise<string> => {
    const res = await request(server)
      .post("/investors")
      .send({ email: "investor@example.com" })
      .expect(201);
    return (res.body as { investorId: string }).investorId;
  };

  it("registers_an_investor_and_returns_its_id", async () => {
    const investorId = await registerInvestor();
    expect(investorId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects_a_malformed_email_with_400", async () => {
    await request(server).post("/investors").send({ email: "not-an-email" }).expect(400);
  });

  it("rejects_a_missing_email_with_400", async () => {
    await request(server).post("/investors").send({}).expect(400);
  });

  it("rejects_a_duplicate_email_with_409", async () => {
    await registerInvestor();
    await request(server).post("/investors").send({ email: "INVESTOR@example.com" }).expect(409);
  });

  it("returns_404_for_an_unknown_investor", async () => {
    await request(server).get("/investors/unknown-id").expect(404);
  });

  it("walks_the_full_kyc_flow_to_approval_and_issues_the_claim", async () => {
    const id = await registerInvestor();
    const http = request(server);

    await http.post(`/investors/${id}/kyc/submit`).expect(204);
    await http.post(`/investors/${id}/kyc/start-review`).expect(204);
    await http.post(`/investors/${id}/kyc/approve`).expect(204);

    const res = await http.get(`/investors/${id}`).expect(200);
    expect(res.body).toEqual({
      id,
      email: "investor@example.com",
      kycState: "approved",
      eligibleForClaims: true,
    });
    expect(claims.issuedFor).toEqual([id]);
  });

  it("records_a_rejection_reason_and_stays_ineligible", async () => {
    const id = await registerInvestor();
    const http = request(server);

    await http.post(`/investors/${id}/kyc/submit`).expect(204);
    await http.post(`/investors/${id}/kyc/start-review`).expect(204);
    await http.post(`/investors/${id}/kyc/reject`).send({ reason: "liveness failed" }).expect(204);

    const res = await http.get(`/investors/${id}`).expect(200);
    expect(res.body).toMatchObject({
      kycState: "rejected",
      kycRejectionReason: "liveness failed",
      eligibleForClaims: false,
    });
    expect(claims.issuedFor).toEqual([]);
  });

  it("rejects_an_invalid_kyc_transition_with_409", async () => {
    const id = await registerInvestor();
    await request(server).post(`/investors/${id}/kyc/approve`).expect(409);
  });

  it("rejects_a_reject_without_reason_with_400", async () => {
    const id = await registerInvestor();
    const http = request(server);
    await http.post(`/investors/${id}/kyc/submit`).expect(204);
    await http.post(`/investors/${id}/kyc/start-review`).expect(204);
    await http.post(`/investors/${id}/kyc/reject`).send({}).expect(400);
  });
});
