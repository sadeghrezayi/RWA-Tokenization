import { Contract, JsonRpcProvider } from "ethers";
import type { PrismaClient } from "@prisma/client";
import type { HolderShare } from "../../domain/distributions/distribution.js";
import type { HolderSnapshotProvider } from "../../application/distributions/ports.js";

const BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

type BalanceContract = Contract & { balanceOf(wallet: string): Promise<bigint> };

// FR-YD-1 record-date snapshot: reads the on-chain balance of every custodial
// wallet for this token and maps it back to the platform investor id. The
// chain is the source of truth for holdings (survives transfers, FR-TR).
export class TrexHolderSnapshotProvider implements HolderSnapshotProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rpcUrl: string,
  ) {}

  async snapshot(tokenAddress: string): Promise<HolderShare[]> {
    const wallets = await this.prisma.investorWallet.findMany();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const token = new Contract(tokenAddress, BALANCE_ABI, provider) as BalanceContract;

    const shares: HolderShare[] = [];
    for (const wallet of wallets) {
      if (wallet.address.startsWith("pending:")) {
        continue;
      }
      const tokens = await token.balanceOf(wallet.address);
      if (tokens > 0n) {
        shares.push({ investorId: wallet.investorId, tokens });
      }
    }
    return shares;
  }
}
