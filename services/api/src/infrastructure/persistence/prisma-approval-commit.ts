import type { PrismaClient } from "@prisma/client";
import type { ApprovalActionExecutor, ApprovalCommit } from "../../application/approvals/ports.js";
import { PrismaApprovalRepository } from "./prisma-approval-repository.js";

// T8 atomicity (1.6a): runs the approval decision + its effect in ONE interactive
// transaction. Takes the SCOPED client — its $transaction hands the callback a
// tenant-scoped, transaction-bound client, so the repositories built here share
// that transaction. If the effect throws, the approved-status write rolls back
// too (all-or-nothing; no double-credit on retry).
//
// The executor arrives as a FACTORY rather than being built here (4.1). It used
// to construct its own dispatcher, which was fine while the only effect was a
// ledger credit; paying a distribution needs six collaborators, and assembling
// those here would make this file a second composition root — app.module.ts is
// the only one. The factory keeps the wiring there and the transaction here.
export class PrismaApprovalCommit implements ApprovalCommit {
  constructor(
    private readonly scoped: PrismaClient,
    private readonly executorFor: (tx: PrismaClient) => ApprovalActionExecutor,
  ) {}

  async commit(
    work: (stores: {
      approvals: PrismaApprovalRepository;
      executor: ApprovalActionExecutor;
    }) => Promise<void>,
  ): Promise<void> {
    await this.scoped.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      await work({
        approvals: new PrismaApprovalRepository(txClient),
        executor: this.executorFor(txClient),
      });
    });
  }
}
