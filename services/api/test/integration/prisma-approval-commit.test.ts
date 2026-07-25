import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule, APPROVAL_COMMIT, SETTLEMENT_RAIL } from "../../src/app.module.js";
import type { ApprovalCommit } from "../../src/application/approvals/ports.js";
import type { LedgerReader } from "../../src/application/identity/ports.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import {
  DEFAULT_TENANT_ID,
  TenantContext,
} from "../../src/infrastructure/tenancy/tenant-context.js";

// 1.6a: the approval decision + its effect (ledger credit) commit in ONE
// transaction. Verified against real Postgres: an effect failure rolls the
// approved-status write back (no approved-but-uncredited state).
describe("PrismaApprovalCommit (transactional atomicity, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let commit: ApprovalCommit;
  let rail: LedgerReader;
  const makerId = "officer-2";
  const seededIds: string[] = [];
  const investorIds: string[] = [];

  const seedPending = async (amountRial: string): Promise<{ id: string; investorId: string }> => {
    const id = `apr-commit-${randomUUID()}`;
    const investorId = `inv-commit-${randomUUID()}`;
    seededIds.push(id);
    investorIds.push(investorId);
    await prisma.approval.create({
      data: {
        id,
        tenantId: DEFAULT_TENANT_ID,
        action: "ledger.credit",
        payload: { investorId, amountRial },
        makerId,
        status: "pending",
      },
    });
    return { id, investorId };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    commit = app.get<ApprovalCommit>(APPROVAL_COMMIT);
    rail = app.get<LedgerReader>(SETTLEMENT_RAIL);
  }, 30_000);

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { id: { in: seededIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { investorId: { in: investorIds } } });
    await prisma.ledgerAccount.deleteMany({ where: { investorId: { in: investorIds } } });
    await app.close();
  });

  it("rolls_back_the_approved_status_when_the_effect_throws", async () => {
    const { id, investorId } = await seedPending("5000");

    await expect(
      TenantContext.run(DEFAULT_TENANT_ID, () =>
        commit.commit(async ({ approvals, executor }) => {
          const approval = await approvals.findById(id);
          if (!approval) throw new Error(`seeded approval ${id} not found`);
          await approvals.save(approval.approve("officer-1", new Date("2026-07-25T10:00:00Z")));
          await executor.execute(approval); // would credit...
          throw new Error("boom after credit"); // ...but the whole tx aborts
        }),
      ),
    ).rejects.toThrow("boom after credit");

    // Nothing landed: approval still pending, no ledger credit.
    const row = await prisma.approval.findUnique({ where: { id } });
    expect(row?.status).toBe("pending");
    const balance = await TenantContext.run(DEFAULT_TENANT_ID, () => rail.balanceOf(investorId));
    expect(balance.balanceRial).toBe(0n);
  });

  it("commits_the_status_and_the_credit_together_on_success", async () => {
    const { id, investorId } = await seedPending("5000");

    await TenantContext.run(DEFAULT_TENANT_ID, () =>
      commit.commit(async ({ approvals, executor }) => {
        const approval = await approvals.findById(id);
        if (!approval) throw new Error(`seeded approval ${id} not found`);
        const approved = approval.approve("officer-1", new Date("2026-07-25T10:00:00Z"));
        await approvals.save(approved);
        await executor.execute(approved);
      }),
    );

    const row = await prisma.approval.findUnique({ where: { id } });
    expect(row?.status).toBe("approved");
    const balance = await TenantContext.run(DEFAULT_TENANT_ID, () => rail.balanceOf(investorId));
    expect(balance.balanceRial).toBe(5000n);
  });
});
