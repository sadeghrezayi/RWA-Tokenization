import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  AppModule,
  DOCUMENT_STORE,
  HOLDER_SNAPSHOT_PROVIDER,
  TOKEN_DEPLOYER,
  TOKEN_ISSUER,
} from "../../src/app.module.js";
import type { TokenIssuer } from "../../src/application/identity/ports.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { seedApprovedAsset } from "../support/seed-approved-asset.js";
import { FakeDocumentStore, RecordingTokenDeployer } from "../fakes/asset-fakes.js";
import { StubHolderSnapshotProvider } from "../fakes/distribution-fakes.js";

describe("Distributions API (e2e, real Postgres + ledger, stub snapshot)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officerToken: string;
  let checkerToken = "";
  const snapshot = new StubHolderSnapshotProvider();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_STORE)
      .useValue(new FakeDocumentStore())
      .overrideProvider(TOKEN_DEPLOYER)
      .useValue(new RecordingTokenDeployer())
      .overrideProvider(HOLDER_SNAPSHOT_PROVIDER)
      .useValue(snapshot)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const officer = await request(server)
      .post("/auth/officer/login")
      .send({ email: "officer@platform.local", password: "officer-dev-pass" })
      .expect(200);
    officerToken = (officer.body as { token: string }).token;
    // 4.1: paying takes two people now, so this suite needs a second one.
    checkerToken = await app.get<TokenIssuer>(TOKEN_ISSUER).issue({
      kind: "officer",
      officerId: "officer-2",
    });
  }, 30_000);

  beforeEach(async () => {
    for (const table of [
      "distribution_payouts",
      "distributions",
      "ledger_entries",
      "ledger_accounts",
      "asset_events",
      "asset_documents",
      "assets",
    ]) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenizeAsset = async (): Promise<string> => {
    const assetId = await seedApprovedAsset(server, officerToken, "Yield SPV");
    await request(server)
      .post(`/assets/${assetId}/tokenize`)
      .set(auth(officerToken))
      .send({ symbol: "YLD" })
      .expect(201);
    return assetId;
  };

  const balanceOf = async (investorId: string) => {
    const account = await prisma.ledgerAccount.findUnique({ where: { investorId } });
    return account?.balance ?? 0n;
  };

  it("declares_and_pays_a_pro_rata_distribution_crediting_holder_ledgers", async () => {
    const assetId = await tokenizeAsset();
    snapshot.set([
      { investorId: "alice", tokens: 67n },
      { investorId: "bob", tokens: 33n },
    ]);
    const http = request(server);

    const declared = await http
      .post("/distributions")
      .set(auth(officerToken))
      .send({ assetId, totalAmountRial: "100000" })
      .expect(201);
    const distributionId = (declared.body as { distributionId: string }).distributionId;

    // Reconciliation is available before any money moves.
    const view = await http
      .get(`/distributions/${distributionId}`)
      .set(auth(officerToken))
      .expect(200);
    expect(view.body).toMatchObject({
      state: "declared",
      reconciliation: { declared: "100000", allocated: "100000", balanced: true },
    });
    expect(await balanceOf("alice")).toBe(0n);

    // 4.1 / threat model T3: paying no longer happens on one person's say-so.
    // The request parks; nothing moves until a second officer decides.
    const parked = await http
      .post(`/distributions/${distributionId}/pay`)
      .set(auth(officerToken))
      .expect(201);
    const approvalId = (parked.body as { approvalId: string }).approvalId;
    expect(await balanceOf("alice")).toBe(0n);

    // And the maker cannot wave through their own payout.
    await http.post(`/approvals/${approvalId}/approve`).set(auth(officerToken)).expect(409);
    expect(await balanceOf("alice")).toBe(0n);

    await http.post(`/approvals/${approvalId}/approve`).set(auth(checkerToken)).expect(204);

    expect(await balanceOf("alice")).toBe(67_000n);
    expect(await balanceOf("bob")).toBe(33_000n);
    const kinds = (await prisma.ledgerEntry.findMany({ where: { investorId: "alice" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual(["distribution"]);

    // FR-RA-4: an auditor must be able to verify distributions against bank
    // records. This is that check — declared vs what actually landed.
    const reconciliation = await http
      .get("/reporting/distributions/reconciliation")
      .set(auth(officerToken))
      .expect(200);
    const row = (
      reconciliation.body as { distributionId: string; status: string; creditedRial: string }[]
    ).find((r) => r.distributionId === distributionId);
    expect(row).toMatchObject({ status: "agrees", declaredRial: "100000", creditedRial: "100000" });
  }, 30_000);

  it("rejects_paying_twice_and_never_double_credits", async () => {
    const assetId = await tokenizeAsset();
    snapshot.set([{ investorId: "alice", tokens: 10n }]);
    const http = request(server);
    const declared = await http
      .post("/distributions")
      .set(auth(officerToken))
      .send({ assetId, totalAmountRial: "5000" })
      .expect(201);
    const distributionId = (declared.body as { distributionId: string }).distributionId;

    const first = await http
      .post(`/distributions/${distributionId}/pay`)
      .set(auth(officerToken))
      .expect(201);
    const approvalId = (first.body as { approvalId: string }).approvalId;
    await http.post(`/approvals/${approvalId}/approve`).set(auth(checkerToken)).expect(204);
    expect(await balanceOf("alice")).toBe(5_000n);

    // A second approval of the same request is refused, and a second payout
    // request is refused by the distribution's own state gate — neither can
    // double-credit.
    await http.post(`/approvals/${approvalId}/approve`).set(auth(checkerToken)).expect(409);
    const again = await http
      .post(`/distributions/${distributionId}/pay`)
      .set(auth(officerToken))
      .expect(201);
    const secondApproval = (again.body as { approvalId: string }).approvalId;
    await http.post(`/approvals/${secondApproval}/approve`).set(auth(checkerToken)).expect(409);

    expect(await balanceOf("alice")).toBe(5_000n);
  }, 30_000);

  it("rejects_distribution_on_a_non_tokenized_asset_and_with_no_holders", async () => {
    const http = request(server);
    // Non-tokenized asset.
    const proposed = await http
      .post("/assets")
      .set(auth(officerToken))
      .send({ name: "Bare SPV" })
      .expect(201);
    const bareId = (proposed.body as { assetId: string }).assetId;
    await http
      .post("/distributions")
      .set(auth(officerToken))
      .send({ assetId: bareId, totalAmountRial: "1000" })
      .expect(409);

    // Tokenized but no holders.
    const assetId = await tokenizeAsset();
    snapshot.set([]);
    await http
      .post("/distributions")
      .set(auth(officerToken))
      .send({ assetId, totalAmountRial: "1000" })
      .expect(409);
  }, 30_000);
});
