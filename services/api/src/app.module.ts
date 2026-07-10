import { randomUUID } from "node:crypto";
import { Logger, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ApproveKyc } from "./application/identity/approve-kyc.js";
import { AuthenticateInvestor } from "./application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "./application/identity/authenticate-officer.js";
import { GetInvestor } from "./application/identity/get-investor.js";
import { ListPendingKyc } from "./application/identity/list-pending-kyc.js";
import { RegisterInvestor } from "./application/identity/register-investor.js";
import { RejectKyc } from "./application/identity/reject-kyc.js";
import { StartKycReview } from "./application/identity/start-kyc-review.js";
import { SubmitKyc } from "./application/identity/submit-kyc.js";
import type {
  ClaimIssuer,
  IdGenerator,
  InvestorRepository,
  PasswordHasher,
  TokenIssuer,
} from "./application/identity/ports.js";
import type { OfficerCredentials } from "./application/identity/authenticate-officer.js";
import { Argon2PasswordHasher } from "./infrastructure/auth/argon2-password-hasher.js";
import { JwtTokenService } from "./infrastructure/auth/jwt-token-service.js";
import { DevLogClaimIssuer } from "./infrastructure/chain/dev-log-claim-issuer.js";
import { OnchainidClaimIssuer } from "./infrastructure/chain/onchainid-claim-issuer.js";
import { AuthController } from "./infrastructure/http/auth.controller.js";
import { AuthGuard, TOKEN_VERIFIER } from "./infrastructure/http/auth.guard.js";
import { DomainErrorFilter } from "./infrastructure/http/domain-error.filter.js";
import { InvestorsController } from "./infrastructure/http/investors.controller.js";
import { PrismaInvestorRepository } from "./infrastructure/persistence/prisma-investor-repository.js";
import { PrismaService } from "./infrastructure/persistence/prisma.service.js";

// Injection tokens for the application-layer ports.
export const INVESTOR_REPOSITORY = "INVESTOR_REPOSITORY";
export const CLAIM_ISSUER = "CLAIM_ISSUER";
export const ID_GENERATOR = "ID_GENERATOR";
export const PASSWORD_HASHER = "PASSWORD_HASHER";
export const TOKEN_ISSUER = "TOKEN_ISSUER";
export const OFFICER_CREDENTIALS = "OFFICER_CREDENTIALS";

// Composition root: the only place where ports meet their adapters (see
// docs/engineering/architecture.md). Use-cases stay framework-free — they are
// constructed here via factories, never decorated.
@Module({
  controllers: [InvestorsController, AuthController],
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
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: JwtTokenService,
      useFactory: () => {
        const secret = process.env.AUTH_TOKEN_SECRET;
        if (!secret) {
          new Logger("AppModule").warn(
            "AUTH_TOKEN_SECRET is not set — using an insecure dev secret",
          );
        }
        return new JwtTokenService(secret ?? "insecure-dev-secret-change-me");
      },
    },
    { provide: TOKEN_ISSUER, useExisting: JwtTokenService },
    { provide: TOKEN_VERIFIER, useExisting: JwtTokenService },
    {
      // Walking skeleton: one env-configured compliance officer (FR-ID-4);
      // per-officer accounts land together with the FR-RA-2 audit log.
      provide: OFFICER_CREDENTIALS,
      useFactory: async (hasher: PasswordHasher): Promise<OfficerCredentials> => {
        const email = process.env.OFFICER_EMAIL ?? "officer@platform.local";
        const configured = process.env.OFFICER_PASSWORD_HASH;
        if (configured) {
          return { email, passwordHash: configured };
        }
        new Logger("AppModule").warn(
          'OFFICER_PASSWORD_HASH is not set — dev officer password is "officer-dev-pass"',
        );
        return { email, passwordHash: await hasher.hash("officer-dev-pass") };
      },
      inject: [PASSWORD_HASHER],
    },
    {
      provide: RegisterInvestor,
      useFactory: (repo: InvestorRepository, ids: IdGenerator, hasher: PasswordHasher) =>
        new RegisterInvestor(repo, ids, hasher),
      inject: [INVESTOR_REPOSITORY, ID_GENERATOR, PASSWORD_HASHER],
    },
    {
      provide: AuthenticateInvestor,
      useFactory: (repo: InvestorRepository, hasher: PasswordHasher, tokens: TokenIssuer) =>
        new AuthenticateInvestor(repo, hasher, tokens),
      inject: [INVESTOR_REPOSITORY, PASSWORD_HASHER, TOKEN_ISSUER],
    },
    {
      provide: AuthenticateOfficer,
      useFactory: (hasher: PasswordHasher, tokens: TokenIssuer, officer: OfficerCredentials) =>
        new AuthenticateOfficer(hasher, tokens, officer),
      inject: [PASSWORD_HASHER, TOKEN_ISSUER, OFFICER_CREDENTIALS],
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
    {
      provide: ListPendingKyc,
      useFactory: (repo: InvestorRepository) => new ListPendingKyc(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
