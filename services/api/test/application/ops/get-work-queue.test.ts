import { describe, expect, it } from "vitest";
import { GetWorkQueue } from "../../../src/application/ops/get-work-queue.js";
import type { InvestorView } from "../../../src/application/identity/get-investor.js";
import type { ApprovalView } from "../../../src/application/approvals/list-approvals.js";
import type { RedemptionView } from "../../../src/application/redemptions/get-redemptions.js";

const investor = (id: string, email: string): InvestorView => ({
  id,
  email,
  emailVerified: true,
  kycState: "submitted",
  eligibleForClaims: false,
});

const approval = (id: string, createdAt: string): ApprovalView => ({
  id,
  action: "ledger.credit",
  status: "pending",
  summary: `Credit 5,000 Rial to ${id}`,
  makerId: "officer-2",
  createdAt,
});

const redemption = (
  id: string,
  state: RedemptionView["state"],
  requestedAt: string,
): RedemptionView => ({
  id,
  assetId: "asset-1",
  tokenAddress: "0xabc",
  investorId: "inv-1",
  tokens: "100",
  state,
  requestedAt,
});

const setup = (opts: {
  kyc?: InvestorView[];
  approvals?: ApprovalView[];
  redemptions?: RedemptionView[];
}) =>
  new GetWorkQueue(
    { execute: () => Promise.resolve(opts.kyc ?? []) },
    { pending: () => Promise.resolve(opts.approvals ?? []) },
    { executeAll: () => Promise.resolve(opts.redemptions ?? []) },
  );

describe("GetWorkQueue", () => {
  it("reports every queue even when all are empty", async () => {
    const view = await setup({}).execute();
    expect(view.totalOutstanding).toBe(0);
    expect(view.sections.map((s) => s.key)).toEqual(["kyc", "approvals", "redemptions"]);
    expect(view.sections.every((s) => s.total === 0 && s.items.length === 0)).toBe(true);
  });

  it("counts each queue and totals the outstanding work", async () => {
    const view = await setup({
      kyc: [investor("inv-1", "a@x.co"), investor("inv-2", "b@x.co")],
      approvals: [approval("apr-1", "2026-07-27T09:00:00.000Z")],
      redemptions: [redemption("red-1", "requested", "2026-07-27T08:00:00.000Z")],
    }).execute();

    expect(view.totalOutstanding).toBe(4);
    const byKey = Object.fromEntries(view.sections.map((s) => [s.key, s.total]));
    expect(byKey).toEqual({ kyc: 2, approvals: 1, redemptions: 1 });
  });

  it("counts only redemptions that still need a decision", async () => {
    const view = await setup({
      redemptions: [
        redemption("red-1", "requested", "2026-07-27T08:00:00.000Z"),
        redemption("red-2", "fulfilled", "2026-07-26T08:00:00.000Z"),
        redemption("red-3", "rejected", "2026-07-25T08:00:00.000Z"),
      ],
    }).execute();

    const redemptions = view.sections.find((s) => s.key === "redemptions");
    expect(redemptions?.total).toBe(1);
    expect(redemptions?.items.map((i) => i.id)).toEqual(["red-1"]);
  });

  it("puts the longest-waiting item first, so the queue is worked oldest-first", async () => {
    const view = await setup({
      approvals: [
        approval("apr-new", "2026-07-27T12:00:00.000Z"),
        approval("apr-old", "2026-07-20T12:00:00.000Z"),
        approval("apr-mid", "2026-07-25T12:00:00.000Z"),
      ],
    }).execute();

    const approvals = view.sections.find((s) => s.key === "approvals");
    expect(approvals?.items.map((i) => i.id)).toEqual(["apr-old", "apr-mid", "apr-new"]);
    expect(approvals?.items[0]?.waitingSince).toBe("2026-07-20T12:00:00.000Z");
  });

  it("caps the preview per section but still reports the true total", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      approval(`apr-${String(i)}`, `2026-07-2${String(i)}T12:00:00.000Z`),
    );
    const view = await setup({ approvals: many }).execute();

    const approvals = view.sections.find((s) => s.key === "approvals");
    expect(approvals?.total).toBe(9); // the badge must not lie
    expect(approvals?.items).toHaveLength(5); // the preview is capped
  });

  it("labels items with something a human can act on", async () => {
    const view = await setup({
      kyc: [investor("inv-1", "sara@demo.com")],
      approvals: [approval("apr-1", "2026-07-27T09:00:00.000Z")],
    }).execute();

    const kyc = view.sections.find((s) => s.key === "kyc");
    expect(kyc?.items[0]?.label).toContain("sara@demo.com");
    // KYC carries no submitted-at timestamp today, so it cannot be aged.
    expect(kyc?.items[0]?.waitingSince).toBeUndefined();

    const approvals = view.sections.find((s) => s.key === "approvals");
    expect(approvals?.items[0]?.label).toContain("Credit 5,000 Rial");
  });
});
