import { Contract, JsonRpcProvider } from "ethers";
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
      const blockNumber = await new JsonRpcProvider(this.rpcUrl).getBlockNumber();
      return { reachable: true, blockNumber };
    } catch {
      return { reachable: false };
    }
  }

  async pausedTokenCount(): Promise<number> {
    if (!this.rpcUrl) return 0;
    try {
      const provider = new JsonRpcProvider(this.rpcUrl);
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
