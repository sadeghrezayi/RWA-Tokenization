import { chainProvider } from "../chain/chain-provider.js";
import { Contract } from "ethers";
import type { PrismaClient } from "@prisma/client";
import type { HealthProbe } from "../../application/reporting/ports.js";

const PAUSED_ABI = ["function paused() view returns (bool)"];

type PausedContract = Contract & { paused(): Promise<boolean> };

// Live reachability checks for the system-health view. Every probe fails soft
// (returns down rather than throwing) so a single outage can't 500 the endpoint.
export class PlatformHealthProbe implements HealthProbe {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ipfsApiUrl: string,
    private readonly rpcUrl: string | undefined,
  ) {}

  async postgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async ipfs(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ipfsApiUrl}/api/v0/version`, { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chain(): Promise<{ reachable: boolean; blockNumber?: number }> {
    if (!this.rpcUrl) return { reachable: false };
    try {
      const blockNumber = await chainProvider(this.rpcUrl).getBlockNumber();
      return { reachable: true, blockNumber };
    } catch {
      return { reachable: false };
    }
  }

  // Deliberately a DATABASE question, not a chain one: it has to answer while
  // the chain is unreachable, which is the only time it matters (K-2).
  async approvedWithoutOnchainIdentity(): Promise<number> {
    const identified = await this.prisma.onchainIdentity.findMany({ select: { investorId: true } });
    return this.prisma.investor.count({
      where: {
        kycState: "approved",
        id: { notIn: identified.map((row) => row.investorId) },
      },
    });
  }

  // P0-2 step 3 residue (K-34). An allocation with no CONFIRMED mint is one
  // whose tokens do not exist — and because capture now follows the mint, its
  // cost is still held on the investor's ledger. That is money in escrow for
  // nothing, and until this count existed nobody could see it happening.
  //
  // Raw SQL because the exclusion is on a COMPOSITE key (offering, investor),
  // which `notIn` cannot express — the alternative is loading every mint row
  // into memory to filter against, which stops being honest at scale.
  //
  // A claimed-but-unconfirmed mint COUNTS: nobody knows whether the chain took
  // it, the money is still held, and it is precisely the case wanting a person.
  async allocationsAwaitingMint(): Promise<{ count: number; heldRial: bigint }> {
    const rows = await this.prisma.$queryRaw<{ count: bigint; held: bigint }[]>`
      SELECT COUNT(*)::bigint AS count,
             COALESCE(SUM(a.cost_rial), 0)::bigint AS held
      FROM offering_allocations a
      WHERE a.allocated > 0
        AND NOT EXISTS (
          SELECT 1 FROM allocation_mints m
          WHERE m.offering_id = a.offering_id
            AND m.investor_id = a.investor_id
            AND m.confirmed_at IS NOT NULL
        )
    `;
    const row = rows[0];
    // An aggregate over zero rows still returns one row, so this is defensive
    // rather than expected — but `rows[0]` is possibly-undefined under
    // noUncheckedIndexedAccess and a silent 0 beats a crash on a health probe.
    if (row === undefined) {
      return { count: 0, heldRial: 0n };
    }
    // COUNT is cast to bigint in SQL (Postgres returns numeric for SUM), so
    // both come back as bigint; the count is small enough to narrow safely.
    return { count: Number(row.count), heldRial: row.held };
  }

  async pausedTokenCount(): Promise<number> {
    if (!this.rpcUrl) return 0;
    try {
      const provider = chainProvider(this.rpcUrl);
      const tokenized = await this.prisma.asset.findMany({
        where: { tokenAddress: { not: null } },
        select: { tokenAddress: true },
      });
      let paused = 0;
      for (const { tokenAddress } of tokenized) {
        if (tokenAddress === null) continue;
        const token = new Contract(tokenAddress, PAUSED_ABI, provider) as PausedContract;
        if (await token.paused()) paused += 1;
      }
      return paused;
    } catch {
      return 0;
    }
  }
}
