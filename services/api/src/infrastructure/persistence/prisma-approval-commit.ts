import type { PrismaClient } from "@prisma/client";
import { ApprovalActionDispatcher } from "../../application/approvals/ledger-credit-executor.js";
import type { ApprovalCommit } from "../../application/approvals/ports.js";
import { PrismaApprovalRepository } from "./prisma-approval-repository.js";
import { PrismaSettlementRail } from "../settlement/prisma-settlement-rail.js";

// T8 atomicity (1.6a): runs the approval decision + its effect in ONE interactive
// transaction. Takes the SCOPED client — its $transaction hands the callback a
// tenant-scoped, transaction-bound client, so the repositories built here share
// that transaction. If the effect throws, the approved-status write rolls back
// too (all-or-nothing; no double-credit on retry).
export class PrismaApprovalCommit implements ApprovalCommit {
  constructor(private readonly scoped: PrismaClient) {}

  async commit(
    work: (stores: {
      approvals: PrismaApprovalRepository;
      executor: ApprovalActionDispatcher;
    }) => Promise<void>,
  ): Promise<void> {
    await this.scoped.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      const approvals = new PrismaApprovalRepository(txClient);
      const executor = new ApprovalActionDispatcher(new PrismaSettlementRail(txClient));
      await work({ approvals, executor });
    });
  }
}
