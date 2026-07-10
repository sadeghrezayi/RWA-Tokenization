import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ApproveKyc } from "./application/identity/approve-kyc.js";
import { GetInvestor } from "./application/identity/get-investor.js";
import { RegisterInvestor } from "./application/identity/register-investor.js";
import { RejectKyc } from "./application/identity/reject-kyc.js";
import { StartKycReview } from "./application/identity/start-kyc-review.js";
import { SubmitKyc } from "./application/identity/submit-kyc.js";
import type { ClaimIssuer, IdGenerator, InvestorRepository } from "./application/identity/ports.js";
import { DevLogClaimIssuer } from "./infrastructure/chain/dev-log-claim-issuer.js";
import { OnchainidClaimIssuer } from "./infrastructure/chain/onchainid-claim-issuer.js";
import { DomainErrorFilter } from "./infrastructure/http/domain-error.filter.js";
import { InvestorsController } from "./infrastructure/http/investors.controller.js";
import { PrismaInvestorRepository } from "./infrastructure/persistence/prisma-investor-repository.js";
import { PrismaService } from "./infrastructure/persistence/prisma.service.js";

// Injection tokens for the application-layer ports.
export const INVESTOR_REPOSITORY = "INVESTOR_REPOSITORY";
export const CLAIM_ISSUER = "CLAIM_ISSUER";
export const ID_GENERATOR = "ID_GENERATOR";

// Composition root: the only place where ports meet their adapters (see
// docs/engineering/architecture.md). Use-cases stay framework-free — they are
// constructed here via factories, never decorated.
@Module({
  controllers: [InvestorsController],
  providers: [
    PrismaService,
    {
      provide: INVESTOR_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInvestorRepository(prisma),
      inject: [PrismaService],
    },
    {
      // Real ONCHAINID issuance when the devnet env is configured; otherwise the
      // logging placeholder so the API stays bootable without a chain.
      provide: CLAIM_ISSUER,
      useFactory: (prisma: PrismaService): ClaimIssuer => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        const operatorMnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        const claimIssuerAddress = process.env.ONCHAINID_CLAIM_ISSUER_ADDRESS;
        return rpcUrl && operatorMnemonic && claimIssuerAddress
          ? new OnchainidClaimIssuer(prisma, { rpcUrl, operatorMnemonic, claimIssuerAddress })
          : new DevLogClaimIssuer();
      },
      inject: [PrismaService],
    },
    { provide: ID_GENERATOR, useValue: { nextId: () => randomUUID() } satisfies IdGenerator },
    {
      provide: RegisterInvestor,
      useFactory: (repo: InvestorRepository, ids: IdGenerator) => new RegisterInvestor(repo, ids),
      inject: [INVESTOR_REPOSITORY, ID_GENERATOR],
    },
    {
      provide: SubmitKyc,
      useFactory: (repo: InvestorRepository) => new SubmitKyc(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: StartKycReview,
      useFactory: (repo: InvestorRepository) => new StartKycReview(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: ApproveKyc,
      useFactory: (repo: InvestorRepository, claims: ClaimIssuer) => new ApproveKyc(repo, claims),
      inject: [INVESTOR_REPOSITORY, CLAIM_ISSUER],
    },
    {
      provide: RejectKyc,
      useFactory: (repo: InvestorRepository) => new RejectKyc(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: GetInvestor,
      useFactory: (repo: InvestorRepository) => new GetInvestor(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
