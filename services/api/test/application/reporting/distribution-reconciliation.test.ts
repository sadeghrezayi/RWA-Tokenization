import { beforeEach, describe, expect, it } from "vitest";
import { ReconcileDistributions } from "../../../src/application/reporting/reconcile-distributions.js";
import type { LedgerCreditReader } from "../../../src/application/reporting/ports.js";
import { Distribution } from "../../../src/domain/distributions/distribution.js";
import { InMemoryDistributionRepository } from "../../fakes/distribution-fakes.js";

class FakeCredits implements LedgerCreditReader {
  constructor(private readonly rows: { reference: string | undefined; amountRial: bigint }[]) {}
  creditedPerReference(): Promise<Map<string, bigint>> {
    const totals = new Map<string, bigint>();
    for (const row of this.rows) {
      if (row.reference === undefined) continue;
      totals.set(row.reference, (totals.get(row.reference) ?? 0n) + row.amountRial);
    }
    return Promise.resolve(totals);
  }
}

const paid = (
  id: string,
  total: bigint,
  payouts: { investorId: string; tokens: bigint; amountRial: bigint }[],
) =>
  Distribution.restore({
    id,
    assetId: "asset-1",
    tokenAddress: "0xTok",
    totalAmountRial: total,
    state: "paid",
    payouts,
    paidAt: new Date("2026-08-20T10:00:00.000Z"),
  });

describe("ReconcileDistributions (FR-RA-4)", () => {
  let distributions: InMemoryDistributionRepository;

  beforeEach(() => {
    distributions = new InMemoryDistributionRepository();
  });

  const reconcile = (credits: FakeCredits) => new ReconcileDistributions(distributions, credits);

  it("agrees when every Rial declared reached a holder's ledger", async () => {
    await distributions.save(
      paid("d-1", 100_000n, [
        { investorId: "a", tokens: 1n, amountRial: 67_000n },
        { investorId: "b", tokens: 1n, amountRial: 33_000n },
      ]),
    );

    const [row] = await reconcile(
      new FakeCredits([
        { reference: "d-1", amountRial: 67_000n },
        { reference: "d-1", amountRial: 33_000n },
      ]),
    ).execute();

    expect(row?.status).toBe("agrees");
    expect(row?.declaredRial).toBe("100000");
    expect(row?.creditedRial).toBe("100000");
  });

  it("reports a SHORTFALL when less reached holders than was declared", async () => {
    // The failure this exists to catch: money declared, tokens or credits
    // partly missing, and nothing anywhere saying so.
    await distributions.save(
      paid("d-2", 100_000n, [{ investorId: "a", tokens: 1n, amountRial: 100_000n }]),
    );

    const [row] = await reconcile(
      new FakeCredits([{ reference: "d-2", amountRial: 60_000n }]),
    ).execute();

    expect(row?.status).toBe("disagrees");
    expect(row?.differenceRial).toBe("-40000");
  });

  it("reports an OVERPAYMENT the same way, not as success", async () => {
    await distributions.save(
      paid("d-3", 50_000n, [{ investorId: "a", tokens: 1n, amountRial: 50_000n }]),
    );

    const [row] = await reconcile(
      new FakeCredits([{ reference: "d-3", amountRial: 80_000n }]),
    ).execute();

    expect(row?.status).toBe("disagrees");
    expect(row?.differenceRial).toBe("30000");
  });

  it("says NOT RECONCILABLE for a distribution paid before credits carried a reference", async () => {
    // The honesty rule: a distribution whose credits predate the reference
    // column cannot be checked. Reporting it as a mismatch would raise a false
    // alarm; reporting it as agreeing would be a lie. It says neither.
    await distributions.save(
      paid("d-old", 100_000n, [{ investorId: "a", tokens: 1n, amountRial: 100_000n }]),
    );

    const [row] = await reconcile(new FakeCredits([])).execute();

    expect(row?.status).toBe("not_reconcilable");
    expect(row?.creditedRial).toBeUndefined();
  });

  it("leaves out a distribution that was never paid", async () => {
    await distributions.save(
      Distribution.restore({
        id: "d-declared",
        assetId: "asset-1",
        tokenAddress: "0xTok",
        totalAmountRial: 10_000n,
        state: "declared",
        payouts: [{ investorId: "a", tokens: 1n, amountRial: 10_000n }],
      }),
    );

    expect(await reconcile(new FakeCredits([])).execute()).toEqual([]);
  });

  it("puts disagreements first, because that is what an auditor came for", async () => {
    await distributions.save(
      paid("d-ok", 10_000n, [{ investorId: "a", tokens: 1n, amountRial: 10_000n }]),
    );
    await distributions.save(
      paid("d-bad", 20_000n, [{ investorId: "b", tokens: 1n, amountRial: 20_000n }]),
    );

    const rows = await reconcile(
      new FakeCredits([
        { reference: "d-ok", amountRial: 10_000n },
        { reference: "d-bad", amountRial: 5_000n },
      ]),
    ).execute();

    expect(rows.map((r) => r.distributionId)).toEqual(["d-bad", "d-ok"]);
  });
});
