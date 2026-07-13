import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, ATTESTATION_ANCHOR } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { RecordingAttestationAnchor } from "../fakes/attestation-fakes.js";

describe("Attestations API (e2e, real Postgres, fake anchor)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  let investorToken: string;
  const anchor = new RecordingAttestationAnchor();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const VALID_UNTIL = "2027-10-01T00:00:00.000Z";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ATTESTATION_ANCHOR)
      .useValue(anchor)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const tokenOf = (res: { body: unknown }) => (res.body as { token: string }).token;
    officerToken = tokenOf(
      await request(server)
        .post("/auth/officer/login")
        .send({ email: "officer@platform.local", password: "officer-dev-pass" })
        .expect(200),
    );

    // Idempotent: the investor may already exist from a prior run (409).
    await request(server)
      .post("/investors")
      .send({ email: "att.investor@example.com", password: "Passw0rd1" });
    investorToken = tokenOf(
      await request(server)
        .post("/auth/login")
        .send({ email: "att.investor@example.com", password: "Passw0rd1" })
        .expect(200),
    );
  }, 30_000);

  beforeEach(async () => {
    await prisma.attestation.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.asset.create({
      data: {
        id: "asset-att-1",
        name: "Vanak Tower SPV",
        type: "asset_backed",
        state: "tokenized",
      },
    });
    anchor.anchored.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const publish = (body: Record<string, unknown>, token = officerToken) =>
    request(server).post("/attestations").set(auth(token)).send(body);

  it("publishes_a_valuation_then_lists_it_and_reads_the_latest_as_fresh", async () => {
    const res = await publish({
      assetId: "asset-att-1",
      kind: "valuation",
      valueRial: "5000000000",
      validUntil: VALID_UNTIL,
    }).expect(201);
    const { payloadHash } = res.body as { attestationId: string; payloadHash: string };
    expect(payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(anchor.anchored).toHaveLength(1);

    const list = await request(server)
      .get("/attestations")
      .query({ assetId: "asset-att-1" })
      .set(auth(officerToken))
      .expect(200);
    const listed = list.body as Record<string, unknown>[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "valuation", valueRial: "5000000000", fresh: true });

    const latest = await request(server)
      .get("/attestations/latest")
      .query({ assetId: "asset-att-1", kind: "valuation" })
      .set(auth(officerToken))
      .expect(200);
    const latestValuation = (latest.body as { latest: Record<string, unknown> }).latest;
    expect(latestValuation).toMatchObject({ valueRial: "5000000000", fresh: true });
    expect(typeof latestValuation.asOf).toBe("string");
  });

  it("returns_null_latest_when_there_is_no_attestation_of_that_kind", async () => {
    const latest = await request(server)
      .get("/attestations/latest")
      .query({ assetId: "asset-att-1", kind: "nav" })
      .set(auth(officerToken))
      .expect(200);
    expect((latest.body as { latest: unknown }).latest).toBeNull();
  });

  it("rejects_a_validity_window_in_the_past_with_400", async () => {
    await publish({
      assetId: "asset-att-1",
      kind: "valuation",
      valueRial: "1000",
      validUntil: "2020-01-01T00:00:00.000Z",
    }).expect(400);
    expect(anchor.anchored).toHaveLength(0);
  });

  it("rejects_an_unknown_kind_with_400", async () => {
    await publish({
      assetId: "asset-att-1",
      kind: "weather",
      valueRial: "1000",
      validUntil: VALID_UNTIL,
    }).expect(400);
  });

  it("rejects_publishing_for_an_unknown_asset_with_404", async () => {
    await publish({
      assetId: "ghost",
      kind: "valuation",
      valueRial: "1000",
      validUntil: VALID_UNTIL,
    }).expect(404);
  });

  it("forbids_an_investor_from_publishing", async () => {
    await publish(
      { assetId: "asset-att-1", kind: "valuation", valueRial: "1000", validUntil: VALID_UNTIL },
      investorToken,
    ).expect(403);
  });
});
