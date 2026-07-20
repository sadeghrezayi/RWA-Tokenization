import type { PrismaClient } from "@prisma/client";
import type { WalletDirectory, WalletIdentity } from "../../application/registry/ports.js";

// P2: maps custodial wallet addresses (lowercase keys per the port contract)
// back to platform investors for the holder registry. Wallets still pending
// on-chain setup, or without a matching investor row, are simply absent —
// the registry then shows the raw address, which is the honest fallback.
export class PrismaWalletDirectory implements WalletDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async byWallet(): Promise<Map<string, WalletIdentity>> {
    const wallets = await this.prisma.investorWallet.findMany();
    const investors = await this.prisma.investor.findMany({
      where: { id: { in: wallets.map((wallet) => wallet.investorId) } },
      select: { id: true, email: true },
    });
    const emails = new Map(investors.map((investor) => [investor.id, investor.email]));

    const directory = new Map<string, WalletIdentity>();
    for (const wallet of wallets) {
      const email = emails.get(wallet.investorId);
      if (wallet.address.startsWith("pending:") || email === undefined) {
        continue;
      }
      directory.set(wallet.address.toLowerCase(), { investorId: wallet.investorId, email });
    }
    return directory;
  }
}
