import { describe, expect, it } from "vitest";
import { CreditInvestorLedger } from "../../../src/application/approvals/credit-investor-ledger.js";
import { DecideApproval } from "../../../src/application/approvals/decide-approval.js";
import { ListApprovals } from "../../../src/application/approvals/list-approvals.js";
import { ApprovalNotFoundError } from "../../../src/application/approvals/errors.js";
import type {
  ApprovalActionExecutor,
  ApprovalRepository,
  LedgerCredit,
} from "../../../src/application/approvals/ports.js";
import { SelfApprovalError } from "../../../src/domain/approvals/errors.js";
import type { Approval, ApprovalStatus } from "../../../src/domain/approvals/approval.js";
import { SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const THRESHOLD = 1000n;
const NOW = new Date("2026-07-25T10:00:00Z");

class InMemoryApprovals implements ApprovalRepository {
  readonly byId = new Map<string, Approval>();
  save(a: Approval): Promise<void> {
    this.byId.set(a.id, a);
    return Promise.resolve();
  }
  findById(id: string): Promise<Approval | undefined> {
    return Promise.resolve(this.byId.get(id));
  }
  findByStatus(status: ApprovalStatus): Promise<Approval[]> {
    return Promise.resolve([...this.byId.values()].filter((a) => a.status === status));
  }
}

class RecordingRail implements LedgerCredit {
  readonly credits: { investorId: string; amountRial: bigint; actorId: string }[] = [];
  credit(investorId: string, amountRial: bigint, actorId: string): Promise<void> {
    this.credits.push({ investorId, amountRial, actorId });
    return Promise.resolve();
  }
}

class RecordingExecutor implements ApprovalActionExecutor {
  readonly executed: Approval[] = [];
  execute(approval: Approval): Promise<void> {
    this.executed.push(approval);
    return Promise.resolve();
  }
}

const setup = () => {
  const approvals = new InMemoryApprovals();
  const rail = new RecordingRail();
  const executor = new RecordingExecutor();
  const clock = new FixedClock(NOW);
  return {
    approvals,
    rail,
    executor,
    credit: new CreditInvestorLedger(
      rail,
      approvals,
      new SequentialIdGenerator(),
      clock,
      THRESHOLD,
    ),
    decide: new DecideApproval(approvals, executor, clock),
    list: new ListApprovals(approvals),
  };
};

describe("CreditInvestorLedger (threshold)", () => {
  it("credits_directly_below_the_threshold", async () => {
    const s = setup();
    const result = await s.credit.execute({
      investorId: "inv-1",
      amountRial: 999n,
      makerId: "officer-a",
    });
    expect(result).toEqual({ status: "credited" });
    expect(s.rail.credits).toEqual([
      { investorId: "inv-1", amountRial: 999n, actorId: "officer-a" },
    ]);
    expect(await s.approvals.findByStatus("pending")).toHaveLength(0);
  });

  it("parks_a_pending_approval_at_or_above_the_threshold", async () => {
    const s = setup();
    const result = await s.credit.execute({
      investorId: "inv-1",
      amountRial: 5000n,
      makerId: "officer-a",
    });
    expect(result.status).toBe("pending_approval");
    expect(s.rail.credits).toHaveLength(0); // nothing moved yet
    const pending = await s.approvals.findByStatus("pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload).toEqual({ investorId: "inv-1", amountRial: "5000" });
    expect(pending[0]?.makerId).toBe("officer-a");
  });
});

describe("DecideApproval (four-eyes)", () => {
  const parkOne = async (s: ReturnType<typeof setup>) => {
    const r = await s.credit.execute({
      investorId: "inv-1",
      amountRial: 5000n,
      makerId: "officer-a",
    });
    if (r.status !== "pending_approval") throw new Error("expected pending");
    return r.approvalId;
  };

  it("executes_the_action_when_a_different_checker_approves", async () => {
    const s = setup();
    const id = await parkOne(s);

    await s.decide.approve({ approvalId: id, checkerId: "officer-b" });

    const stored = await s.approvals.findById(id);
    expect(stored?.status).toBe("approved");
    expect(stored?.checkerId).toBe("officer-b");
    expect(s.executor.executed.map((a) => a.id)).toEqual([id]);
  });

  it("rejects_self_approval_and_does_not_execute", async () => {
    const s = setup();
    const id = await parkOne(s);
    await expect(s.decide.approve({ approvalId: id, checkerId: "officer-a" })).rejects.toThrow(
      SelfApprovalError,
    );
    expect(s.executor.executed).toHaveLength(0);
    expect((await s.approvals.findById(id))?.status).toBe("pending");
  });

  it("rejects_an_approval_without_executing", async () => {
    const s = setup();
    const id = await parkOne(s);
    await s.decide.reject({ approvalId: id, checkerId: "officer-b", reason: "no docs" });
    const stored = await s.approvals.findById(id);
    expect(stored?.status).toBe("rejected");
    expect(stored?.reason).toBe("no docs");
    expect(s.executor.executed).toHaveLength(0);
  });

  it("throws_for_an_unknown_approval", async () => {
    const s = setup();
    await expect(
      s.decide.approve({ approvalId: "missing", checkerId: "officer-b" }),
    ).rejects.toThrow(ApprovalNotFoundError);
  });
});

describe("ListApprovals", () => {
  it("lists_only_pending_with_a_human_summary", async () => {
    const s = setup();
    await s.credit.execute({ investorId: "inv-1", amountRial: 5000n, makerId: "officer-a" });
    const views = await s.list.pending();
    expect(views).toHaveLength(1);
    expect(views[0]?.status).toBe("pending");
    expect(views[0]?.summary).toContain("5000");
    expect(views[0]?.summary).toContain("inv-1");
  });
});
