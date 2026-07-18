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
import { ApproveAsset } from "./application/assets/approve-asset.js";
import { AttachDossierDocument } from "./application/assets/attach-dossier-document.js";
import { ConfirmChecklistItem } from "./application/assets/confirm-checklist-item.js";
import { GetAsset, ListAssets } from "./application/assets/get-asset.js";
import { ProposeAsset } from "./application/assets/propose-asset.js";
import { RecordCustody } from "./application/assets/record-custody.js";
import { StartStructuring } from "./application/assets/start-structuring.js";
import { TokenizeAsset } from "./application/assets/tokenize-asset.js";
import type {
  AssetEventLog,
  AssetRepository,
  AssetTokenDeployer,
  DocumentStore,
} from "./application/assets/ports.js";
import { TrexAssetTokenDeployer } from "./infrastructure/chain/trex-asset-token-deployer.js";
import { CloseOffering } from "./application/offerings/close-offering.js";
import { CreateOffering } from "./application/offerings/create-offering.js";
import { GetOffering, ListOfferings } from "./application/offerings/get-offering.js";
import { OpenOffering } from "./application/offerings/open-offering.js";
import { SubscribeToOffering } from "./application/offerings/subscribe-to-offering.js";
import type {
  AssetTokenIssuer,
  Clock,
  OfferingRepository,
  SettlementRail,
} from "./application/offerings/ports.js";
import { TrexAssetTokenIssuer } from "./infrastructure/chain/trex-asset-token-issuer.js";
import { LedgerController } from "./infrastructure/http/ledger.controller.js";
import { OfferingsController } from "./infrastructure/http/offerings.controller.js";
import { PrismaOfferingRepository } from "./infrastructure/persistence/prisma-offering-repository.js";
import { PrismaSettlementRail } from "./infrastructure/settlement/prisma-settlement-rail.js";
import { DeclareDistribution } from "./application/distributions/declare-distribution.js";
import { PayDistribution } from "./application/distributions/pay-distribution.js";
import {
  GetDistribution,
  ListDistributions,
} from "./application/distributions/get-distribution.js";
import type {
  DistributionLedger,
  DistributionRepository,
  HolderSnapshotProvider,
} from "./application/distributions/ports.js";
import { TrexHolderSnapshotProvider } from "./infrastructure/chain/trex-holder-snapshot-provider.js";
import { GetAssetOverview } from "./application/reporting/asset-overview.js";
import { GetSystemHealth } from "./application/reporting/system-health.js";
import type { HealthProbe } from "./application/reporting/ports.js";
import { PlatformHealthProbe } from "./infrastructure/reporting/platform-health-probe.js";
import { ReportingController } from "./infrastructure/http/reporting.controller.js";
import { PublishAttestation } from "./application/attestations/publish-attestation.js";
import {
  GetLatestAttestation,
  ListAttestations,
} from "./application/attestations/get-attestation.js";
import type {
  AttestationAnchor,
  AttestationRepository,
  AttestationSigner,
} from "./application/attestations/ports.js";
import { PrismaAttestationRepository } from "./infrastructure/persistence/prisma-attestation-repository.js";
import {
  DevAttestationSigner,
  DevLogAttestationAnchor,
  EcdsaAttestationSigner,
  OnchainAttestationAnchor,
} from "./infrastructure/chain/attestation-chain.js";
import { AttestationsController } from "./infrastructure/http/attestations.controller.js";
import { TransferTokens } from "./application/transfers/transfer-tokens.js";
import { ListTransfers } from "./application/transfers/get-transfers.js";
import type { AssetTokenTransferrer, TransferRepository } from "./application/transfers/ports.js";
import { RequestRedemption } from "./application/redemptions/request-redemption.js";
import { FulfillRedemption } from "./application/redemptions/fulfill-redemption.js";
import { RejectRedemption } from "./application/redemptions/reject-redemption.js";
import { ListRedemptions } from "./application/redemptions/get-redemptions.js";
import type {
  AssetTokenBurner,
  RedemptionLedger,
  RedemptionRepository,
} from "./application/redemptions/ports.js";
import { ResolveInvestorByEmail } from "./application/identity/resolve-investor-by-email.js";
import { PrismaTransferRepository } from "./infrastructure/persistence/prisma-transfer-repository.js";
import { PrismaRedemptionRepository } from "./infrastructure/persistence/prisma-redemption-repository.js";
import { TrexAssetTokenMover } from "./infrastructure/chain/trex-asset-token-mover.js";
import { TransfersController } from "./infrastructure/http/transfers.controller.js";
import { RedemptionsController } from "./infrastructure/http/redemptions.controller.js";
import { DistributionsController } from "./infrastructure/http/distributions.controller.js";
import { PrismaDistributionRepository } from "./infrastructure/persistence/prisma-distribution-repository.js";
import { IpfsDocumentStore } from "./infrastructure/documents/ipfs-document-store.js";
import { AssetsController } from "./infrastructure/http/assets.controller.js";
import {
  PrismaAssetEventLog,
  PrismaAssetRepository,
} from "./infrastructure/persistence/prisma-asset-repository.js";
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
export const ASSET_REPOSITORY = "ASSET_REPOSITORY";
export const DOCUMENT_STORE = "DOCUMENT_STORE";
export const ASSET_EVENT_LOG = "ASSET_EVENT_LOG";
export const TOKEN_DEPLOYER = "TOKEN_DEPLOYER";
export const OFFERING_REPOSITORY = "OFFERING_REPOSITORY";
export const SETTLEMENT_RAIL = "SETTLEMENT_RAIL";
export const ASSET_TOKEN_ISSUER = "ASSET_TOKEN_ISSUER";
export const CLOCK = "CLOCK";
export const DISTRIBUTION_REPOSITORY = "DISTRIBUTION_REPOSITORY";
export const HOLDER_SNAPSHOT_PROVIDER = "HOLDER_SNAPSHOT_PROVIDER";
export const HEALTH_PROBE = "HEALTH_PROBE";
export const ATTESTATION_REPOSITORY = "ATTESTATION_REPOSITORY";
export const TRANSFER_REPOSITORY = "TRANSFER_REPOSITORY";
export const REDEMPTION_REPOSITORY = "REDEMPTION_REPOSITORY";
export const ASSET_TOKEN_TRANSFERRER = "ASSET_TOKEN_TRANSFERRER";
export const ASSET_TOKEN_BURNER = "ASSET_TOKEN_BURNER";
export const REDEMPTION_LEDGER = "REDEMPTION_LEDGER";
export const ATTESTATION_SIGNER = "ATTESTATION_SIGNER";
export const ATTESTATION_ANCHOR = "ATTESTATION_ANCHOR";
export const DISTRIBUTION_LEDGER = "DISTRIBUTION_LEDGER";

// Composition root: the only place where ports meet their adapters (see
// docs/engineering/architecture.md). Use-cases stay framework-free — they are
// constructed here via factories, never decorated.
@Module({
  controllers: [
    InvestorsController,
    AuthController,
    AssetsController,
    OfferingsController,
    LedgerController,
    DistributionsController,
    ReportingController,
    AttestationsController,
    TransfersController,
    RedemptionsController,
  ],
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
    {
      provide: ASSET_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAssetRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ASSET_EVENT_LOG,
      useFactory: (prisma: PrismaService) => new PrismaAssetEventLog(prisma),
      inject: [PrismaService],
    },
    {
      provide: DOCUMENT_STORE,
      useFactory: (): DocumentStore =>
        new IpfsDocumentStore(process.env.IPFS_API_URL ?? "http://127.0.0.1:5001"),
    },
    {
      provide: ProposeAsset,
      useFactory: (repo: AssetRepository, ids: IdGenerator, events: AssetEventLog) =>
        new ProposeAsset(repo, ids, events),
      inject: [ASSET_REPOSITORY, ID_GENERATOR, ASSET_EVENT_LOG],
    },
    {
      provide: StartStructuring,
      useFactory: (repo: AssetRepository, events: AssetEventLog) =>
        new StartStructuring(repo, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: AttachDossierDocument,
      useFactory: (repo: AssetRepository, docs: DocumentStore, events: AssetEventLog) =>
        new AttachDossierDocument(repo, docs, events),
      inject: [ASSET_REPOSITORY, DOCUMENT_STORE, ASSET_EVENT_LOG],
    },
    {
      provide: RecordCustody,
      useFactory: (repo: AssetRepository, events: AssetEventLog) => new RecordCustody(repo, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: ConfirmChecklistItem,
      useFactory: (repo: AssetRepository, events: AssetEventLog) =>
        new ConfirmChecklistItem(repo, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: ApproveAsset,
      useFactory: (repo: AssetRepository, events: AssetEventLog) => new ApproveAsset(repo, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: GetAsset,
      useFactory: (repo: AssetRepository) => new GetAsset(repo),
      inject: [ASSET_REPOSITORY],
    },
    {
      provide: ListAssets,
      useFactory: (repo: AssetRepository) => new ListAssets(repo),
      inject: [ASSET_REPOSITORY],
    },
    {
      // Real per-asset ERC-3643 deployment when the devnet env is configured;
      // otherwise fail loudly — a fake address would corrupt the registry.
      provide: TOKEN_DEPLOYER,
      useFactory: (): AssetTokenDeployer => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        const operatorMnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        const claimIssuerAddress = process.env.ONCHAINID_CLAIM_ISSUER_ADDRESS;
        if (rpcUrl && operatorMnemonic && claimIssuerAddress) {
          return new TrexAssetTokenDeployer({ rpcUrl, operatorMnemonic, claimIssuerAddress });
        }
        return {
          deployAssetToken: () =>
            Promise.reject(
              new Error("token deployment requires DEVNET_RPC_URL and chain env configuration"),
            ),
        };
      },
    },
    {
      provide: TokenizeAsset,
      useFactory: (repo: AssetRepository, deployer: AssetTokenDeployer, events: AssetEventLog) =>
        new TokenizeAsset(repo, deployer, events),
      inject: [ASSET_REPOSITORY, TOKEN_DEPLOYER, ASSET_EVENT_LOG],
    },
    {
      provide: PrismaSettlementRail,
      useFactory: (prisma: PrismaService) => new PrismaSettlementRail(prisma),
      inject: [PrismaService],
    },
    { provide: SETTLEMENT_RAIL, useExisting: PrismaSettlementRail },
    {
      provide: OFFERING_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOfferingRepository(prisma),
      inject: [PrismaService],
    },
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    {
      // Real chain issuance when the devnet env is configured; otherwise fail
      // loudly — fake minting would falsify the registry (NFR-2).
      provide: ASSET_TOKEN_ISSUER,
      useFactory: (prisma: PrismaService): AssetTokenIssuer => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        const operatorMnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        const claimIssuerAddress = process.env.ONCHAINID_CLAIM_ISSUER_ADDRESS;
        if (rpcUrl && operatorMnemonic && claimIssuerAddress) {
          return new TrexAssetTokenIssuer(prisma, {
            rpcUrl,
            operatorMnemonic,
            claimIssuerAddress,
          });
        }
        const fail = () =>
          Promise.reject(new Error("token issuance requires the devnet chain configuration"));
        return { mint: fail, finalize: fail };
      },
      inject: [PrismaService],
    },
    {
      provide: CreateOffering,
      useFactory: (
        offerings: OfferingRepository,
        assets: AssetRepository,
        ids: IdGenerator,
        events: AssetEventLog,
      ) => new CreateOffering(offerings, assets, ids, events),
      inject: [OFFERING_REPOSITORY, ASSET_REPOSITORY, ID_GENERATOR, ASSET_EVENT_LOG],
    },
    {
      provide: OpenOffering,
      useFactory: (offerings: OfferingRepository, events: AssetEventLog, clock: Clock) =>
        new OpenOffering(offerings, events, clock),
      inject: [OFFERING_REPOSITORY, ASSET_EVENT_LOG, CLOCK],
    },
    {
      provide: SubscribeToOffering,
      useFactory: (
        offerings: OfferingRepository,
        investors: InvestorRepository,
        rail: SettlementRail,
        events: AssetEventLog,
        clock: Clock,
      ) => new SubscribeToOffering(offerings, investors, rail, events, clock),
      inject: [OFFERING_REPOSITORY, INVESTOR_REPOSITORY, SETTLEMENT_RAIL, ASSET_EVENT_LOG, CLOCK],
    },
    {
      provide: CloseOffering,
      useFactory: (
        offerings: OfferingRepository,
        rail: SettlementRail,
        issuer: AssetTokenIssuer,
        events: AssetEventLog,
        clock: Clock,
      ) => new CloseOffering(offerings, rail, issuer, events, clock),
      inject: [OFFERING_REPOSITORY, SETTLEMENT_RAIL, ASSET_TOKEN_ISSUER, ASSET_EVENT_LOG, CLOCK],
    },
    {
      provide: GetOffering,
      useFactory: (offerings: OfferingRepository, assets: AssetRepository) =>
        new GetOffering(offerings, assets),
      inject: [OFFERING_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      provide: ListOfferings,
      useFactory: (offerings: OfferingRepository, assets: AssetRepository) =>
        new ListOfferings(offerings, assets),
      inject: [OFFERING_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      provide: DISTRIBUTION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaDistributionRepository(prisma),
      inject: [PrismaService],
    },
    { provide: DISTRIBUTION_LEDGER, useExisting: PrismaSettlementRail },
    {
      // Real on-chain holder snapshot when the devnet env is configured;
      // otherwise fail loudly (a wrong snapshot would misallocate income).
      provide: HOLDER_SNAPSHOT_PROVIDER,
      useFactory: (prisma: PrismaService): HolderSnapshotProvider => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        if (rpcUrl) {
          return new TrexHolderSnapshotProvider(prisma, rpcUrl);
        }
        return {
          snapshot: () =>
            Promise.reject(new Error("holder snapshot requires the devnet chain configuration")),
        };
      },
      inject: [PrismaService],
    },
    {
      provide: DeclareDistribution,
      useFactory: (
        distributions: DistributionRepository,
        assets: AssetRepository,
        snapshots: HolderSnapshotProvider,
        ids: IdGenerator,
        events: AssetEventLog,
      ) => new DeclareDistribution(distributions, assets, snapshots, ids, events),
      inject: [
        DISTRIBUTION_REPOSITORY,
        ASSET_REPOSITORY,
        HOLDER_SNAPSHOT_PROVIDER,
        ID_GENERATOR,
        ASSET_EVENT_LOG,
      ],
    },
    {
      provide: PayDistribution,
      useFactory: (
        distributions: DistributionRepository,
        ledger: DistributionLedger,
        events: AssetEventLog,
      ) => new PayDistribution(distributions, ledger, events),
      inject: [DISTRIBUTION_REPOSITORY, DISTRIBUTION_LEDGER, ASSET_EVENT_LOG],
    },
    {
      provide: GetDistribution,
      useFactory: (distributions: DistributionRepository, assets: AssetRepository) =>
        new GetDistribution(distributions, assets),
      inject: [DISTRIBUTION_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      provide: ListDistributions,
      useFactory: (distributions: DistributionRepository, assets: AssetRepository) =>
        new ListDistributions(distributions, assets),
      inject: [DISTRIBUTION_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      provide: GetAssetOverview,
      useFactory: (
        assets: AssetRepository,
        offerings: OfferingRepository,
        distributions: DistributionRepository,
        snapshots: HolderSnapshotProvider,
        attestations: AttestationRepository,
        clock: Clock,
      ) => new GetAssetOverview(assets, offerings, distributions, snapshots, attestations, clock),
      inject: [
        ASSET_REPOSITORY,
        OFFERING_REPOSITORY,
        DISTRIBUTION_REPOSITORY,
        HOLDER_SNAPSHOT_PROVIDER,
        ATTESTATION_REPOSITORY,
        CLOCK,
      ],
    },
    {
      provide: GetSystemHealth,
      useFactory: (probe: HealthProbe) => new GetSystemHealth(probe),
      inject: [HEALTH_PROBE],
    },
    {
      provide: HEALTH_PROBE,
      useFactory: (prisma: PrismaService): HealthProbe =>
        new PlatformHealthProbe(
          prisma,
          process.env.IPFS_API_URL ?? "http://127.0.0.1:5001",
          process.env.DEVNET_RPC_URL,
        ),
      inject: [PrismaService],
    },
    {
      provide: ATTESTATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAttestationRepository(prisma),
      inject: [PrismaService],
    },
    {
      // Real ECDSA signer when an attestor key (operator mnemonic) is present;
      // otherwise a dev signer so the API boots without a chain.
      provide: ATTESTATION_SIGNER,
      useFactory: (): AttestationSigner => {
        const mnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        return mnemonic ? new EcdsaAttestationSigner(mnemonic) : new DevAttestationSigner();
      },
    },
    {
      // On-chain anchoring when the registry + devnet are configured; else the
      // logging fallback (FR-OR-1 anchor is best-effort in dev).
      provide: ATTESTATION_ANCHOR,
      useFactory: (): AttestationAnchor => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        const mnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        const registry = process.env.ATTESTATION_REGISTRY_ADDRESS;
        return rpcUrl && mnemonic && registry
          ? new OnchainAttestationAnchor(rpcUrl, mnemonic, registry)
          : new DevLogAttestationAnchor();
      },
    },
    {
      provide: PublishAttestation,
      useFactory: (
        attestations: AttestationRepository,
        assets: AssetRepository,
        signer: AttestationSigner,
        anchor: AttestationAnchor,
        ids: IdGenerator,
        events: AssetEventLog,
        clock: Clock,
      ) => new PublishAttestation(attestations, assets, signer, anchor, ids, events, clock),
      inject: [
        ATTESTATION_REPOSITORY,
        ASSET_REPOSITORY,
        ATTESTATION_SIGNER,
        ATTESTATION_ANCHOR,
        ID_GENERATOR,
        ASSET_EVENT_LOG,
        CLOCK,
      ],
    },
    {
      provide: GetLatestAttestation,
      useFactory: (attestations: AttestationRepository, clock: Clock) =>
        new GetLatestAttestation(attestations, clock),
      inject: [ATTESTATION_REPOSITORY, CLOCK],
    },
    {
      provide: ListAttestations,
      useFactory: (attestations: AttestationRepository, clock: Clock) =>
        new ListAttestations(attestations, clock),
      inject: [ATTESTATION_REPOSITORY, CLOCK],
    },
    {
      provide: TRANSFER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaTransferRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: REDEMPTION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaRedemptionRepository(prisma),
      inject: [PrismaService],
    },
    {
      // Real chain moves when the devnet env is configured; otherwise fail
      // loudly — faking transfers/burns would falsify the registry (NFR-2).
      provide: TrexAssetTokenMover,
      useFactory: (prisma: PrismaService): TrexAssetTokenMover | undefined => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        const operatorMnemonic = process.env.PLATFORM_OPERATOR_MNEMONIC;
        const claimIssuerAddress = process.env.ONCHAINID_CLAIM_ISSUER_ADDRESS;
        return rpcUrl && operatorMnemonic && claimIssuerAddress
          ? new TrexAssetTokenMover(prisma, { rpcUrl, operatorMnemonic, claimIssuerAddress })
          : undefined;
      },
      inject: [PrismaService],
    },
    {
      provide: ASSET_TOKEN_TRANSFERRER,
      useFactory: (mover: TrexAssetTokenMover | undefined): AssetTokenTransferrer =>
        mover ?? {
          balanceOf: () =>
            Promise.reject(new Error("token transfers require the devnet chain configuration")),
          transfer: () =>
            Promise.reject(new Error("token transfers require the devnet chain configuration")),
        },
      inject: [TrexAssetTokenMover],
    },
    {
      provide: ASSET_TOKEN_BURNER,
      useFactory: (mover: TrexAssetTokenMover | undefined): AssetTokenBurner =>
        mover ?? {
          burn: () =>
            Promise.reject(new Error("token burns require the devnet chain configuration")),
        },
      inject: [TrexAssetTokenMover],
    },
    {
      provide: REDEMPTION_LEDGER,
      useFactory: (rail: PrismaSettlementRail): RedemptionLedger => ({
        credit: (investorId, amountRial) => rail.payoutRedemption(investorId, amountRial),
      }),
      inject: [PrismaSettlementRail],
    },
    {
      provide: ResolveInvestorByEmail,
      useFactory: (investors: InvestorRepository) => new ResolveInvestorByEmail(investors),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: TransferTokens,
      useFactory: (
        transfers: TransferRepository,
        investors: InvestorRepository,
        assets: AssetRepository,
        transferrer: AssetTokenTransferrer,
        ids: IdGenerator,
        events: AssetEventLog,
        clock: Clock,
      ) => new TransferTokens(transfers, investors, assets, transferrer, ids, events, clock),
      inject: [
        TRANSFER_REPOSITORY,
        INVESTOR_REPOSITORY,
        ASSET_REPOSITORY,
        ASSET_TOKEN_TRANSFERRER,
        ID_GENERATOR,
        ASSET_EVENT_LOG,
        CLOCK,
      ],
    },
    {
      provide: ListTransfers,
      useFactory: (transfers: TransferRepository) => new ListTransfers(transfers),
      inject: [TRANSFER_REPOSITORY],
    },
    {
      provide: RequestRedemption,
      useFactory: (
        redemptions: RedemptionRepository,
        investors: InvestorRepository,
        assets: AssetRepository,
        transferrer: AssetTokenTransferrer,
        ids: IdGenerator,
        events: AssetEventLog,
        clock: Clock,
      ) => new RequestRedemption(redemptions, investors, assets, transferrer, ids, events, clock),
      inject: [
        REDEMPTION_REPOSITORY,
        INVESTOR_REPOSITORY,
        ASSET_REPOSITORY,
        ASSET_TOKEN_TRANSFERRER,
        ID_GENERATOR,
        ASSET_EVENT_LOG,
        CLOCK,
      ],
    },
    {
      provide: FulfillRedemption,
      useFactory: (
        redemptions: RedemptionRepository,
        attestations: AttestationRepository,
        snapshots: HolderSnapshotProvider,
        burner: AssetTokenBurner,
        ledger: RedemptionLedger,
        events: AssetEventLog,
        clock: Clock,
      ) =>
        new FulfillRedemption(redemptions, attestations, snapshots, burner, ledger, events, clock),
      inject: [
        REDEMPTION_REPOSITORY,
        ATTESTATION_REPOSITORY,
        HOLDER_SNAPSHOT_PROVIDER,
        ASSET_TOKEN_BURNER,
        REDEMPTION_LEDGER,
        ASSET_EVENT_LOG,
        CLOCK,
      ],
    },
    {
      provide: RejectRedemption,
      useFactory: (redemptions: RedemptionRepository, events: AssetEventLog, clock: Clock) =>
        new RejectRedemption(redemptions, events, clock),
      inject: [REDEMPTION_REPOSITORY, ASSET_EVENT_LOG, CLOCK],
    },
    {
      provide: ListRedemptions,
      useFactory: (redemptions: RedemptionRepository) => new ListRedemptions(redemptions),
      inject: [REDEMPTION_REPOSITORY],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
