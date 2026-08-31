import { randomUUID } from "node:crypto";
import { Logger, Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ApproveKyc } from "./application/identity/approve-kyc.js";
import { ReissueKycClaim } from "./application/identity/reissue-kyc-claim.js";
import { ScreenInvestor } from "./application/screening/screen-investor.js";
import { ListScreenings } from "./application/screening/screening-views.js";
import { AssessRisk } from "./application/risk/assess-risk.js";
import { ListRiskAssessments } from "./application/risk/risk-views.js";
import { ListDueReviews } from "./application/risk/list-due-reviews.js";
import type { RiskAssessmentRepository } from "./application/risk/ports.js";
import { PrismaRiskAssessmentRepository } from "./infrastructure/persistence/prisma-risk-assessment-repository.js";
import { MockSanctionsScreening } from "./infrastructure/screening/mock-sanctions-screening.js";
import { PrismaScreeningRepository } from "./infrastructure/persistence/prisma-screening-repository.js";
import type { SanctionsScreening, ScreeningRepository } from "./application/screening/ports.js";
import { AuthenticateInvestor } from "./application/identity/authenticate-investor.js";
import { AuthenticateStaff } from "./application/identity/authenticate-staff.js";
import { GetInvestor } from "./application/identity/get-investor.js";
import { ListPendingKyc } from "./application/identity/list-pending-kyc.js";
import { RegisterInvestor } from "./application/identity/register-investor.js";
import { RejectKyc } from "./application/identity/reject-kyc.js";
import { StartKycReview } from "./application/identity/start-kyc-review.js";
import { GetInvestorDetail, ListInvestors } from "./application/identity/investor-directory.js";
import {
  AddCrmNote,
  AddInvestorTag,
  CompleteFollowUp,
  CreateFollowUp,
  ListOpenFollowUps,
  RemoveInvestorTag,
  SetRelationshipStage,
} from "./application/crm/crm-use-cases.js";
import { GetInvestorSales } from "./application/crm/investor-sales.js";
import { GetInvestorTimeline } from "./application/crm/investor-timeline.js";
import type {
  CrmNoteRepository,
  CrmProfileRepository,
  FollowUpRepository,
} from "./application/crm/ports.js";
import {
  PrismaCrmNoteRepository,
  PrismaCrmProfileRepository,
  PrismaFollowUpRepository,
} from "./infrastructure/persistence/prisma-crm-repositories.js";
import { CrmController } from "./infrastructure/http/crm.controller.js";
import type {
  ClaimIssuer,
  IdGenerator,
  InvestorChainDirectory,
  InvestorRepository,
  KycDecisionNotifier,
  LedgerReader,
  PasswordHasher,
  StaffUserRepository,
  TokenIssuer,
} from "./application/identity/ports.js";
import { PrismaStaffUserRepository } from "./infrastructure/persistence/prisma-staff-user-repository.js";
import { StaffBootstrap } from "./infrastructure/auth/staff-bootstrap.js";
import { ApproveAsset } from "./application/assets/approve-asset.js";
import { SetDocumentVisibility } from "./application/assets/set-document-visibility.js";
import { ReviewDossierDocument } from "./application/assets/review-dossier-document.js";
import { ListDocumentsAwaitingReview } from "./application/assets/list-documents-awaiting-review.js";
import { RecordRealEstateProfile } from "./application/assets/record-real-estate-profile.js";
import { SetConveyedRight } from "./application/assets/set-conveyed-right.js";
import { GetMyAssetDocuments } from "./application/assets/get-my-asset-documents.js";
import { AttachDossierDocument } from "./application/assets/attach-dossier-document.js";
import { AttachIssuerDocument } from "./application/assets/attach-issuer-document.js";
import { ConfirmChecklistItem } from "./application/assets/confirm-checklist-item.js";
import { GetAsset, ListAssets, ListIssuerAssets } from "./application/assets/get-asset.js";
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
import { MintAllocation } from "./application/offerings/mint-allocation.js";
import { SettleWithRetry } from "./application/offerings/settle-with-retry.js";
import { SettleAllocation } from "./application/offerings/settle-allocation.js";
import { ListAllocationsAwaitingMint } from "./application/reporting/allocations-awaiting-mint.js";
import { ReleaseStrandedEscrow } from "./application/offerings/release-stranded-escrow.js";
import { PrismaAwaitingMintReader } from "./infrastructure/reporting/prisma-awaiting-mint-reader.js";
import { SettleAllocationHandler } from "./infrastructure/outbox/settle-allocation-handler.js";
import { KycClaimHandler } from "./infrastructure/outbox/kyc-claim-handler.js";
import { PrismaAllocationMintLog } from "./infrastructure/persistence/prisma-allocation-mint-log.js";
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
import {
  CreditInvestorLedger,
  DEFAULT_LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL,
} from "./application/approvals/credit-investor-ledger.js";
import { DecideApproval } from "./application/approvals/decide-approval.js";
import { ListApprovals } from "./application/approvals/list-approvals.js";
import type {
  ApprovalCommit,
  ApprovalParkedNotifier,
  ApprovalRepository,
  LedgerCredit,
} from "./application/approvals/ports.js";
import { PrismaApprovalRepository } from "./infrastructure/persistence/prisma-approval-repository.js";
import { PrismaApprovalCommit } from "./infrastructure/persistence/prisma-approval-commit.js";
import { ApprovalActionDispatcher } from "./application/approvals/ledger-credit-executor.js";
import { ApprovalsController } from "./infrastructure/http/approvals.controller.js";
import { ListNotifications } from "./application/notifications/list-notifications.js";
import { GetUnreadCount } from "./application/notifications/get-unread-count.js";
import { MarkNotificationRead } from "./application/notifications/mark-notification-read.js";
import { NotificationService } from "./application/notifications/notification-service.js";
import { EmailingNotifier } from "./application/notifications/emailing-notifier.js";
import { NotifyApprovalPending } from "./application/notifications/notify-approval-pending.js";
import { NotifyKycDecision } from "./application/notifications/notify-kyc-decision.js";
import { NotifyDistributionPaid } from "./application/notifications/notify-distribution-paid.js";
import { NotifyDueFollowUps } from "./application/notifications/notify-due-follow-ups.js";
import { GetWorkQueue } from "./application/ops/get-work-queue.js";
import { GetPublicCatalog } from "./application/public/get-public-catalog.js";
import { PublishOffering } from "./application/offerings/publish-offering.js";
import type { PublicPageRevalidator } from "./application/offerings/ports.js";
import { WebPublicPageRevalidator } from "./infrastructure/http/web-public-page-revalidator.js";
import { PublicController } from "./infrastructure/http/public.controller.js";
import { OnboardingController } from "./infrastructure/http/onboarding.controller.js";
import { PortfolioController } from "./infrastructure/http/portfolio.controller.js";
import { FundingController } from "./infrastructure/http/funding.controller.js";
import { IssuersController } from "./infrastructure/http/issuers.controller.js";
import { PrismaIssuerRepository } from "./infrastructure/persistence/prisma-issuer-repository.js";
import type {
  IssuerRepository,
  PersonDirectory,
  PersonVerification,
} from "./application/issuers/ports.js";
import { ApplyAsIssuer } from "./application/issuers/apply-as-issuer.js";
import { DecideIssuerApplication } from "./application/issuers/decide-issuer-application.js";
import { AddTeamMember } from "./application/issuers/add-team-member.js";
import { RemoveTeamMember } from "./application/issuers/remove-team-member.js";
import { IssuerTeamAccess } from "./application/issuers/issuer-team-access.js";
import { GetIssuerAssetHolders } from "./application/issuers/issuer-asset-holders.js";
import {
  PrismaAssetOwnerReader,
  PrismaIssuerAllocationReader,
} from "./infrastructure/persistence/prisma-issuer-holder-readers.js";
import {
  GetIssuer,
  ListIssuerTeam,
  ListIssuers,
  ListMyIssuerOrganisations,
} from "./application/issuers/issuer-views.js";
import { InvestorPersonVerification } from "./application/issuers/investor-person-verification.js";
import { InvestorPersonDirectory } from "./application/issuers/investor-person-directory.js";
import { PrismaFundingRepository } from "./infrastructure/persistence/prisma-funding-repository.js";
import type { FundingRepository, PaymentInstructions } from "./application/funding/ports.js";
import { RequestFunding } from "./application/funding/request-funding.js";
import { ConfirmFunding } from "./application/funding/confirm-funding.js";
import { RejectFunding } from "./application/funding/reject-funding.js";
import { CancelFunding } from "./application/funding/cancel-funding.js";
import { ListMyFunding, ListPendingFunding } from "./application/funding/list-funding.js";
import { GetMyPortfolio } from "./application/portfolio/get-my-portfolio.js";
import { AesGcmCipher } from "./infrastructure/crypto/aes-gcm-cipher.js";
import { PrismaEvidenceStore } from "./infrastructure/persistence/prisma-evidence-store.js";
import { PrismaStepAnswerStore } from "./infrastructure/persistence/prisma-step-answer-store.js";
import { PrismaOnboardingRepository } from "./infrastructure/persistence/prisma-onboarding-repository.js";
import type {
  EvidenceStore,
  OnboardingRepository,
  StepAnswerStore,
} from "./application/onboarding/ports.js";
import { StartOnboarding } from "./application/onboarding/start-onboarding.js";
import { GetOnboardingProgress } from "./application/onboarding/get-onboarding-progress.js";
import { CompleteOnboardingStep } from "./application/onboarding/complete-onboarding-step.js";
import { UploadEvidence } from "./application/onboarding/upload-evidence.js";
import { RemoveEvidence } from "./application/onboarding/remove-evidence.js";
import { SubmitOnboarding } from "./application/onboarding/submit-onboarding.js";
import { DownloadEvidence } from "./application/onboarding/download-evidence.js";
import { RequestOnboardingChanges } from "./application/onboarding/request-onboarding-changes.js";
import { SaveStepAnswers } from "./application/onboarding/save-step-answers.js";
import { GetStepAnswers } from "./application/onboarding/get-step-answers.js";
import type { JobScheduler } from "./application/jobs/ports.js";
import { PgBossJobScheduler } from "./infrastructure/jobs/pg-boss-job-scheduler.js";
import { ScheduledJobsBootstrap } from "./infrastructure/jobs/scheduled-jobs.bootstrap.js";
import type { NotificationRepository, Notifier } from "./application/notifications/ports.js";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification-repository.js";
import { NotificationsController } from "./infrastructure/http/notifications.controller.js";
import { DeclareDistribution } from "./application/distributions/declare-distribution.js";
import { PayDistribution } from "./application/distributions/pay-distribution.js";
import { RequestDistributionPayout } from "./application/distributions/request-distribution-payout.js";
import {
  GetDistribution,
  ListDistributions,
} from "./application/distributions/get-distribution.js";
import type {
  DistributionRepository,
  HolderSnapshotProvider,
} from "./application/distributions/ports.js";
import { TrexHolderSnapshotProvider } from "./infrastructure/chain/trex-holder-snapshot-provider.js";
import { GetAssetOverview } from "./application/reporting/asset-overview.js";
import { GetSystemHealth } from "./application/reporting/system-health.js";
import { GetAuditTrail } from "./application/reporting/audit-trail.js";
import type { AssetEventReader, HealthProbe } from "./application/reporting/ports.js";
import { GetHolderRegistry } from "./application/registry/get-holder-registry.js";
import { ReconcileDistributions } from "./application/reporting/reconcile-distributions.js";
import { PrismaLedgerCreditReader } from "./infrastructure/persistence/prisma-ledger-credit-reader.js";
import {
  ExportHolderRegistryCsv,
  ExportTransferHistoryCsv,
} from "./application/registry/export-csv.js";
import type { TokenEventSource, WalletDirectory } from "./application/registry/ports.js";
import { EthersTokenEventSource } from "./infrastructure/chain/ethers-token-event-source.js";
import { PrismaWalletDirectory } from "./infrastructure/persistence/prisma-wallet-directory.js";
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
import { GetMyHoldings } from "./application/transfers/get-holdings.js";
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
  PrismaAssetEventReader,
  PrismaAssetRepository,
} from "./infrastructure/persistence/prisma-asset-repository.js";
import { Argon2PasswordHasher } from "./infrastructure/auth/argon2-password-hasher.js";
import { JwtTokenService } from "./infrastructure/auth/jwt-token-service.js";
import { DevLogClaimIssuer } from "./infrastructure/chain/dev-log-claim-issuer.js";
import { OnchainidClaimIssuer } from "./infrastructure/chain/onchainid-claim-issuer.js";
import { AuthController } from "./infrastructure/http/auth.controller.js";
import { AuthRateLimitGuard } from "./infrastructure/http/rate-limit.guard.js";
import {
  AUTH_RATE_LIMITER,
  AUTH_READ_RATE_LIMITER,
  LOGIN_THROTTLE_SERVICE,
} from "./infrastructure/http/http.tokens.js";
// Re-exported so tests (and other composition entry points) can reference the
// auth-throttle DI tokens from the module barrel.
export {
  AUTH_RATE_LIMITER,
  AUTH_READ_RATE_LIMITER,
  LOGIN_THROTTLE_SERVICE,
} from "./infrastructure/http/http.tokens.js";
import { InMemoryRateLimiter } from "./infrastructure/auth/rate-limiter.js";
import {
  DEFAULT_LOGIN_THROTTLE,
  LoginThrottleService,
} from "./application/identity/login-throttle-service.js";
import type {
  EmailGrantCommit,
  EmailSender,
  EmailVerificationTokenStore,
  LoginAttemptStore,
  PasswordResetTokenStore,
  TokenGenerator,
} from "./application/identity/ports.js";
import { DrainOutbox } from "./application/outbox/drain-outbox.js";
import type { OutboxStore } from "./application/outbox/ports.js";
import { PrismaOutboxStore } from "./infrastructure/persistence/prisma-outbox-store.js";
import { PrismaEmailGrantCommit } from "./infrastructure/persistence/prisma-email-grant-commit.js";
import { emailOutboxHandlers } from "./infrastructure/outbox/email-outbox-handler.js";
import { OutboxDrainWorker } from "./infrastructure/outbox/outbox-drain-worker.js";
import { RequestPasswordReset } from "./application/identity/request-password-reset.js";
import { ResetPassword } from "./application/identity/reset-password.js";
import { RequestEmailVerification } from "./application/identity/request-email-verification.js";
import { VerifyEmail } from "./application/identity/verify-email.js";
import { StartMfaEnrollment } from "./application/identity/start-mfa-enrollment.js";
import { ConfirmMfaEnrollment } from "./application/identity/confirm-mfa-enrollment.js";
import { DisableMfa } from "./application/identity/disable-mfa.js";
import { GetMfaStatus } from "./application/identity/get-mfa-status.js";
import { CompleteOfficerMfaChallenge } from "./application/identity/complete-officer-mfa-challenge.js";
import type {
  MfaChallengeIssuer,
  MfaStore,
  RecoveryCodeGenerator,
  TotpService,
} from "./application/identity/ports.js";
import { PrismaLoginAttemptStore } from "./infrastructure/persistence/prisma-login-attempt-store.js";
import { PrismaPasswordResetTokenStore } from "./infrastructure/persistence/prisma-password-reset-token-store.js";
import { PrismaEmailVerificationTokenStore } from "./infrastructure/persistence/prisma-email-verification-token-store.js";
import { PrismaMfaStore } from "./infrastructure/persistence/prisma-mfa-store.js";
import { CryptoTokenGenerator } from "./infrastructure/auth/crypto-token-generator.js";
import { DevEmailSender } from "./infrastructure/auth/dev-email-sender.js";
import { SmtpEmailSender, smtpConfigFromEnv } from "./infrastructure/auth/smtp-email-sender.js";
import { createTransport } from "nodemailer";
import { OtplibTotpService } from "./infrastructure/auth/otplib-totp-service.js";
import { CryptoRecoveryCodeGenerator } from "./infrastructure/auth/crypto-recovery-code-generator.js";
import { JwtMfaChallengeService } from "./infrastructure/auth/jwt-mfa-challenge-service.js";
import { AuthGuard, TOKEN_VERIFIER } from "./infrastructure/http/auth.guard.js";
import { CsrfGuard } from "./infrastructure/http/csrf.guard.js";
import { DomainErrorFilter } from "./infrastructure/http/domain-error.filter.js";
import { InvestorsController } from "./infrastructure/http/investors.controller.js";
import {
  PrismaInvestorChainDirectory,
  PrismaInvestorRepository,
} from "./infrastructure/persistence/prisma-investor-repository.js";
import { PrismaService } from "./infrastructure/persistence/prisma.service.js";
import { tenantScopedPrisma } from "./infrastructure/tenancy/tenant-scoped-prisma.js";
import { tenantMiddleware } from "./infrastructure/tenancy/tenant.middleware.js";

// Injection tokens for the application-layer ports.
export const INVESTOR_REPOSITORY = "INVESTOR_REPOSITORY";
export const CLAIM_ISSUER = "CLAIM_ISSUER";
export const ID_GENERATOR = "ID_GENERATOR";
export const PASSWORD_HASHER = "PASSWORD_HASHER";
export const TOKEN_ISSUER = "TOKEN_ISSUER";
export const STAFF_USER_REPOSITORY = "STAFF_USER_REPOSITORY";
export const ASSET_REPOSITORY = "ASSET_REPOSITORY";
export const DOCUMENT_STORE = "DOCUMENT_STORE";
export const ASSET_EVENT_LOG = "ASSET_EVENT_LOG";
export const TOKEN_DEPLOYER = "TOKEN_DEPLOYER";
export const OFFERING_REPOSITORY = "OFFERING_REPOSITORY";
export const SETTLEMENT_RAIL = "SETTLEMENT_RAIL";
export const APPROVAL_REPOSITORY = "APPROVAL_REPOSITORY";
export const APPROVAL_COMMIT = "APPROVAL_COMMIT";
export const ASSET_TOKEN_ISSUER = "ASSET_TOKEN_ISSUER";
export const NOTIFICATION_REPOSITORY = "NOTIFICATION_REPOSITORY";
export const NOTIFIER = "NOTIFIER";
export const APPROVAL_PARKED_NOTIFIER = "APPROVAL_PARKED_NOTIFIER";
export const PUBLIC_PAGE_REVALIDATOR = "PUBLIC_PAGE_REVALIDATOR";
export const KYC_DECISION_NOTIFIER = "KYC_DECISION_NOTIFIER";
export const DISTRIBUTION_PAID_NOTIFIER = "DISTRIBUTION_PAID_NOTIFIER";
export const JOB_SCHEDULER = "JOB_SCHEDULER";
export const CLOCK = "CLOCK";
export const ONBOARDING_REPOSITORY = "ONBOARDING_REPOSITORY";
export const EVIDENCE_STORE = "EVIDENCE_STORE";
export const STEP_ANSWER_STORE = "STEP_ANSWER_STORE";
export const SANCTIONS_SCREENING = "SANCTIONS_SCREENING";
export const SCREENING_REPOSITORY = "SCREENING_REPOSITORY";
export const RISK_ASSESSMENT_REPOSITORY = "RISK_ASSESSMENT_REPOSITORY";
export const FUNDING_REPOSITORY = "FUNDING_REPOSITORY";
export const PAYMENT_INSTRUCTIONS = "PAYMENT_INSTRUCTIONS";
export const PERSONAL_DATA_CIPHER = "PERSONAL_DATA_CIPHER";
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
export const SCOPED_PRISMA = "SCOPED_PRISMA";
export const LOGIN_ATTEMPT_STORE = "LOGIN_ATTEMPT_STORE";
export const PASSWORD_RESET_TOKEN_STORE = "PASSWORD_RESET_TOKEN_STORE";
export const EMAIL_VERIFICATION_TOKEN_STORE = "EMAIL_VERIFICATION_TOKEN_STORE";
export const TOKEN_GENERATOR = "TOKEN_GENERATOR";
export const EMAIL_SENDER = "EMAIL_SENDER";
export const OUTBOX_STORE = "OUTBOX_STORE";
export const PASSWORD_RESET_EMAIL_COMMIT = "PASSWORD_RESET_EMAIL_COMMIT";
export const EMAIL_VERIFICATION_EMAIL_COMMIT = "EMAIL_VERIFICATION_EMAIL_COMMIT";
export const TOTP_SERVICE = "TOTP_SERVICE";
export const MFA_STORE = "MFA_STORE";
export const RECOVERY_CODE_GENERATOR = "RECOVERY_CODE_GENERATOR";
export const MFA_CHALLENGE_ISSUER = "MFA_CHALLENGE_ISSUER";
export const TOKEN_EVENT_SOURCE = "TOKEN_EVENT_SOURCE";
export const WALLET_DIRECTORY = "WALLET_DIRECTORY";
export const ASSET_EVENT_READER = "ASSET_EVENT_READER";
export const LEDGER_READER = "LEDGER_READER";
export const INVESTOR_CHAIN_DIRECTORY = "INVESTOR_CHAIN_DIRECTORY";
export const CRM_PROFILE_REPOSITORY = "CRM_PROFILE_REPOSITORY";
export const CRM_NOTE_REPOSITORY = "CRM_NOTE_REPOSITORY";
export const FOLLOW_UP_REPOSITORY = "FOLLOW_UP_REPOSITORY";
export const ISSUER_REPOSITORY = "ISSUER_REPOSITORY";
export const PERSON_VERIFICATION = "PERSON_VERIFICATION";
export const PERSON_DIRECTORY = "PERSON_DIRECTORY";

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
    CrmController,
    ApprovalsController,
    NotificationsController,
    PublicController,
    OnboardingController,
    PortfolioController,
    FundingController,
    IssuersController,
  ],
  providers: [
    PrismaService,
    {
      // OD-1a: every repository/adapter that touches tenant-owned tables gets
      // the tenant-scoped client (fail-closed, invocation-time scoping). The
      // raw PrismaService remains available for platform-level concerns only.
      provide: SCOPED_PRISMA,
      useFactory: (prisma: PrismaService) => tenantScopedPrisma(prisma),
      inject: [PrismaService],
    },
    {
      provide: INVESTOR_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInvestorRepository(prisma),
      inject: [SCOPED_PRISMA],
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
      inject: [SCOPED_PRISMA],
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
    // 1.4c: staff accounts live in staff_users (platform-level, raw Prisma).
    // StaffBootstrap seeds the super-admin (the env officer maps to it) + a
    // treasury user on startup so maker-checker has two real logins.
    {
      provide: STAFF_USER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaStaffUserRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: StaffBootstrap,
      useFactory: (users: StaffUserRepository, hasher: PasswordHasher) =>
        new StaffBootstrap(users, hasher),
      inject: [STAFF_USER_REPOSITORY, PASSWORD_HASHER],
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
      provide: AuthenticateStaff,
      useFactory: (
        users: StaffUserRepository,
        hasher: PasswordHasher,
        tokens: TokenIssuer,
        mfa: MfaStore,
        challenge: MfaChallengeIssuer,
      ) => new AuthenticateStaff(users, hasher, tokens, mfa, challenge),
      inject: [
        STAFF_USER_REPOSITORY,
        PASSWORD_HASHER,
        TOKEN_ISSUER,
        MFA_STORE,
        MFA_CHALLENGE_ISSUER,
      ],
    },
    // T1/T4 officer MFA. Platform-level store (raw Prisma). The challenge issuer
    // reuses the auth secret with a distinct purpose claim (see the service).
    { provide: TOTP_SERVICE, useClass: OtplibTotpService },
    { provide: RECOVERY_CODE_GENERATOR, useClass: CryptoRecoveryCodeGenerator },
    {
      provide: MFA_STORE,
      useFactory: (prisma: PrismaService) => new PrismaMfaStore(prisma),
      inject: [PrismaService],
    },
    {
      provide: MFA_CHALLENGE_ISSUER,
      useFactory: () =>
        new JwtMfaChallengeService(
          process.env.AUTH_TOKEN_SECRET ?? "insecure-dev-secret-change-me",
        ),
    },
    {
      provide: StartMfaEnrollment,
      useFactory: (store: MfaStore, totp: TotpService) => new StartMfaEnrollment(store, totp),
      inject: [MFA_STORE, TOTP_SERVICE],
    },
    {
      provide: ConfirmMfaEnrollment,
      useFactory: (store: MfaStore, totp: TotpService, recovery: RecoveryCodeGenerator) =>
        new ConfirmMfaEnrollment(store, totp, recovery),
      inject: [MFA_STORE, TOTP_SERVICE, RECOVERY_CODE_GENERATOR],
    },
    {
      provide: DisableMfa,
      useFactory: (store: MfaStore) => new DisableMfa(store),
      inject: [MFA_STORE],
    },
    {
      provide: GetMfaStatus,
      useFactory: (store: MfaStore) => new GetMfaStatus(store),
      inject: [MFA_STORE],
    },
    {
      provide: CompleteOfficerMfaChallenge,
      useFactory: (
        challenge: MfaChallengeIssuer,
        store: MfaStore,
        totp: TotpService,
        tokens: TokenIssuer,
        users: StaffUserRepository,
      ) => new CompleteOfficerMfaChallenge(challenge, store, totp, tokens, users),
      inject: [MFA_CHALLENGE_ISSUER, MFA_STORE, TOTP_SERVICE, TOKEN_ISSUER, STAFF_USER_REPOSITORY],
    },
    {
      provide: StartKycReview,
      useFactory: (repo: InvestorRepository) => new StartKycReview(repo),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      // 4.2: the only screening adapter today is a labeled mock, because the
      // provider is an owner decision of the same kind as OD-7 (email). The
      // rehearsal list makes the possible-match path demonstrable without
      // inventing hits: SCREENING_REHEARSAL_MATCHES, comma-separated.
      provide: SANCTIONS_SCREENING,
      useFactory: (clock: Clock) =>
        new MockSanctionsScreening(
          clock,
          (process.env.SCREENING_REHEARSAL_MATCHES ?? "")
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name !== ""),
        ),
      inject: [CLOCK],
    },
    {
      provide: SCREENING_REPOSITORY,
      useFactory: (prisma: PrismaService, ids: IdGenerator) =>
        new PrismaScreeningRepository(prisma, ids),
      inject: [SCOPED_PRISMA, ID_GENERATOR],
    },
    {
      provide: ScreenInvestor,
      useFactory: (
        answers: StepAnswerStore,
        screening: SanctionsScreening,
        results: ScreeningRepository,
      ) => new ScreenInvestor(answers, screening, results),
      inject: [STEP_ANSWER_STORE, SANCTIONS_SCREENING, SCREENING_REPOSITORY],
    },
    {
      provide: ListScreenings,
      useFactory: (results: ScreeningRepository) => new ListScreenings(results),
      inject: [SCREENING_REPOSITORY],
    },
    {
      provide: RISK_ASSESSMENT_REPOSITORY,
      useFactory: (prisma: PrismaService, ids: IdGenerator) =>
        new PrismaRiskAssessmentRepository(prisma, ids),
      inject: [SCOPED_PRISMA, ID_GENERATOR],
    },
    {
      provide: AssessRisk,
      useFactory: (assessments: RiskAssessmentRepository) => new AssessRisk(assessments),
      inject: [RISK_ASSESSMENT_REPOSITORY],
    },
    {
      provide: ListRiskAssessments,
      useFactory: (assessments: RiskAssessmentRepository) => new ListRiskAssessments(assessments),
      inject: [RISK_ASSESSMENT_REPOSITORY],
    },
    {
      provide: ListDueReviews,
      useFactory: (
        investors: InvestorRepository,
        assessments: RiskAssessmentRepository,
        clock: Clock,
      ) => new ListDueReviews(investors, assessments, clock),
      inject: [INVESTOR_REPOSITORY, RISK_ASSESSMENT_REPOSITORY, CLOCK],
    },
    {
      provide: ReissueKycClaim,
      useFactory: (investors: InvestorRepository, claims: ClaimIssuer) =>
        new ReissueKycClaim(investors, claims),
      inject: [INVESTOR_REPOSITORY, CLAIM_ISSUER],
    },
    {
      provide: ApproveKyc,
      useFactory: (
        repo: InvestorRepository,
        claims: ClaimIssuer,
        notifier: KycDecisionNotifier,
        outbox: OutboxStore,
      ) => new ApproveKyc(repo, claims, notifier, outbox),
      inject: [INVESTOR_REPOSITORY, CLAIM_ISSUER, KYC_DECISION_NOTIFIER, OUTBOX_STORE],
    },
    {
      provide: RejectKyc,
      useFactory: (repo: InvestorRepository, notifier: KycDecisionNotifier) =>
        new RejectKyc(repo, notifier),
      inject: [INVESTOR_REPOSITORY, KYC_DECISION_NOTIFIER],
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
      inject: [SCOPED_PRISMA],
    },
    {
      provide: ASSET_EVENT_LOG,
      useFactory: (prisma: PrismaService) => new PrismaAssetEventLog(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: DOCUMENT_STORE,
      useFactory: (): DocumentStore =>
        new IpfsDocumentStore(process.env.IPFS_API_URL ?? "http://127.0.0.1:5001"),
    },
    {
      provide: ProposeAsset,
      // The issuer repository is here so an asset cannot be submitted in the
      // name of an organisation the platform has not approved.
      useFactory: (
        repo: AssetRepository,
        ids: IdGenerator,
        events: AssetEventLog,
        issuers: IssuerRepository,
      ) => new ProposeAsset(repo, ids, events, issuers),
      inject: [ASSET_REPOSITORY, ID_GENERATOR, ASSET_EVENT_LOG, ISSUER_REPOSITORY],
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
      useFactory: (repo: AssetRepository, issuers: IssuerRepository) => new GetAsset(repo, issuers),
      inject: [ASSET_REPOSITORY, ISSUER_REPOSITORY],
    },
    {
      provide: ListAssets,
      useFactory: (repo: AssetRepository, issuers: IssuerRepository) =>
        new ListAssets(repo, issuers),
      inject: [ASSET_REPOSITORY, ISSUER_REPOSITORY],
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
      inject: [SCOPED_PRISMA],
    },
    { provide: SETTLEMENT_RAIL, useExisting: PrismaSettlementRail },
    // T1/T3 maker-checker: threshold ledger credit + approval engine.
    {
      provide: APPROVAL_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaApprovalRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      // T8 atomicity: the approval decision + effect commit in one transaction.
      provide: APPROVAL_COMMIT,
      // 4.1: the executor is built PER TRANSACTION, here in the only
      // composition root, so an approved payout commits with the decision that
      // authorised it. Everything it touches is transaction-bound — the ledger,
      // the distribution, the audit event, and the holder's notification — so a
      // failure anywhere rolls the approval back with it.
      useFactory: (scoped: PrismaService, ids: IdGenerator, clock: Clock) =>
        new PrismaApprovalCommit(scoped, (tx) => {
          const notifier = new EmailingNotifier(
            new NotificationService(new PrismaNotificationRepository(tx), ids, clock),
            new PrismaOutboxStore(tx),
          );
          return new ApprovalActionDispatcher(
            new PrismaSettlementRail(tx),
            new PayDistribution(
              new PrismaDistributionRepository(tx),
              new PrismaSettlementRail(tx),
              new PrismaAssetEventLog(tx),
              new PrismaAssetRepository(tx),
              new NotifyDistributionPaid(notifier),
              clock,
            ),
          );
        }),
      inject: [SCOPED_PRISMA, ID_GENERATOR, CLOCK],
    },
    {
      provide: CreditInvestorLedger,
      useFactory: (
        rail: LedgerCredit,
        approvals: ApprovalRepository,
        ids: IdGenerator,
        clock: Clock,
        parkedNotifier: ApprovalParkedNotifier,
      ) => {
        const configured = process.env.LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL;
        const threshold =
          configured !== undefined && configured.trim() !== ""
            ? BigInt(configured)
            : DEFAULT_LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL;
        return new CreditInvestorLedger(rail, approvals, ids, clock, threshold, parkedNotifier);
      },
      inject: [
        PrismaSettlementRail,
        APPROVAL_REPOSITORY,
        ID_GENERATOR,
        CLOCK,
        APPROVAL_PARKED_NOTIFIER,
      ],
    },
    {
      provide: DecideApproval,
      useFactory: (approvals: ApprovalRepository, commit: ApprovalCommit, clock: Clock) =>
        new DecideApproval(approvals, commit, clock),
      inject: [APPROVAL_REPOSITORY, APPROVAL_COMMIT, CLOCK],
    },
    {
      provide: ListApprovals,
      useFactory: (
        approvals: ApprovalRepository,
        investors: InvestorRepository,
        staff: StaffUserRepository,
      ) => new ListApprovals(approvals, investors, staff),
      inject: [APPROVAL_REPOSITORY, INVESTOR_REPOSITORY, STAFF_USER_REPOSITORY],
    },
    // Notifications (1.7). Tenant-scoped repository; the read/mark use-cases back
    // the self-scoped API; NotificationService (the Notifier) is what event
    // emitters will depend on in 1.7c.
    {
      provide: NOTIFICATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaNotificationRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      // In-app persistence, decorated so IMPORTANT notifications are also
      // emailed durably through the outbox (1.7c-ii).
      provide: NOTIFIER,
      useFactory: (
        repo: NotificationRepository,
        ids: IdGenerator,
        clock: Clock,
        outbox: OutboxStore,
      ) => new EmailingNotifier(new NotificationService(repo, ids, clock), outbox),
      inject: [NOTIFICATION_REPOSITORY, ID_GENERATOR, CLOCK, OUTBOX_STORE],
    },
    {
      // 1.7c: alerts the eligible checkers when an approval is parked.
      provide: APPROVAL_PARKED_NOTIFIER,
      useFactory: (staff: StaffUserRepository, investors: InvestorRepository, notifier: Notifier) =>
        new NotifyApprovalPending(staff, investors, notifier),
      inject: [STAFF_USER_REPOSITORY, INVESTOR_REPOSITORY, NOTIFIER],
    },
    {
      // 1.7c-ii: tells the investor how their KYC review was decided.
      provide: KYC_DECISION_NOTIFIER,
      useFactory: (notifier: Notifier) => new NotifyKycDecision(notifier),
      inject: [NOTIFIER],
    },
    {
      // 1.7c-ii: tells each holder what a paid distribution credited them.
      provide: DISTRIBUTION_PAID_NOTIFIER,
      useFactory: (notifier: Notifier) => new NotifyDistributionPaid(notifier),
      inject: [NOTIFIER],
    },
    // 1.7d: recurring jobs on pg-boss (OD-3/OD-4) — Postgres-backed, so no new
    // datastore, and cluster-safe cron unlike an in-process timer.
    {
      provide: NotifyDueFollowUps,
      useFactory: (
        followUps: FollowUpRepository,
        staff: StaffUserRepository,
        notifier: Notifier,
        clock: Clock,
      ) => new NotifyDueFollowUps(followUps, staff, notifier, clock),
      inject: [FOLLOW_UP_REPOSITORY, STAFF_USER_REPOSITORY, NOTIFIER, CLOCK],
    },
    {
      provide: JOB_SCHEDULER,
      useFactory: () =>
        new PgBossJobScheduler(process.env.DATABASE_URL ?? "postgresql://localhost:5432/postgres"),
    },
    {
      provide: ScheduledJobsBootstrap,
      useFactory: (scheduler: JobScheduler, dueFollowUps: NotifyDueFollowUps) =>
        new ScheduledJobsBootstrap(scheduler, dueFollowUps),
      inject: [JOB_SCHEDULER, NotifyDueFollowUps],
    },
    {
      provide: ListNotifications,
      useFactory: (repo: NotificationRepository) => new ListNotifications(repo),
      inject: [NOTIFICATION_REPOSITORY],
    },
    {
      provide: GetUnreadCount,
      useFactory: (repo: NotificationRepository) => new GetUnreadCount(repo),
      inject: [NOTIFICATION_REPOSITORY],
    },
    {
      provide: MarkNotificationRead,
      useFactory: (repo: NotificationRepository, clock: Clock) =>
        new MarkNotificationRead(repo, clock),
      inject: [NOTIFICATION_REPOSITORY, CLOCK],
    },
    {
      provide: OFFERING_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOfferingRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    // T4 brute-force protection: per-account lockout (persistent) + per-IP edge
    // rate limit (in-memory). The store uses the RAW Prisma client — login
    // throttling is platform-level and evaluated before tenant resolution.
    {
      provide: LOGIN_ATTEMPT_STORE,
      useFactory: (prisma: PrismaService) => new PrismaLoginAttemptStore(prisma),
      inject: [PrismaService],
    },
    {
      provide: LOGIN_THROTTLE_SERVICE,
      useFactory: (store: LoginAttemptStore, clock: Clock) =>
        new LoginThrottleService(store, clock, DEFAULT_LOGIN_THROTTLE),
      inject: [LOGIN_ATTEMPT_STORE, CLOCK],
    },
    // T4 self-service password reset. The token store uses the RAW Prisma client
    // (platform-level, keyed by digest, evaluated before tenant resolution). The
    // email sender is the labeled dev sink until the SMTP adapter lands (OD-7).
    {
      provide: PASSWORD_RESET_TOKEN_STORE,
      useFactory: (prisma: PrismaService) => new PrismaPasswordResetTokenStore(prisma),
      inject: [PrismaService],
    },
    { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
    {
      // P0-3 / OD-7: real SMTP when a host is configured, the loudly-labelled
      // dev sender otherwise. Absent configuration must never mean "silently
      // send nowhere" — an operator who has not set SMTP_HOST keeps the sender
      // that prints [DEV EMAIL — NOT DELIVERED] next to every link.
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => {
        const smtp = smtpConfigFromEnv(process.env);
        if (smtp === undefined) {
          return new DevEmailSender();
        }
        const from = process.env.SMTP_FROM ?? "no-reply@platform.local";
        const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";
        return new SmtpEmailSender(createTransport(smtp), { from, webBaseUrl });
      },
    },
    // 1.6b durable-delivery spine. The outbox store uses the RAW client
    // (platform-level, UNSCOPED_MODELS); the drainer dispatches queued emails via
    // the EMAIL_SENDER handlers, plus the chain retries added in P0-2; the
    // worker ticks it on an interval (ON by default since K-39).
    {
      provide: OUTBOX_STORE,
      useFactory: (prisma: PrismaService) => new PrismaOutboxStore(prisma),
      inject: [PrismaService],
    },
    {
      provide: DrainOutbox,
      useFactory: (
        store: OutboxStore,
        email: EmailSender,
        clock: Clock,
        settle: SettleAllocation,
        claims: ClaimIssuer,
      ) =>
        new DrainOutbox(
          store,
          // P0-2 step 2: without this handler registered, a queued mint retry
          // finds no handler, fails every attempt and dead-letters — the
          // tokens would never be issued and the queue would say so only in a
          // column nobody reads.
          [
            ...emailOutboxHandlers(email),
            new SettleAllocationHandler(settle),
            new KycClaimHandler(claims),
          ],
          clock,
        ),
      inject: [OUTBOX_STORE, EMAIL_SENDER, CLOCK, SettleAllocation, CLAIM_ISSUER],
    },
    {
      provide: OutboxDrainWorker,
      useFactory: (drainer: DrainOutbox) => new OutboxDrainWorker(drainer),
      inject: [DrainOutbox],
    },
    // Atomic producers: each persists its token grant AND enqueues the email in
    // one transaction, bound to the correct grant table.
    {
      provide: PASSWORD_RESET_EMAIL_COMMIT,
      useFactory: (prisma: PrismaService) =>
        new PrismaEmailGrantCommit(prisma, (tx) => new PrismaPasswordResetTokenStore(tx)),
      inject: [PrismaService],
    },
    {
      provide: EMAIL_VERIFICATION_EMAIL_COMMIT,
      useFactory: (prisma: PrismaService) =>
        new PrismaEmailGrantCommit(prisma, (tx) => new PrismaEmailVerificationTokenStore(tx)),
      inject: [PrismaService],
    },
    {
      provide: RequestPasswordReset,
      useFactory: (
        repo: InvestorRepository,
        commit: EmailGrantCommit,
        generator: TokenGenerator,
        clock: Clock,
      ) => new RequestPasswordReset(repo, commit, generator, clock),
      inject: [INVESTOR_REPOSITORY, PASSWORD_RESET_EMAIL_COMMIT, TOKEN_GENERATOR, CLOCK],
    },
    {
      provide: ResetPassword,
      useFactory: (
        repo: InvestorRepository,
        tokens: PasswordResetTokenStore,
        hasher: PasswordHasher,
        clock: Clock,
      ) => new ResetPassword(repo, tokens, hasher, clock),
      inject: [INVESTOR_REPOSITORY, PASSWORD_RESET_TOKEN_STORE, PASSWORD_HASHER, CLOCK],
    },
    // T4 email verification. Same token-store shape as reset, distinct table so
    // a reset link can't be redeemed as a verification link or vice-versa.
    {
      provide: EMAIL_VERIFICATION_TOKEN_STORE,
      useFactory: (prisma: PrismaService) => new PrismaEmailVerificationTokenStore(prisma),
      inject: [PrismaService],
    },
    {
      provide: RequestEmailVerification,
      useFactory: (
        repo: InvestorRepository,
        commit: EmailGrantCommit,
        generator: TokenGenerator,
        clock: Clock,
      ) => new RequestEmailVerification(repo, commit, generator, clock),
      inject: [INVESTOR_REPOSITORY, EMAIL_VERIFICATION_EMAIL_COMMIT, TOKEN_GENERATOR, CLOCK],
    },
    {
      provide: VerifyEmail,
      useFactory: (repo: InvestorRepository, tokens: EmailVerificationTokenStore, clock: Clock) =>
        new VerifyEmail(repo, tokens, clock),
      inject: [INVESTOR_REPOSITORY, EMAIL_VERIFICATION_TOKEN_STORE, CLOCK],
    },
    {
      // useFactory (not useValue) so each application instance gets its own
      // limiter — a single useValue instance would be created once at import
      // time and leak counts across test modules in the same worker.
      provide: AUTH_RATE_LIMITER,
      useFactory: () => new InMemoryRateLimiter({ max: 20, windowSeconds: 60 }),
    },
    {
      // Reads get their own, far larger ceiling: 20/minute is a sane bound on
      // password attempts and an absurd one on page loads, since every screen
      // in every portal asks `GET /auth/session` when it mounts. Still bounded
      // — 5 a second is generous for a browser and useless for a flood.
      provide: AUTH_READ_RATE_LIMITER,
      useFactory: () => new InMemoryRateLimiter({ max: 300, windowSeconds: 60 }),
    },
    AuthRateLimitGuard,
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
      inject: [SCOPED_PRISMA],
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
        settleAllocation: SettleWithRetry,
      ) => new CloseOffering(offerings, rail, issuer, events, clock, settleAllocation),
      inject: [
        OFFERING_REPOSITORY,
        SETTLEMENT_RAIL,
        ASSET_TOKEN_ISSUER,
        ASSET_EVENT_LOG,
        CLOCK,
        SettleWithRetry,
      ],
    },
    {
      provide: SettleWithRetry,
      useFactory: (settle: SettleAllocation, outbox: OutboxStore) =>
        new SettleWithRetry(settle, outbox),
      inject: [SettleAllocation, OUTBOX_STORE],
    },
    {
      // P0-2 step 3 residue: the ONE manual lever for stranded escrow. Shares
      // the AllocationMintLog with MintAllocation so "have these tokens been
      // issued" has a single answer, and the same SettlementRail, so the
      // release lands on the same ledger the capture would have.
      provide: ReleaseStrandedEscrow,
      useFactory: (
        prisma: PrismaService,
        ids: IdGenerator,
        rail: SettlementRail,
        events: AssetEventLog,
      ) =>
        new ReleaseStrandedEscrow(
          {
            find: async (key) => {
              const row = await prisma.offeringAllocation.findFirst({
                where: { offeringId: key.offeringId, investorId: key.investorId },
                select: { allocated: true, costRial: true },
              });
              return row === null
                ? undefined
                : { allocated: row.allocated, costRial: row.costRial };
            },
          },
          new PrismaAllocationMintLog(prisma, ids),
          rail,
          {
            // Maps onto the platform's audit trail, which is keyed by ASSET.
            // Resolved here rather than in the use case, which has no reason
            // to know an offering belongs to one.
            record: async (entry) => {
              const offering = await prisma.offering.findFirst({
                where: { id: entry.offeringId },
                select: { assetId: true },
              });
              await events.append({
                assetId: offering?.assetId ?? entry.offeringId,
                event: "offering_escrow_released",
                actor: entry.actor,
                details: {
                  offeringId: entry.offeringId,
                  investorId: entry.investorId,
                  amountRial: entry.amountRial,
                  reason: entry.reason,
                },
              });
            },
          },
          {
            // Reads the ledger DIRECTLY rather than through the rail, because
            // the question is about state ("is this money still there, and has
            // this allocation already been returned") rather than movement.
            heldFor: async (investorId) => {
              const account = await prisma.ledgerAccount.findFirst({
                where: { investorId },
                select: { held: true },
              });
              return account?.held ?? 0n;
            },
            alreadyReleased: async (investorId, reference) => {
              const entry = await prisma.ledgerEntry.findFirst({
                where: { investorId, kind: "release", reference },
                select: { id: true },
              });
              return entry !== null;
            },
          },
        ),
      inject: [PrismaService, ID_GENERATOR, SETTLEMENT_RAIL, ASSET_EVENT_LOG],
    },
    {
      // P1-2 / FR-PT-2: an issuer's holder registry for their own asset. Reuses
      // GetHolderRegistry so "who holds this" has ONE definition; the narrowing
      // to what an issuer may see happens in the use case, as an allow-list.
      provide: GetIssuerAssetHolders,
      useFactory: (registry: GetHolderRegistry, prisma: PrismaService, access: IssuerTeamAccess) =>
        new GetIssuerAssetHolders(
          registry,
          new PrismaIssuerAllocationReader(prisma),
          new PrismaAssetOwnerReader(prisma),
          access,
          // Keyed off the platform's existing required secret, DOMAIN-SEPARATED
          // inside the HMAC so this digest can never collide with a session
          // token's. A dedicated variable would be one more secret for an
          // operator to manage and lose; secrets management as a whole is P0-4
          // and the owner's call.
          //
          // CONSEQUENCE, stated because it is not obvious: rotating
          // AUTH_TOKEN_SECRET changes every holder reference, so an issuer's
          // record of "the same holder over time" restarts. Rotation already
          // invalidates every session, so it is not a quiet event.
          //
          // Same resolution and same dev fallback as JwtTokenService above,
          // deliberately — a second, stricter rule for the same variable would
          // mean the app booted for one purpose and refused for another. With
          // no secret set the key is the public dev string and the reference is
          // guessable again; that is what the startup warning is for.
          process.env.AUTH_TOKEN_SECRET ?? "insecure-dev-secret-change-me",
        ),
      inject: [GetHolderRegistry, PrismaService, IssuerTeamAccess],
    },
    {
      // K-34's residue: the list behind the health probe's count — which
      // allocations hold money for tokens that were never issued.
      provide: ListAllocationsAwaitingMint,
      useFactory: (prisma: PrismaService) =>
        new ListAllocationsAwaitingMint(new PrismaAwaitingMintReader(prisma)),
      inject: [PrismaService],
    },
    {
      // P0-2 step 3 (K-34): mint-then-capture as one unit. ONE provider shared
      // by the inline path and the outbox handler, so a queued retry settles
      // through exactly the same idempotent code the close ran.
      provide: SettleAllocation,
      useFactory: (
        mint: MintAllocation,
        rail: SettlementRail,
        prisma: PrismaService,
        ids: IdGenerator,
      ) =>
        new SettleAllocation(
          mint,
          rail,
          {
            // Read straight from the ledger rather than through the rail: the
            // question is about STATE (is the escrow there) not movement.
            heldFor: async (investorId) => {
              const account = await prisma.ledgerAccount.findFirst({
                where: { investorId },
                select: { held: true },
              });
              return account?.held ?? 0n;
            },
          },
          new PrismaAllocationMintLog(prisma, ids),
        ),
      inject: [MintAllocation, SETTLEMENT_RAIL, PrismaService, ID_GENERATOR],
    },
    {
      // P0-2 step 1: issuing one allocation's tokens, at most once. Its own
      // provider because step 2 gives the outbox handler the same instance.
      provide: MintAllocation,
      useFactory: (issuer: AssetTokenIssuer, prisma: PrismaService, ids: IdGenerator) =>
        new MintAllocation(issuer, new PrismaAllocationMintLog(prisma, ids)),
      inject: [ASSET_TOKEN_ISSUER, SCOPED_PRISMA, ID_GENERATOR],
    },
    {
      provide: GetOffering,
      useFactory: (
        offerings: OfferingRepository,
        assets: AssetRepository,
        investors: InvestorRepository,
      ) => new GetOffering(offerings, assets, investors),
      inject: [OFFERING_REPOSITORY, ASSET_REPOSITORY, INVESTOR_REPOSITORY],
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
      inject: [SCOPED_PRISMA],
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
      inject: [SCOPED_PRISMA],
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
      // 4.1: the payout an officer REQUESTS. The effect itself (PayDistribution)
      // is built per-transaction by the approval commit, so it runs only after a
      // second person decides.
      provide: RequestDistributionPayout,
      useFactory: (
        distributions: DistributionRepository,
        approvals: ApprovalRepository,
        ids: IdGenerator,
        clock: Clock,
        parked: ApprovalParkedNotifier,
      ) => new RequestDistributionPayout(distributions, approvals, ids, clock, parked),
      inject: [
        DISTRIBUTION_REPOSITORY,
        APPROVAL_REPOSITORY,
        ID_GENERATOR,
        CLOCK,
        APPROVAL_PARKED_NOTIFIER,
      ],
    },
    {
      provide: GetDistribution,
      useFactory: (
        distributions: DistributionRepository,
        assets: AssetRepository,
        investors: InvestorRepository,
      ) => new GetDistribution(distributions, assets, investors),
      inject: [DISTRIBUTION_REPOSITORY, ASSET_REPOSITORY, INVESTOR_REPOSITORY],
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
      inject: [SCOPED_PRISMA],
    },
    {
      provide: ATTESTATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAttestationRepository(prisma),
      inject: [SCOPED_PRISMA],
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
      inject: [SCOPED_PRISMA],
    },
    {
      provide: REDEMPTION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaRedemptionRepository(prisma),
      inject: [SCOPED_PRISMA],
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
      inject: [SCOPED_PRISMA],
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
      provide: GetMyHoldings,
      useFactory: (assets: AssetRepository, chain: AssetTokenTransferrer) =>
        new GetMyHoldings(assets, chain),
      inject: [ASSET_REPOSITORY, ASSET_TOKEN_TRANSFERRER],
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
    {
      // Real chain event log when the devnet env is configured; otherwise fail
      // loudly — a registry not rebuilt from the chain would be fiction (NFR-2).
      provide: TOKEN_EVENT_SOURCE,
      useFactory: (): TokenEventSource => {
        const rpcUrl = process.env.DEVNET_RPC_URL;
        if (rpcUrl) {
          return new EthersTokenEventSource(rpcUrl);
        }
        const fail = () =>
          Promise.reject(new Error("the holder registry requires the devnet chain configuration"));
        return { registryEvents: fail, totalSupply: fail };
      },
    },
    {
      provide: WALLET_DIRECTORY,
      useFactory: (prisma: PrismaService) => new PrismaWalletDirectory(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: ASSET_EVENT_READER,
      useFactory: (prisma: PrismaService) => new PrismaAssetEventReader(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: GetHolderRegistry,
      useFactory: (assets: AssetRepository, chain: TokenEventSource, wallets: WalletDirectory) =>
        new GetHolderRegistry(assets, chain, wallets),
      inject: [ASSET_REPOSITORY, TOKEN_EVENT_SOURCE, WALLET_DIRECTORY],
    },
    {
      provide: ExportHolderRegistryCsv,
      useFactory: (registry: GetHolderRegistry) => new ExportHolderRegistryCsv(registry),
      inject: [GetHolderRegistry],
    },
    {
      provide: ExportTransferHistoryCsv,
      useFactory: (registry: GetHolderRegistry) => new ExportTransferHistoryCsv(registry),
      inject: [GetHolderRegistry],
    },
    {
      provide: ReconcileDistributions,
      useFactory: (distributions: DistributionRepository, prisma: PrismaService) =>
        new ReconcileDistributions(distributions, new PrismaLedgerCreditReader(prisma)),
      inject: [DISTRIBUTION_REPOSITORY, SCOPED_PRISMA],
    },
    {
      provide: GetAuditTrail,
      useFactory: (
        events: AssetEventReader,
        assets: AssetRepository,
        investors: InvestorRepository,
      ) => new GetAuditTrail(events, assets, investors),
      inject: [ASSET_EVENT_READER, ASSET_REPOSITORY, INVESTOR_REPOSITORY],
    },
    {
      // 2.1a: the anonymous-visitor catalog. Only published+open offerings, and
      // only factual terms (no projected yield — OD-21).
      provide: GetPublicCatalog,
      useFactory: (offerings: OfferingRepository, assets: AssetRepository) =>
        new GetPublicCatalog(offerings, assets),
      inject: [OFFERING_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      // Best-effort purge of the public marketplace cache so a WITHDRAWN
      // offering stops being advertised at once, not at the end of the ISR
      // window. ISR remains the fallback if the purge fails.
      provide: PUBLIC_PAGE_REVALIDATOR,
      useFactory: () => {
        const secret = process.env.REVALIDATE_SECRET;
        // Said ONCE at boot, where an operator looks, rather than per call at
        // debug level where nobody does. Not a hard failure: an API-only
        // deployment has no public site to purge, and refusing to start would
        // be an operational decision rather than an engineering one (K-4).
        if (!secret && process.env.NODE_ENV !== "test") {
          new Logger("AppModule").warn(
            "REVALIDATE_SECRET is not set — the public marketplace will not be purged, so a withdrawn " +
              "offering stays advertised until its ISR window expires. Set the SAME value here and on the web app",
          );
        }
        return new WebPublicPageRevalidator(
          process.env.WEB_ORIGIN ?? "http://localhost:3000",
          secret,
        );
      },
    },
    {
      provide: PublishOffering,
      useFactory: (
        offerings: OfferingRepository,
        clock: Clock,
        revalidator: PublicPageRevalidator,
      ) => new PublishOffering(offerings, clock, revalidator),
      inject: [OFFERING_REPOSITORY, CLOCK, PUBLIC_PAGE_REVALIDATOR],
    },
    {
      // 1.8 ops triage: composes the existing per-domain read models so
      // "pending" keeps one definition per domain.
      provide: GetWorkQueue,
      useFactory: (
        pendingKyc: ListPendingKyc,
        approvals: ListApprovals,
        redemptions: ListRedemptions,
      ) => new GetWorkQueue(pendingKyc, approvals, redemptions),
      inject: [ListPendingKyc, ListApprovals, ListRedemptions],
    },
    {
      provide: ONBOARDING_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOnboardingRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      // 2.3b: personal data is encrypted at rest with a key from configuration.
      // Missing key => a loud warning and an insecure dev key, the same posture
      // as AUTH_TOKEN_SECRET: the API stays bootable for development, and
      // nobody can mistake that state for a protected one. Key rotation,
      // escrow and HSM/KMS custody remain outstanding (OD-16).
      //
      // One cipher for both stores, so documents and answers can never drift
      // onto different keys.
      provide: PERSONAL_DATA_CIPHER,
      useFactory: (): AesGcmCipher => {
        const secret = process.env.KYC_EVIDENCE_KEY;
        if (!secret) {
          new Logger("AppModule").warn(
            "KYC_EVIDENCE_KEY is not set — using an insecure dev key; stored identity documents are NOT protected",
          );
        }
        return new AesGcmCipher(
          secret
            ? AesGcmCipher.keyFromSecret(secret)
            : Buffer.alloc(32, "insecure-dev-evidence-key"),
        );
      },
    },
    {
      provide: EVIDENCE_STORE,
      useFactory: (prisma: PrismaService, cipher: AesGcmCipher, clock: Clock): EvidenceStore =>
        new PrismaEvidenceStore(prisma, cipher, clock),
      inject: [SCOPED_PRISMA, PERSONAL_DATA_CIPHER, CLOCK],
    },
    {
      // Same key and posture as the documents: answers are personal data.
      provide: STEP_ANSWER_STORE,
      useFactory: (prisma: PrismaService, cipher: AesGcmCipher, clock: Clock): StepAnswerStore =>
        new PrismaStepAnswerStore(prisma, cipher, clock),
      inject: [SCOPED_PRISMA, PERSONAL_DATA_CIPHER, CLOCK],
    },
    {
      provide: StartOnboarding,
      useFactory: (
        investors: InvestorRepository,
        applications: OnboardingRepository,
        ids: IdGenerator,
        clock: Clock,
        evidence: EvidenceStore,
      ) => new StartOnboarding(investors, applications, ids, clock, evidence),
      inject: [INVESTOR_REPOSITORY, ONBOARDING_REPOSITORY, ID_GENERATOR, CLOCK, EVIDENCE_STORE],
    },
    {
      provide: FUNDING_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaFundingRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      // OD-6: where an investor is told to send their money. These are the
      // PLATFORM'S OWN BANK DETAILS and are deployment configuration — this
      // codebase knows no real account. Unset shows placeholders that say so
      // plainly rather than inventing an account number.
      provide: PAYMENT_INSTRUCTIONS,
      useFactory: (): PaymentInstructions => {
        const configured =
          process.env.FUNDING_BANK_NAME &&
          process.env.FUNDING_ACCOUNT_HOLDER &&
          process.env.FUNDING_ACCOUNT_NUMBER;
        if (!configured) {
          new Logger("AppModule").warn(
            "FUNDING_* bank details are not set — funding instructions show placeholders and no transfer can actually be made",
          );
        }
        return {
          bankName: process.env.FUNDING_BANK_NAME ?? "NOT CONFIGURED",
          accountHolder: process.env.FUNDING_ACCOUNT_HOLDER ?? "NOT CONFIGURED",
          accountNumber: process.env.FUNDING_ACCOUNT_NUMBER ?? "NOT CONFIGURED",
          notice:
            process.env.FUNDING_NOTICE ??
            "Quote the reference exactly as shown; a transfer without it cannot be matched to your account.",
        };
      },
    },
    {
      provide: RequestFunding,
      useFactory: (
        investors: InvestorRepository,
        funding: FundingRepository,
        ids: IdGenerator,
        clock: Clock,
        instructions: PaymentInstructions,
      ) => new RequestFunding(investors, funding, ids, clock, instructions),
      inject: [INVESTOR_REPOSITORY, FUNDING_REPOSITORY, ID_GENERATOR, CLOCK, PAYMENT_INSTRUCTIONS],
    },
    {
      // Confirming a deposit credits the ledger through the SAME maker-checker
      // use case as a direct credit, so the approval threshold applies here too.
      provide: ConfirmFunding,
      useFactory: (funding: FundingRepository, credit: CreditInvestorLedger, clock: Clock) =>
        new ConfirmFunding(funding, credit, clock),
      inject: [FUNDING_REPOSITORY, CreditInvestorLedger, CLOCK],
    },
    {
      provide: RejectFunding,
      useFactory: (funding: FundingRepository, clock: Clock) => new RejectFunding(funding, clock),
      inject: [FUNDING_REPOSITORY, CLOCK],
    },
    {
      provide: CancelFunding,
      useFactory: (funding: FundingRepository, clock: Clock) => new CancelFunding(funding, clock),
      inject: [FUNDING_REPOSITORY, CLOCK],
    },
    {
      provide: ListMyFunding,
      useFactory: (funding: FundingRepository) => new ListMyFunding(funding),
      inject: [FUNDING_REPOSITORY],
    },
    {
      provide: ListPendingFunding,
      useFactory: (funding: FundingRepository, investors: InvestorRepository) =>
        new ListPendingFunding(funding, investors),
      inject: [FUNDING_REPOSITORY, INVESTOR_REPOSITORY],
    },
    {
      // 3.1: the property a token is issued against, and what it conveys.
      provide: RecordRealEstateProfile,
      useFactory: (assets: AssetRepository, events: AssetEventLog) =>
        new RecordRealEstateProfile(assets, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: SetConveyedRight,
      useFactory: (assets: AssetRepository, events: AssetEventLog) =>
        new SetConveyedRight(assets, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      // 2.5d: the operator's disclosure switch, and the holder's view of it.
      provide: SetDocumentVisibility,
      useFactory: (assets: AssetRepository, events: AssetEventLog) =>
        new SetDocumentVisibility(assets, events),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG],
    },
    {
      provide: ListDocumentsAwaitingReview,
      useFactory: (assets: AssetRepository) => new ListDocumentsAwaitingReview(assets),
      inject: [ASSET_REPOSITORY],
    },
    {
      provide: ReviewDossierDocument,
      useFactory: (assets: AssetRepository, events: AssetEventLog, clock: Clock) =>
        new ReviewDossierDocument(assets, events, clock),
      inject: [ASSET_REPOSITORY, ASSET_EVENT_LOG, CLOCK],
    },
    {
      provide: GetMyAssetDocuments,
      useFactory: (assets: AssetRepository, sales: GetInvestorSales) =>
        new GetMyAssetDocuments(assets, {
          // "Has a position" means holding tokens today OR having subscribed —
          // a holder who was allocated in a closed offering has earned the
          // documents just as much as one who still holds. Reuses the sales
          // read model rather than inventing a second definition.
          execute: async (input: { investorId: string }) => {
            const view = await sales.execute({ investorId: input.investorId });
            return {
              assetIds: [
                ...new Set([
                  ...view.holdings.map((holding) => holding.assetId),
                  ...view.subscriptions.map((subscription) => subscription.assetId),
                ]),
              ],
            };
          },
        }),
      inject: [ASSET_REPOSITORY, GetInvestorSales],
    },
    {
      // 2.5: composes the existing sales read model with paid distributions —
      // one definition of "what this is worth", shared with the officer view.
      provide: GetMyPortfolio,
      useFactory: (
        sales: GetInvestorSales,
        distributions: DistributionRepository,
        assets: AssetRepository,
      ) => new GetMyPortfolio(sales, distributions, assets),
      inject: [GetInvestorSales, DISTRIBUTION_REPOSITORY, ASSET_REPOSITORY],
    },
    {
      provide: GetOnboardingProgress,
      useFactory: (applications: OnboardingRepository, evidence: EvidenceStore) =>
        new GetOnboardingProgress(applications, evidence),
      inject: [ONBOARDING_REPOSITORY, EVIDENCE_STORE],
    },
    {
      provide: CompleteOnboardingStep,
      useFactory: (applications: OnboardingRepository, evidence: EvidenceStore) =>
        new CompleteOnboardingStep(applications, evidence),
      inject: [ONBOARDING_REPOSITORY, EVIDENCE_STORE],
    },
    {
      provide: UploadEvidence,
      useFactory: (applications: OnboardingRepository, evidence: EvidenceStore) =>
        new UploadEvidence(applications, evidence),
      inject: [ONBOARDING_REPOSITORY, EVIDENCE_STORE],
    },
    {
      provide: RemoveEvidence,
      useFactory: (applications: OnboardingRepository, evidence: EvidenceStore) =>
        new RemoveEvidence(applications, evidence),
      inject: [ONBOARDING_REPOSITORY, EVIDENCE_STORE],
    },
    {
      provide: SubmitOnboarding,
      useFactory: (
        investors: InvestorRepository,
        applications: OnboardingRepository,
        clock: Clock,
        evidence: EvidenceStore,
      ) => new SubmitOnboarding(investors, applications, clock, evidence),
      inject: [INVESTOR_REPOSITORY, ONBOARDING_REPOSITORY, CLOCK, EVIDENCE_STORE],
    },
    {
      provide: SaveStepAnswers,
      useFactory: (
        applications: OnboardingRepository,
        evidence: EvidenceStore,
        answers: StepAnswerStore,
      ) => new SaveStepAnswers(applications, evidence, answers),
      inject: [ONBOARDING_REPOSITORY, EVIDENCE_STORE, STEP_ANSWER_STORE],
    },
    {
      provide: GetStepAnswers,
      useFactory: (answers: StepAnswerStore) => new GetStepAnswers(answers),
      inject: [STEP_ANSWER_STORE],
    },
    {
      provide: DownloadEvidence,
      useFactory: (evidence: EvidenceStore) => new DownloadEvidence(evidence),
      inject: [EVIDENCE_STORE],
    },
    {
      provide: RequestOnboardingChanges,
      useFactory: (
        investors: InvestorRepository,
        applications: OnboardingRepository,
        evidence: EvidenceStore,
        notifier: Notifier,
      ) => new RequestOnboardingChanges(investors, applications, evidence, notifier),
      inject: [INVESTOR_REPOSITORY, ONBOARDING_REPOSITORY, EVIDENCE_STORE, NOTIFIER],
    },
    { provide: LEDGER_READER, useExisting: PrismaSettlementRail },
    {
      provide: CRM_PROFILE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCrmProfileRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: CRM_NOTE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCrmNoteRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: FOLLOW_UP_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaFollowUpRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: GetInvestorSales,
      useFactory: (
        offerings: OfferingRepository,
        assets: AssetRepository,
        attestations: AttestationRepository,
        supply: TokenEventSource,
        holdings: GetMyHoldings,
        clock: Clock,
      ) => new GetInvestorSales(offerings, assets, attestations, supply, holdings, clock),
      inject: [
        OFFERING_REPOSITORY,
        ASSET_REPOSITORY,
        ATTESTATION_REPOSITORY,
        TOKEN_EVENT_SOURCE,
        GetMyHoldings,
        CLOCK,
      ],
    },
    {
      provide: GetInvestorTimeline,
      useFactory: (notes: CrmNoteRepository, events: AssetEventReader, assets: AssetRepository) =>
        new GetInvestorTimeline(notes, events, assets),
      inject: [CRM_NOTE_REPOSITORY, ASSET_EVENT_READER, ASSET_REPOSITORY],
    },
    {
      provide: SetRelationshipStage,
      useFactory: (profiles: CrmProfileRepository, investors: InvestorRepository) =>
        new SetRelationshipStage(profiles, investors),
      inject: [CRM_PROFILE_REPOSITORY, INVESTOR_REPOSITORY],
    },
    {
      provide: AddInvestorTag,
      useFactory: (profiles: CrmProfileRepository, investors: InvestorRepository) =>
        new AddInvestorTag(profiles, investors),
      inject: [CRM_PROFILE_REPOSITORY, INVESTOR_REPOSITORY],
    },
    {
      provide: RemoveInvestorTag,
      useFactory: (profiles: CrmProfileRepository, investors: InvestorRepository) =>
        new RemoveInvestorTag(profiles, investors),
      inject: [CRM_PROFILE_REPOSITORY, INVESTOR_REPOSITORY],
    },
    {
      provide: AddCrmNote,
      useFactory: (
        notes: CrmNoteRepository,
        investors: InvestorRepository,
        ids: IdGenerator,
        clock: Clock,
      ) => new AddCrmNote(notes, investors, ids, clock),
      inject: [CRM_NOTE_REPOSITORY, INVESTOR_REPOSITORY, ID_GENERATOR, CLOCK],
    },
    {
      provide: CreateFollowUp,
      useFactory: (
        followUps: FollowUpRepository,
        investors: InvestorRepository,
        ids: IdGenerator,
        clock: Clock,
      ) => new CreateFollowUp(followUps, investors, ids, clock),
      inject: [FOLLOW_UP_REPOSITORY, INVESTOR_REPOSITORY, ID_GENERATOR, CLOCK],
    },
    {
      provide: CompleteFollowUp,
      useFactory: (followUps: FollowUpRepository, clock: Clock) =>
        new CompleteFollowUp(followUps, clock),
      inject: [FOLLOW_UP_REPOSITORY, CLOCK],
    },
    {
      provide: ListOpenFollowUps,
      useFactory: (followUps: FollowUpRepository, investors: InvestorRepository, clock: Clock) =>
        new ListOpenFollowUps(followUps, investors, clock),
      inject: [FOLLOW_UP_REPOSITORY, INVESTOR_REPOSITORY, CLOCK],
    },
    {
      provide: INVESTOR_CHAIN_DIRECTORY,
      useFactory: (prisma: PrismaService) => new PrismaInvestorChainDirectory(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      provide: ListInvestors,
      useFactory: (
        investors: InvestorRepository,
        ledger: LedgerReader,
        profiles: CrmProfileRepository,
        sales: GetInvestorSales,
      ) => new ListInvestors(investors, ledger, profiles, sales),
      inject: [INVESTOR_REPOSITORY, LEDGER_READER, CRM_PROFILE_REPOSITORY, GetInvestorSales],
    },
    {
      provide: GetInvestorDetail,
      useFactory: (
        investors: InvestorRepository,
        assets: AssetRepository,
        ledger: LedgerReader,
        chainDirectory: InvestorChainDirectory,
        holdings: GetMyHoldings,
        transfers: TransferRepository,
        redemptions: RedemptionRepository,
        profiles: CrmProfileRepository,
        followUps: FollowUpRepository,
        sales: GetInvestorSales,
        timeline: GetInvestorTimeline,
        clock: Clock,
      ) =>
        new GetInvestorDetail(
          investors,
          assets,
          ledger,
          chainDirectory,
          holdings,
          transfers,
          redemptions,
          profiles,
          followUps,
          sales,
          timeline,
          clock,
        ),
      inject: [
        INVESTOR_REPOSITORY,
        ASSET_REPOSITORY,
        LEDGER_READER,
        INVESTOR_CHAIN_DIRECTORY,
        GetMyHoldings,
        TRANSFER_REPOSITORY,
        REDEMPTION_REPOSITORY,
        CRM_PROFILE_REPOSITORY,
        FOLLOW_UP_REPOSITORY,
        GetInvestorSales,
        GetInvestorTimeline,
        CLOCK,
      ],
    },
    {
      // 3.2: issuer organisations and their people.
      provide: ISSUER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaIssuerRepository(prisma),
      inject: [SCOPED_PRISMA],
    },
    {
      // THE GATE (user decision 2026-08-15). This binding is what makes "every
      // person acting for an issuer is individually verified" true at runtime:
      // point it at anything permissive and the rule silently evaporates, which
      // is why the e2e suite asserts the refusal through the HTTP API and not
      // only against this use case.
      provide: PERSON_VERIFICATION,
      useFactory: (investors: InvestorRepository): PersonVerification =>
        new InvestorPersonVerification(investors),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: PERSON_DIRECTORY,
      useFactory: (investors: InvestorRepository): PersonDirectory =>
        new InvestorPersonDirectory(investors),
      inject: [INVESTOR_REPOSITORY],
    },
    {
      provide: ApplyAsIssuer,
      useFactory: (
        issuers: IssuerRepository,
        verification: PersonVerification,
        ids: IdGenerator,
        clock: Clock,
      ) => new ApplyAsIssuer(issuers, verification, ids, clock),
      inject: [ISSUER_REPOSITORY, PERSON_VERIFICATION, ID_GENERATOR, CLOCK],
    },
    {
      provide: DecideIssuerApplication,
      useFactory: (issuers: IssuerRepository, clock: Clock) =>
        new DecideIssuerApplication(issuers, clock),
      inject: [ISSUER_REPOSITORY, CLOCK],
    },
    {
      provide: AddTeamMember,
      useFactory: (
        issuers: IssuerRepository,
        people: PersonDirectory,
        verification: PersonVerification,
        clock: Clock,
      ) => new AddTeamMember(issuers, people, verification, clock),
      inject: [ISSUER_REPOSITORY, PERSON_DIRECTORY, PERSON_VERIFICATION, CLOCK],
    },
    {
      provide: RemoveTeamMember,
      useFactory: (issuers: IssuerRepository) => new RemoveTeamMember(issuers),
      inject: [ISSUER_REPOSITORY],
    },
    {
      provide: ListIssuers,
      // The staff repository names the deciding officer. It is platform-level
      // (raw client), which is why it is not the tenant-scoped one.
      useFactory: (issuers: IssuerRepository, staff: StaffUserRepository) =>
        new ListIssuers(issuers, staff),
      inject: [ISSUER_REPOSITORY, STAFF_USER_REPOSITORY],
    },
    {
      provide: GetIssuer,
      useFactory: (issuers: IssuerRepository, staff: StaffUserRepository) =>
        new GetIssuer(issuers, staff),
      inject: [ISSUER_REPOSITORY, STAFF_USER_REPOSITORY],
    },
    {
      provide: ListIssuerTeam,
      useFactory: (issuers: IssuerRepository, people: PersonDirectory) =>
        new ListIssuerTeam(issuers, people),
      inject: [ISSUER_REPOSITORY, PERSON_DIRECTORY],
    },
    {
      provide: ListMyIssuerOrganisations,
      // Same two collaborators as the staff-facing list: an issuer's own people
      // see their organisation described exactly as an officer sees it.
      useFactory: (issuers: IssuerRepository, staff: StaffUserRepository) =>
        new ListMyIssuerOrganisations(issuers, staff),
      inject: [ISSUER_REPOSITORY, STAFF_USER_REPOSITORY],
    },
    {
      // The issuer's door to the SAME attach use case staff use, with the
      // ownership question in front of it (3.3i).
      provide: AttachIssuerDocument,
      useFactory: (assets: AssetRepository, attach: AttachDossierDocument) =>
        new AttachIssuerDocument(assets, attach),
      inject: [ASSET_REPOSITORY, AttachDossierDocument],
    },
    {
      provide: ListIssuerAssets,
      useFactory: (assets: AssetRepository, issuers: IssuerRepository) =>
        new ListIssuerAssets(assets, issuers),
      inject: [ASSET_REPOSITORY, ISSUER_REPOSITORY],
    },
    {
      provide: IssuerTeamAccess,
      useFactory: (issuers: IssuerRepository) => new IssuerTeamAccess(issuers),
      inject: [ISSUER_REPOSITORY],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    // CSRF runs after AuthGuard (guard order follows provider order) so it can
    // read how the request authenticated; only cookie auth is challenged.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(tenantMiddleware).forRoutes("*path");
  }
}
