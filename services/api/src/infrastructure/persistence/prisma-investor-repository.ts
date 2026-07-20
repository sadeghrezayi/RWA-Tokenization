import type { Investor as InvestorRow, PrismaClient } from "@prisma/client";
import { EmailAddress } from "../../domain/identity/email-address.js";
import { Investor } from "../../domain/identity/investor.js";
import { KycStatus } from "../../domain/identity/kyc-status.js";
import { PasswordHash } from "../../domain/identity/password-hash.js";
import type { KycState } from "../../domain/identity/kyc-status.js";
import type {
  InvestorChainDirectory,
  InvestorChainInfo,
  InvestorRepository,
} from "../../application/identity/ports.js";

export class PrismaInvestorRepository implements InvestorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Investor | undefined> {
    const row = await this.prisma.investor.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByEmail(email: EmailAddress): Promise<Investor | undefined> {
    const row = await this.prisma.investor.findUnique({ where: { email: email.value } });
    return row ? toDomain(row) : undefined;
  }

  async findByKycStates(states: readonly KycState[]): Promise<Investor[]> {
    const rows = await this.prisma.investor.findMany({
      where: { kycState: { in: [...states] } },
    });
    return rows.map(toDomain);
  }

  async findAll(): Promise<Investor[]> {
    const rows = await this.prisma.investor.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  }

  async save(investor: Investor): Promise<void> {
    const data = {
      email: investor.email.value,
      passwordHash: investor.passwordHash.value,
      kycState: investor.kycStatus.state,
      kycRejectionReason: investor.kycStatus.rejectionReason ?? null,
    };
    await this.prisma.investor.upsert({
      where: { id: investor.id },
      create: { id: investor.id, ...data },
      update: data,
    });
  }
}

// FR-PT-3: the investor's chain footprint for the admin directory — the
// ONCHAINID and custodial wallet, when they exist ("pending:" placeholders
// are not real wallets and stay hidden).
export class PrismaInvestorChainDirectory implements InvestorChainDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async forInvestor(investorId: string): Promise<InvestorChainInfo> {
    const [identity, wallet] = await Promise.all([
      this.prisma.onchainIdentity.findUnique({ where: { investorId } }),
      this.prisma.investorWallet.findUnique({ where: { investorId } }),
    ]);
    return {
      ...(identity !== null ? { identityAddress: identity.address } : {}),
      ...(wallet !== null && !wallet.address.startsWith("pending:")
        ? { walletAddress: wallet.address }
        : {}),
    };
  }
}

const toDomain = (row: InvestorRow): Investor =>
  Investor.restore(
    row.id,
    EmailAddress.of(row.email),
    PasswordHash.of(row.passwordHash),
    KycStatus.restore(row.kycState, row.kycRejectionReason ?? undefined),
  );
