export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

export type MfaStatusDto = "none" | "pending" | "active";

// Permission strings, mirrored from the API's authorization catalog (1.4d). Used
// to hide UI a signed-in user isn't allowed to use; the server still enforces.
export const PERMISSIONS = {
  KYC_REVIEW: "kyc.review",
  INVESTOR_READ: "investor.read",
  ASSET_MANAGE: "asset.manage",
  OFFERING_MANAGE: "offering.manage",
  DISTRIBUTION_MANAGE: "distribution.manage",
  REDEMPTION_MANAGE: "redemption.manage",
  LEDGER_CREDIT: "ledger.credit",
  ATTESTATION_PUBLISH: "attestation.publish",
  REGISTRY_READ: "registry.read",
  AUDIT_READ: "audit.read",
  CRM_MANAGE: "crm.manage",
  REPORTING_READ: "reporting.read",
  APPROVAL_DECIDE: "approval.decide",
  ISSUER_MANAGE: "issuer.manage",
  MFA_SELF: "mfa.self",
  INVESTOR_PORTAL: "investor.portal",
} as const;

export type CreditResultDto =
  { status: "credited" } | { status: "pending_approval"; approvalId: string };

export type ApprovalStatusDto = "pending" | "approved" | "rejected";

export interface ApprovalViewDto {
  id: string;
  action: string;
  status: ApprovalStatusDto;
  summary: string;
  // The account id is the audit reference; the label is the colleague who
  // asked. Unresolved accounts keep the id.
  makerId: string;
  makerLabel?: string;
  checkerId?: string;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
}

// 2.1: what an ANONYMOUS visitor may see about an offering. Factual terms only
// — per OD-21 there is deliberately no projected yield or expected return here.
export interface PublicOfferingDto {
  id: string;
  assetId: string;
  assetName: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  opensAt: string;
  closesAt: string;
  publishedAt: string;
}

// 1.8: the ops triage view — what is waiting on a human right now.
export type WorkQueueKeyDto = "kyc" | "approvals" | "redemptions";

export interface WorkQueueItemDto {
  id: string;
  label: string;
  waitingSince?: string;
}

export interface WorkQueueSectionDto {
  key: WorkQueueKeyDto;
  total: number;
  items: WorkQueueItemDto[];
}

export interface WorkQueueDto {
  sections: WorkQueueSectionDto[];
  totalOutstanding: number;
}

// 1.7: an in-app notification addressed to the signed-in user. The API derives
// the recipient from the session, so these endpoints need no id argument.
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// Officer login is two-step when MFA is active: a correct password yields either
// a session (token) or an "mfaRequired" challenge to complete with a code.
export type OfficerLoginResult =
  { token: string; csrfToken: string } | { mfaRequired: true; mfaToken: string };

export interface InvestorViewDto {
  id: string;
  email: string;
  emailVerified: boolean;
  kycState: KycState;
  kycRejectionReason?: string;
  eligibleForClaims: boolean;
}

export type AssetState =
  "proposed" | "in_structuring" | "approved" | "tokenized" | "suspended" | "retired";

export interface RealEstateProfileDto {
  addressLine: string;
  city: string;
  propertyType: string;
  areaSquareMetres: number;
  titleReference: string;
  builtInYear?: number;
}

export interface ConveyedRightDto {
  kind: string;
  note: string;
}

export interface AssetViewDto {
  id: string;
  name: string;
  type: string;
  state: AssetState;
  tokenAddress?: string;
  realEstate?: RealEstateProfileDto;
  rights: ConveyedRightDto[];
  // 3.3: who brought this asset. Both absent means the platform onboarded it
  // itself — a real answer, not a blank. The name is what a reader sees.
  organisationId?: string;
  organisationName?: string;
  custody?: { custodianName: string; location: string };
  checklist: { confirmed: string[]; unconfirmed: string[] };
  dossier: {
    complete: boolean;
    missingKinds: string[];
    documents: {
      kind: string;
      title: string;
      cid: string;
      sha256: string;
      investorVisible: boolean;
    }[];
  };
}

export interface InvestorDocumentDto {
  kind: string;
  title: string;
  cid: string;
  sha256: string;
}

export interface OfferingSummaryDto {
  id: string;
  state: string;
  supply: string;
  subscribed: string;
  priceRial: string;
}

export interface DistributionSummaryDto {
  id: string;
  state: string;
  totalAmountRial: string;
}

export interface LatestValuationDto {
  valueRial: string;
  asOf: string;
  validUntil: string;
  fresh: boolean;
}

export interface AttestationViewDto {
  id: string;
  assetId: string;
  kind: string;
  valueRial: string;
  attestorId: string;
  asOf: string;
  validUntil: string;
  payloadHash: string;
  documentCid?: string;
  fresh: boolean;
}

export interface AssetOverviewDto {
  id: string;
  name: string;
  state: AssetState;
  tokenAddress?: string;
  circulatingSupply: string;
  holderCount: number;
  totalRaisedRial: string;
  totalDistributedRial: string;
  offerings: OfferingSummaryDto[];
  distributions: DistributionSummaryDto[];
  latestValuation?: LatestValuationDto;
}

export interface PortfolioOverviewDto {
  assets: AssetOverviewDto[];
  summary: {
    assetCount: number;
    tokenizedCount: number;
    totalRaisedRial: string;
    totalDistributedRial: string;
  };
}

export interface ScreeningDto {
  outcome: string;
  provider: string;
  simulated: boolean;
  checkedAt: string;
  disclaimer?: string;
}

// 4.2. The model is fetched, never hard-coded here: the server scores what it
// publishes, so a second copy in the web app could only ever drift from it.
export interface RiskFactorOptionDto {
  value: string;
  label: string;
  points: number;
}

export interface RiskFactorDto {
  id: string;
  label: string;
  help: string;
  options: RiskFactorOptionDto[];
}

export interface RiskModelDto {
  provisional: boolean;
  notice: string;
  thresholds: { medium: number; high: number };
  factors: RiskFactorDto[];
}

export interface RiskAssessmentDto {
  score: number;
  band: "low" | "medium" | "high";
  answers: { factorId: string; answer: string; points: number }[];
  assessedBy: string;
  assessedAt: string;
  // What the band does and does not mean, in the API's words rather than ours.
  advisory: string;
}

export interface SystemHealthDto {
  overall: "healthy" | "degraded";
  services: { api: string; postgres: string; ipfs: string; chain: string };
  chainBlockNumber?: number;
  pausedTokens: number;
  approvedWithoutOnchainIdentity: number;
}

export interface HoldingDto {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  tokens: string;
}

export interface RedemptionDto {
  id: string;
  assetId: string;
  tokenAddress: string;
  investorId: string;
  tokens: string;
  state: "requested" | "fulfilled" | "rejected";
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
  resolvedAt?: string;
}

export interface RegistryHolderDto {
  wallet: string;
  tokens: string;
  since: string;
  shareBps: number;
  investorId?: string;
  email?: string;
}

export interface RegistryEventDto {
  kind: "mint" | "transfer" | "burn";
  tokens: string;
  at: string;
  ref: string;
  from?: string;
  to?: string;
}

export interface HolderRegistryDto {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  holders: RegistryHolderDto[];
  registryTotal: string;
  onChainSupply: string;
  matchesChain: boolean;
  history: RegistryEventDto[];
}

export interface AuditEventDto {
  id: string;
  assetId: string;
  assetName: string;
  event: string;
  actor: string;
  details: Record<string, string>;
  at: string;
}

export interface CsvDownloadDto {
  filename: string;
  csv: string;
}

export type RelationshipStageDto = "lead" | "contacted" | "onboarding" | "active" | "dormant";

export interface InvestorDirectoryEntryDto extends InvestorViewDto {
  balanceRial: string;
  heldRial: string;
  stage: RelationshipStageDto;
  tags: string[];
  totalInvestedRial: string;
  portfolioValueRial: string;
}

export interface InvestorDirectorySummaryDto {
  investorCount: number;
  totalBalanceRial: string;
  totalInvestedRial: string;
  totalPortfolioValueRial: string;
}

export interface InvestorDirectoryDto {
  investors: InvestorDirectoryEntryDto[];
  summary: InvestorDirectorySummaryDto;
}

export interface InvestorTransferItemDto {
  id: string;
  direction: "sent" | "received";
  counterparty: string;
  assetName: string;
  tokens: string;
  at: string;
}

export interface InvestorRedemptionItemDto {
  id: string;
  assetName: string;
  tokens: string;
  state: "requested" | "fulfilled" | "rejected";
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
}

export interface FollowUpDto {
  id: string;
  text: string;
  dueAt: string;
  state: "open" | "done";
  overdue: boolean;
}

export interface InvestorCrmDto {
  stage: RelationshipStageDto;
  tags: string[];
  followUps: FollowUpDto[];
}

export interface ValuedHoldingDto {
  assetId: string;
  assetName: string;
  tokens: string;
  valueRial?: string;
  valuationFresh: boolean;
}

export interface SubscriptionHistoryDto {
  offeringId: string;
  assetId: string;
  assetName: string;
  state: string;
  requested: string;
  allocated: string;
  costRial: string;
  refundRial: string;
  closesAt: string;
}

export interface InvestorSalesDto {
  totalInvestedRial: string;
  portfolioValueRial: string;
  portfolioValueFresh: boolean;
  holdings: ValuedHoldingDto[];
  subscriptions: SubscriptionHistoryDto[];
}

export interface TimelineItemDto {
  kind: "note" | "event";
  at: string;
  text: string;
  actor: string;
  assetName?: string;
}

export interface OpenFollowUpDto {
  id: string;
  investorId: string;
  email: string;
  text: string;
  dueAt: string;
  overdue: boolean;
}

export interface InvestorDetailDto {
  investor: InvestorViewDto;
  chain: { identityAddress?: string; walletAddress?: string };
  ledger: { balanceRial: string; heldRial: string };
  holdings: HoldingDto[];
  transfers: InvestorTransferItemDto[];
  redemptions: InvestorRedemptionItemDto[];
  crm: InvestorCrmDto;
  sales: InvestorSalesDto;
  timeline: TimelineItemDto[];
}

export interface ApiClient {
  register(email: string, password: string): Promise<{ investorId: string }>;
  login(
    email: string,
    password: string,
  ): Promise<{ token: string; investorId: string; csrfToken: string }>;
  officerLogin(email: string, password: string): Promise<OfficerLoginResult>;
  // Officer MFA (T4). Login step 2 (public); plus authenticated management
  // (enroll/confirm/disable) that carries the CSRF token, and a GET status.
  officerMfa(mfaToken: string, code: string): Promise<{ token: string; csrfToken: string }>;
  officerMfaStatus(): Promise<{ status: MfaStatusDto }>;
  officerMfaEnroll(csrfToken: string): Promise<{ secret: string; keyUri: string }>;
  officerMfaConfirm(csrfToken: string, code: string): Promise<{ recoveryCodes: string[] }>;
  officerMfaDisable(csrfToken: string): Promise<void>;
  // Self-service password reset (T4). Both are public and never reveal whether
  // an account exists; the request half always resolves, the reset half rejects
  // (ApiError 400) on an invalid/expired token or a weak password.
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  // Email verification (T4). Request (also used for "resend") always resolves;
  // verify rejects (ApiError 400) on an invalid or expired token.
  requestEmailVerification(email: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  getSession(): Promise<{ kind: "investor" | "officer"; permissions: string[] }>;
  logout(csrfToken: string): Promise<void>;
  me(token: string): Promise<InvestorViewDto>;
  startOnboarding(csrfToken: string): Promise<OnboardingProgressDto>;
  getOnboarding(): Promise<OnboardingStatusResponseDto>;
  completeOnboardingStep(
    csrfToken: string,
    step: OnboardingStepDto,
  ): Promise<OnboardingProgressDto>;
  uploadEvidence(
    csrfToken: string,
    step: OnboardingStepDto,
    file: File,
  ): Promise<EvidenceDescriptorDto>;
  removeEvidence(csrfToken: string, reference: string): Promise<OnboardingProgressDto>;
  getMyEvidence(reference: string): Promise<EvidenceContentDto>;
  getOnboardingAnswers(): Promise<OnboardingAnswersDto>;
  saveOnboardingAnswers(
    csrfToken: string,
    step: OnboardingStepDto,
    answers: StepAnswersDto,
  ): Promise<OnboardingProgressDto>;
  getApplicantAnswers(investorId: string): Promise<OnboardingAnswersDto>;
  submitOnboarding(csrfToken: string): Promise<OnboardingProgressDto>;
  getApplicantOnboarding(investorId: string): Promise<OnboardingStatusResponseDto>;
  getEvidence(reference: string): Promise<EvidenceContentDto>;
  requestOnboardingChanges(
    csrfToken: string,
    investorId: string,
    requests: ChangeRequestDto[],
  ): Promise<OnboardingProgressDto>;
  pendingKyc(officerToken: string): Promise<InvestorViewDto[]>;
  startReview(officerToken: string, investorId: string): Promise<void>;
  approve(officerToken: string, investorId: string): Promise<void>;
  reject(officerToken: string, investorId: string, reason: string): Promise<void>;
  listAssets(officerToken: string): Promise<AssetViewDto[]>;
  getAsset(officerToken: string, assetId: string): Promise<AssetViewDto>;
  proposeAsset(
    officerToken: string,
    name: string,
    organisationId?: string,
  ): Promise<{ assetId: string }>;
  startStructuring(officerToken: string, assetId: string): Promise<void>;
  attachAssetDocument(
    officerToken: string,
    assetId: string,
    doc: { kind: string; title: string; contentBase64: string },
  ): Promise<{ cid: string; sha256: string }>;
  recordCustody(
    officerToken: string,
    assetId: string,
    custody: { custodianName: string; location: string },
  ): Promise<void>;
  confirmChecklistItem(officerToken: string, assetId: string, item: string): Promise<void>;
  approveAsset(officerToken: string, assetId: string): Promise<void>;
  setDocumentVisibility(
    officerToken: string,
    assetId: string,
    kind: string,
    visible: boolean,
  ): Promise<void>;
  recordRealEstateProfile(
    officerToken: string,
    assetId: string,
    profile: RealEstateProfileDto,
  ): Promise<void>;
  conveyRight(officerToken: string, assetId: string, kind: string, note: string): Promise<void>;
  withdrawRight(officerToken: string, assetId: string, kind: string): Promise<void>;
  myAssetDocuments(assetId: string): Promise<InvestorDocumentDto[]>;
  tokenizeAsset(
    officerToken: string,
    assetId: string,
    symbol: string,
  ): Promise<{ tokenAddress: string }>;
  ledgerMe(token: string): Promise<LedgerDto>;
  requestFunding(csrfToken: string, amountRial: string): Promise<FundingOpenedDto>;
  myFunding(): Promise<FundingRequestDto[]>;
  cancelFunding(csrfToken: string, id: string): Promise<FundingRequestDto>;
  pendingFunding(): Promise<PendingFundingDto[]>;
  confirmFunding(
    csrfToken: string,
    id: string,
    receivedRial: string,
  ): Promise<{ request: FundingRequestDto; creditStatus: { status: string } }>;
  rejectFunding(csrfToken: string, id: string, reason: string): Promise<FundingRequestDto>;
  // 3.2: issuer organisations. Reviewing and deciding is staff work behind
  // issuer.manage; every decision that refuses carries a reason.
  issuers(): Promise<IssuerOrganisationDto[]>;
  // Not "the issuers" but "mine": staff read the review queue, a person acting
  // for an issuer reads only their own.
  myIssuerOrganisations(): Promise<MyIssuerOrganisationDto[]>;
  issuer(id: string): Promise<IssuerOrganisationDto>;
  issuerTeam(id: string): Promise<IssuerMemberDto[]>;
  // 3.3g: the assets this organisation brought. Membership-authorised, so a
  // person who does not act for it gets a 403 rather than an empty list.
  issuerAssets(id: string): Promise<AssetViewDto[]>;
  // 3.3h: the issuer brings its own asset. The organisation is the path, not a
  // field — nobody may bring an asset in another organisation's name.
  bringIssuerAsset(csrfToken: string, id: string, name: string): Promise<{ assetId: string }>;
  // 3.3i: the issuer files the dossier for the asset it brought. The
  // organisation is in the path, so nobody can file against another's asset.
  attachIssuerAssetDocument(
    csrfToken: string,
    id: string,
    assetId: string,
    doc: { kind: string; title: string; contentBase64: string },
  ): Promise<{ cid: string; sha256: string }>;
  addIssuerMember(
    csrfToken: string,
    id: string,
    email: string,
    role: IssuerMemberDto["role"],
  ): Promise<void>;
  removeIssuerMember(csrfToken: string, id: string, userId: string): Promise<void>;
  startIssuerReview(csrfToken: string, id: string): Promise<void>;
  approveIssuer(csrfToken: string, id: string): Promise<void>;
  rejectIssuer(csrfToken: string, id: string, reason: string): Promise<void>;
  suspendIssuer(csrfToken: string, id: string, reason: string): Promise<void>;
  reinstateIssuer(csrfToken: string, id: string): Promise<void>;
  // T1/T3: a credit at/above the approval threshold returns pending_approval
  // (parked for a second officer) instead of applying immediately.
  creditLedger(
    officerToken: string,
    investorId: string,
    amountRial: string,
  ): Promise<CreditResultDto>;
  listApprovals(officerToken: string): Promise<ApprovalViewDto[]>;
  approveApproval(officerToken: string, approvalId: string): Promise<void>;
  rejectApproval(officerToken: string, approvalId: string, reason: string): Promise<void>;
  // 2.1 public marketplace (OD-5): reachable with NO session, so these take no
  // token — the server exposes only deliberately-published offerings.
  publicOfferings(): Promise<PublicOfferingDto[]>;
  publicOffering(id: string): Promise<PublicOfferingDto>;
  getWorkQueue(officerToken: string): Promise<WorkQueueDto>;
  // Notifications (1.7): self-scoped — the recipient comes from the session.
  listNotifications(token: string): Promise<NotificationDto[]>;
  unreadNotificationCount(token: string): Promise<number>;
  markNotificationRead(token: string, notificationId: string): Promise<void>;
  markAllNotificationsRead(token: string): Promise<void>;
  listOfferings(token: string): Promise<OfferingViewDto[]>;
  getOffering(token: string, offeringId: string): Promise<OfferingViewDto>;
  createOffering(officerToken: string, body: CreateOfferingBody): Promise<{ offeringId: string }>;
  openOffering(officerToken: string, offeringId: string): Promise<void>;
  closeOffering(officerToken: string, offeringId: string): Promise<CloseResultDto>;
  subscribeOffering(token: string, offeringId: string, tokens: string): Promise<void>;
  listDistributions(officerToken: string): Promise<DistributionViewDto[]>;
  getDistribution(officerToken: string, distributionId: string): Promise<DistributionViewDto>;
  assetOverview(officerToken: string): Promise<PortfolioOverviewDto>;
  // K-2 recovery: reissue an on-chain claim for an already-approved investor
  // whose claim failed when it was first made.
  reissueKycClaim(officerToken: string, investorId: string): Promise<void>;
  // 4.2: `disclaimer` is present when the result was simulated. It comes from
  // the API rather than being composed here, so every reader gets it.
  screenInvestor(officerToken: string, investorId: string): Promise<ScreeningDto>;
  investorScreenings(officerToken: string, investorId: string): Promise<ScreeningDto[]>;
  // 4.2 risk rating. The form renders whatever `riskModel` returns.
  riskModel(officerToken: string): Promise<RiskModelDto>;
  assessRisk(
    officerToken: string,
    investorId: string,
    answers: Record<string, string>,
  ): Promise<RiskAssessmentDto>;
  investorRiskAssessments(officerToken: string, investorId: string): Promise<RiskAssessmentDto[]>;
  systemHealth(officerToken: string): Promise<SystemHealthDto>;
  publishAttestation(
    officerToken: string,
    body: {
      assetId: string;
      kind: string;
      valueRial: string;
      validUntil: string;
      documentCid?: string;
    },
  ): Promise<{ attestationId: string; payloadHash: string }>;
  listAttestations(officerToken: string, assetId: string): Promise<AttestationViewDto[]>;
  myHoldings(token: string): Promise<HoldingDto[]>;
  getPortfolio(): Promise<PortfolioDto>;
  transferTokens(
    token: string,
    body: { assetId: string; toEmail: string; tokens: string },
  ): Promise<{ transferId: string }>;
  requestRedemption(
    token: string,
    body: { assetId: string; tokens: string },
  ): Promise<{ redemptionId: string }>;
  myRedemptions(token: string): Promise<RedemptionDto[]>;
  listRedemptions(officerToken: string): Promise<RedemptionDto[]>;
  fulfillRedemption(officerToken: string, redemptionId: string): Promise<{ payoutRial: string }>;
  rejectRedemption(officerToken: string, redemptionId: string, reason: string): Promise<void>;
  declareDistribution(
    officerToken: string,
    assetId: string,
    totalAmountRial: string,
  ): Promise<{ distributionId: string }>;
  // 4.1: this REQUESTS a payout; a second officer approves it before any money
  // moves. The response says so, and the screen must not call it "paid".
  payDistribution(
    officerToken: string,
    distributionId: string,
  ): Promise<{ status: string; approvalId: string }>;
  holderRegistry(officerToken: string, assetId: string): Promise<HolderRegistryDto>;
  registryCsv(officerToken: string, assetId: string): Promise<CsvDownloadDto>;
  transfersCsv(officerToken: string, assetId: string): Promise<CsvDownloadDto>;
  auditTrail(
    officerToken: string,
    filter?: { assetId?: string; limit?: number },
  ): Promise<AuditEventDto[]>;
  listInvestors(officerToken: string): Promise<InvestorDirectoryDto>;
  investorDetail(officerToken: string, investorId: string): Promise<InvestorDetailDto>;
  setInvestorStage(
    officerToken: string,
    investorId: string,
    stage: RelationshipStageDto,
  ): Promise<void>;
  addInvestorTag(officerToken: string, investorId: string, tag: string): Promise<void>;
  removeInvestorTag(officerToken: string, investorId: string, tag: string): Promise<void>;
  addInvestorNote(
    officerToken: string,
    investorId: string,
    text: string,
  ): Promise<{ noteId: string }>;
  createFollowUp(
    officerToken: string,
    investorId: string,
    body: { text: string; dueAt: string },
  ): Promise<{ followUpId: string }>;
  completeFollowUp(officerToken: string, followUpId: string): Promise<void>;
  openFollowUps(officerToken: string): Promise<OpenFollowUpDto[]>;
}

export type DistributionStateDto = "declared" | "paid";

export interface DistributionViewDto {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  totalAmountRial: string;
  state: DistributionStateDto;
  payouts: { investorId: string; email: string; tokens: string; amountRial: string }[];
  reconciliation: { declared: string; allocated: string; balanced: boolean };
}

export interface LedgerDto {
  balanceRial: string;
  heldRial: string;
}

export type OfferingStateDto = "draft" | "open" | "closed_success" | "closed_failed";

export interface OfferingViewDto {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  opensAt: string;
  closesAt: string;
  state: OfferingStateDto;
  totalSubscribed: string;
  mySubscribed?: string;
  myAllocation?: { requested: string; allocated: string; costRial: string; refundRial: string };
  participants?: OfferingParticipantDto[];
}

export interface OfferingParticipantDto {
  investorId: string;
  email: string;
  subscribed: string;
  requested?: string;
  allocated?: string;
  costRial?: string;
  refundRial?: string;
}

export interface CreateOfferingBody {
  assetId: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  opensAt: string;
  closesAt: string;
}

export interface CloseResultDto {
  state: OfferingStateDto;
  allocations: {
    investorId: string;
    requested: string;
    allocated: string;
    costRial: string;
    refundRial: string;
  }[];
}

// 2.3: the onboarding wizard. Steps are collected in any order; the officer
// may send the application back naming exactly which ones to redo.
export type OnboardingStepDto =
  "profile" | "identity_evidence" | "bank_account" | "suitability" | "agreements";

export type OnboardingStatusDto = "in_progress" | "submitted" | "changes_requested";

export interface ChangeRequestDto {
  step: OnboardingStepDto;
  reason: string;
}

// Metadata only — document content is fetched separately and never listed.
export interface EvidenceDescriptorDto {
  reference: string;
  investorId: string;
  step: OnboardingStepDto;
  filename: string;
  contentType: string;
  byteSize: number;
  uploadedAt: string;
}

export interface OnboardingProgressDto {
  applicationId: string;
  status: OnboardingStatusDto;
  completedSteps: OnboardingStepDto[];
  outstandingSteps: OnboardingStepDto[];
  changeRequests: ChangeRequestDto[];
  evidence: EvidenceDescriptorDto[];
  submittedAt?: string;
}

// "Never started" is a normal state, said explicitly rather than as an absent body.
export interface OnboardingStatusResponseDto {
  started: boolean;
  application?: OnboardingProgressDto;
}

// The server owns the field set (PROVISIONAL — it requires local legal
// validation). The wizard renders whatever this describes, so changing what an
// applicant must provide needs no web release.
export interface FormFieldDto {
  name: string;
  label: string;
  type: "text" | "date" | "select" | "checkbox";
  required: boolean;
  options?: string[];
  maxLength?: number;
  help?: string;
}

export interface OnboardingFormDto {
  provisional: boolean;
  notice: string;
  steps: Record<OnboardingStepDto, FormFieldDto[]>;
}

export type StepAnswersDto = Record<string, string>;

export interface OnboardingAnswersDto {
  form: OnboardingFormDto;
  answers: Partial<Record<OnboardingStepDto, StepAnswersDto>>;
}

export interface EvidenceContentDto {
  filename: string;
  contentType: string;
  contentBase64: string;
}

// 2.5: the holder's own position. Strictly factual — value carries the date of
// the attestation behind it and whether that attestation is still fresh; income
// is money that was actually paid. There is deliberately no projected yield.
export interface PortfolioHoldingDto {
  assetId: string;
  assetName: string;
  tokens: string;
  valueRial?: string;
  valuationFresh: boolean;
  valuedAt?: string;
  shareBasisPoints?: number;
}

export interface PortfolioIncomeItemDto {
  distributionId: string;
  assetId: string;
  assetName: string;
  amountRial: string;
  paidAt: string;
}

export interface PortfolioDto {
  totalInvestedRial: string;
  portfolioValueRial: string;
  portfolioValueFresh: boolean;
  valuedAt?: string;
  incomeReceivedRial: string;
  holdings: PortfolioHoldingDto[];
  income: PortfolioIncomeItemDto[];
  subscriptions: SubscriptionHistoryDto[];
}

// 2.4 / OD-6: money in. The investor declares a transfer and quotes the
// reference; treasury confirms what actually arrived, which is what is credited.
export type FundingStatusDto = "pending" | "confirmed" | "rejected" | "cancelled";

export interface FundingRequestDto {
  id: string;
  status: FundingStatusDto;
  amountRial: string;
  reference: string;
  requestedAt: string;
  settledAt?: string;
  settledAmountRial?: string;
  rejectionReason?: string;
}

// The platform's own bank account, from deployment configuration — the values
// read "NOT CONFIGURED" until a deployment supplies them.
export interface PaymentInstructionsDto {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  notice: string;
}

export interface FundingOpenedDto {
  request: FundingRequestDto;
  instructions: PaymentInstructionsDto;
}

export interface PendingFundingDto extends FundingRequestDto {
  investorId: string;
  investorEmail: string;
}

// 3.2: an organisation that brings assets to the platform. It is not a user —
// people act for it — and it can do nothing until the platform approves it.
export type IssuerStateDto = "applied" | "in_review" | "approved" | "rejected" | "suspended";

export interface IssuerOrganisationDto {
  id: string;
  legalName: string;
  registrationNumber: string;
  contactEmail: string;
  state: IssuerStateDto;
  appliedAt: string;
  decidedAt?: string;
  // The account id is the audit-stable reference; the label is the person. An
  // unresolved account has no label, and the row falls back to the id.
  decidedBy?: string;
  decidedByLabel?: string;
  rejectionReason?: string;
  canSubmitAssets: boolean;
}

// 3.3: the same organisation, seen by one of its OWN people. The extra three
// fields are what the issuer portal must know before it renders anything: who
// this person is here, and what that lets them do.
export interface MyIssuerOrganisationDto extends IssuerOrganisationDto {
  role: "issuer_admin" | "issuer_contributor";
  canManageTeam: boolean;
  canWorkOnAssets: boolean;
}

// A person acting for an issuer. Known by their address; the id is what the
// remove call needs. An address that cannot be resolved leaves the row without
// one rather than hiding the person.
export interface IssuerMemberDto {
  userId: string;
  email?: string;
  role: "issuer_admin" | "issuer_contributor";
  addedAt: string;
  canManageTeam: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const createApiClient = (
  baseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
): ApiClient => {
  const call = async (
    path: string,
    init: { method?: string; token?: string; body?: unknown; form?: FormData } = {},
  ): Promise<Response> => {
    const method = init.method ?? "GET";
    // Cookie-session auth: the httpOnly session cookie is sent automatically
    // (credentials:include). State-changing requests carry the CSRF token
    // (double-submit) — the `token` argument is that CSRF token, read by the
    // caller from the readable tk_csrf cookie. GETs need no CSRF.
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        // A multipart body sets its own content-type (with the boundary), so
        // it must NOT be overridden here.
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" && init.token !== undefined ? { "x-csrf-token": init.token } : {}),
      },
      ...(init.form !== undefined
        ? { body: init.form }
        : init.body !== undefined
          ? { body: JSON.stringify(init.body) }
          : {}),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      // Never an errorless error. `??` lets an empty string through, and
      // statusText is empty over HTTP/2, so a failure could reach the screen
      // as a red box containing nothing — which tells the reader that
      // something broke and not one thing more. The status is the last
      // resort, and it is still worth more than silence.
      const explanation = [body.message, res.statusText]
        .map((candidate) => candidate?.trim())
        .find((candidate) => candidate !== undefined && candidate !== "");
      throw new ApiError(res.status, explanation ?? `the request failed (${String(res.status)})`);
    }
    return res;
  };

  const json = async <T>(res: Promise<Response>): Promise<T> => (await res).json() as Promise<T>;

  // CSV attachments: body is plain text; the filename travels in the header.
  const csv = async (res: Promise<Response>): Promise<CsvDownloadDto> => {
    const response = await res;
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export.csv";
    return { filename, csv: await response.text() };
  };

  return {
    register: (email, password) =>
      json(call("/investors", { method: "POST", body: { email, password } })),
    login: (email, password) =>
      json(call("/auth/login", { method: "POST", body: { email, password } })),
    officerLogin: (email, password) =>
      json(call("/auth/officer/login", { method: "POST", body: { email, password } })),
    officerMfa: (mfaToken, code) =>
      json(call("/auth/officer/mfa", { method: "POST", body: { mfaToken, code } })),
    officerMfaStatus: () => json(call("/auth/officer/mfa/status")),
    officerMfaEnroll: (csrfToken) =>
      json(call("/auth/officer/mfa/enroll", { method: "POST", token: csrfToken })),
    officerMfaConfirm: (csrfToken, code) =>
      json(call("/auth/officer/mfa/confirm", { method: "POST", token: csrfToken, body: { code } })),
    officerMfaDisable: async (csrfToken) => {
      await call("/auth/officer/mfa/disable", { method: "POST", token: csrfToken });
    },
    requestPasswordReset: async (email) => {
      await call("/auth/password-reset/request", { method: "POST", body: { email } });
    },
    resetPassword: async (token, password) => {
      await call("/auth/password-reset", { method: "POST", body: { token, password } });
    },
    requestEmailVerification: async (email) => {
      await call("/auth/email-verification/request", { method: "POST", body: { email } });
    },
    verifyEmail: async (token) => {
      await call("/auth/verify-email", { method: "POST", body: { token } });
    },
    getSession: () => json(call("/auth/session")),
    logout: async (csrfToken) => {
      await call("/auth/logout", { method: "POST", token: csrfToken });
    },
    me: (token) => json(call("/investors/me", { token })),
    startOnboarding: (csrfToken) =>
      json(call("/onboarding/start", { method: "POST", token: csrfToken })),
    getOnboarding: () => json(call("/onboarding/me")),
    completeOnboardingStep: (csrfToken, step) =>
      json(call(`/onboarding/me/steps/${step}/complete`, { method: "POST", token: csrfToken })),
    uploadEvidence: (csrfToken, step, file) => {
      // Multipart, so the browser streams the file instead of inflating it by
      // a third as base64 on the way up. The boundary header is left to fetch.
      const form = new FormData();
      form.append("step", step);
      form.append("file", file);
      return json(call("/onboarding/me/evidence", { method: "POST", token: csrfToken, form }));
    },
    removeEvidence: (csrfToken, reference) =>
      json(
        call(`/onboarding/me/evidence/${encodeURIComponent(reference)}`, {
          method: "DELETE",
          token: csrfToken,
        }),
      ),
    getMyEvidence: (reference) =>
      json(call(`/onboarding/me/evidence/${encodeURIComponent(reference)}`)),
    getOnboardingAnswers: () => json(call("/onboarding/me/answers")),
    saveOnboardingAnswers: (csrfToken, step, answers) =>
      json(
        call(`/onboarding/me/steps/${step}/answers`, {
          method: "POST",
          token: csrfToken,
          body: { answers },
        }),
      ),
    getApplicantAnswers: (investorId) =>
      json(call(`/onboarding/${encodeURIComponent(investorId)}/answers`)),
    submitOnboarding: (csrfToken) =>
      json(call("/onboarding/me/submit", { method: "POST", token: csrfToken })),
    getApplicantOnboarding: (investorId) =>
      json(call(`/onboarding/${encodeURIComponent(investorId)}`)),
    getEvidence: (reference) => json(call(`/onboarding/evidence/${encodeURIComponent(reference)}`)),
    requestOnboardingChanges: (csrfToken, investorId, requests) =>
      json(
        call(`/onboarding/${encodeURIComponent(investorId)}/request-changes`, {
          method: "POST",
          token: csrfToken,
          body: { requests },
        }),
      ),
    pendingKyc: (officerToken) => json(call("/investors/pending-kyc", { token: officerToken })),
    startReview: async (officerToken, investorId) => {
      await call(`/investors/${investorId}/kyc/start-review`, {
        method: "POST",
        token: officerToken,
      });
    },
    approve: async (officerToken, investorId) => {
      await call(`/investors/${investorId}/kyc/approve`, { method: "POST", token: officerToken });
    },
    reject: async (officerToken, investorId, reason) => {
      await call(`/investors/${investorId}/kyc/reject`, {
        method: "POST",
        token: officerToken,
        body: { reason },
      });
    },
    listAssets: (officerToken) => json(call("/assets", { token: officerToken })),
    getAsset: (officerToken, assetId) => json(call(`/assets/${assetId}`, { token: officerToken })),
    proposeAsset: (officerToken, name, organisationId) =>
      json(
        call("/assets", {
          method: "POST",
          token: officerToken,
          body: { name, ...(organisationId !== undefined ? { organisationId } : {}) },
        }),
      ),
    startStructuring: async (officerToken, assetId) => {
      await call(`/assets/${assetId}/start-structuring`, { method: "POST", token: officerToken });
    },
    attachAssetDocument: (officerToken, assetId, doc) =>
      json(
        call(`/assets/${assetId}/documents`, { method: "POST", token: officerToken, body: doc }),
      ),
    recordCustody: async (officerToken, assetId, custody) => {
      await call(`/assets/${assetId}/custody`, {
        method: "POST",
        token: officerToken,
        body: custody,
      });
    },
    confirmChecklistItem: async (officerToken, assetId, item) => {
      await call(`/assets/${assetId}/checklist/${item}`, { method: "POST", token: officerToken });
    },
    approveAsset: async (officerToken, assetId) => {
      await call(`/assets/${assetId}/approve`, { method: "POST", token: officerToken });
    },
    recordRealEstateProfile: async (officerToken, assetId, profile) => {
      await call(`/assets/${assetId}/real-estate`, {
        method: "POST",
        token: officerToken,
        body: profile,
      });
    },
    conveyRight: async (officerToken, assetId, kind, note) => {
      await call(`/assets/${assetId}/rights/${kind}`, {
        method: "POST",
        token: officerToken,
        body: { note },
      });
    },
    withdrawRight: async (officerToken, assetId, kind) => {
      await call(`/assets/${assetId}/rights/${kind}`, { method: "DELETE", token: officerToken });
    },
    setDocumentVisibility: async (officerToken, assetId, kind, visible) => {
      await call(`/assets/${assetId}/documents/${kind}/visibility`, {
        method: "POST",
        token: officerToken,
        body: { visible },
      });
    },
    myAssetDocuments: (assetId) => json(call(`/portfolio/assets/${assetId}/documents`)),
    tokenizeAsset: (officerToken, assetId, symbol) =>
      json(
        call(`/assets/${assetId}/tokenize`, {
          method: "POST",
          token: officerToken,
          body: { symbol },
        }),
      ),
    ledgerMe: (token) => json(call("/ledger/me", { token })),
    requestFunding: (csrfToken, amountRial) =>
      json(call("/funding/me", { method: "POST", token: csrfToken, body: { amountRial } })),
    myFunding: () => json(call("/funding/me")),
    cancelFunding: (csrfToken, id) =>
      json(
        call(`/funding/me/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          token: csrfToken,
        }),
      ),
    pendingFunding: () => json(call("/funding/pending")),
    confirmFunding: (csrfToken, id, receivedRial) =>
      json(
        call(`/funding/${encodeURIComponent(id)}/confirm`, {
          method: "POST",
          token: csrfToken,
          body: { receivedRial },
        }),
      ),
    rejectFunding: (csrfToken, id, reason) =>
      json(
        call(`/funding/${encodeURIComponent(id)}/reject`, {
          method: "POST",
          token: csrfToken,
          body: { reason },
        }),
      ),
    issuers: () => json(call("/issuers")),
    myIssuerOrganisations: () => json(call("/issuers/mine")),
    issuer: (id) => json(call(`/issuers/${encodeURIComponent(id)}`)),
    issuerTeam: (id) => json(call(`/issuers/${encodeURIComponent(id)}/members`)),
    issuerAssets: (id) => json(call(`/issuers/${encodeURIComponent(id)}/assets`)),
    attachIssuerAssetDocument: (csrfToken, id, assetId, doc) =>
      json(
        call(`/issuers/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}/documents`, {
          method: "POST",
          token: csrfToken,
          body: doc,
        }),
      ),
    bringIssuerAsset: (csrfToken, id, name) =>
      json(
        call(`/issuers/${encodeURIComponent(id)}/assets`, {
          method: "POST",
          token: csrfToken,
          body: { name },
        }),
      ),
    addIssuerMember: async (csrfToken, id, email, role) => {
      await call(`/issuers/${encodeURIComponent(id)}/members`, {
        method: "POST",
        token: csrfToken,
        body: { email, role },
      });
    },
    removeIssuerMember: async (csrfToken, id, userId) => {
      await call(`/issuers/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        token: csrfToken,
      });
    },
    startIssuerReview: async (csrfToken, id) => {
      await call(`/issuers/${encodeURIComponent(id)}/start-review`, {
        method: "POST",
        token: csrfToken,
      });
    },
    approveIssuer: async (csrfToken, id) => {
      await call(`/issuers/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        token: csrfToken,
      });
    },
    rejectIssuer: async (csrfToken, id, reason) => {
      await call(`/issuers/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        token: csrfToken,
        body: { reason },
      });
    },
    suspendIssuer: async (csrfToken, id, reason) => {
      await call(`/issuers/${encodeURIComponent(id)}/suspend`, {
        method: "POST",
        token: csrfToken,
        body: { reason },
      });
    },
    reinstateIssuer: async (csrfToken, id) => {
      await call(`/issuers/${encodeURIComponent(id)}/reinstate`, {
        method: "POST",
        token: csrfToken,
      });
    },
    creditLedger: async (officerToken, investorId, amountRial) => {
      const res = await call(`/ledger/${investorId}/credit`, {
        method: "POST",
        token: officerToken,
        body: { amountRial },
      });
      // 204 = applied directly; 202 = parked for approval (with a body).
      if (res.status === 204) {
        return { status: "credited" };
      }
      return (await res.json()) as { status: "pending_approval"; approvalId: string };
    },
    listApprovals: (officerToken) => json(call("/approvals", { token: officerToken })),
    approveApproval: async (officerToken, approvalId) => {
      await call(`/approvals/${approvalId}/approve`, { method: "POST", token: officerToken });
    },
    rejectApproval: async (officerToken, approvalId, reason) => {
      await call(`/approvals/${approvalId}/reject`, {
        method: "POST",
        token: officerToken,
        body: { reason },
      });
    },
    publicOfferings: () => json(call("/public/offerings")),
    publicOffering: (id) => json(call(`/public/offerings/${id}`)),
    getWorkQueue: (officerToken) => json(call("/reporting/work-queue", { token: officerToken })),
    listNotifications: (token) => json(call("/notifications", { token })),
    unreadNotificationCount: async (token) => {
      const res = await json<{ count: number }>(call("/notifications/unread-count", { token }));
      return res.count;
    },
    markNotificationRead: async (token, notificationId) => {
      await call(`/notifications/${notificationId}/read`, { method: "POST", token });
    },
    markAllNotificationsRead: async (token) => {
      await call("/notifications/read-all", { method: "POST", token });
    },
    listOfferings: (token) => json(call("/offerings", { token })),
    getOffering: (token, offeringId) => json(call(`/offerings/${offeringId}`, { token })),
    createOffering: (officerToken, body) =>
      json(call("/offerings", { method: "POST", token: officerToken, body })),
    openOffering: async (officerToken, offeringId) => {
      await call(`/offerings/${offeringId}/open`, { method: "POST", token: officerToken });
    },
    closeOffering: (officerToken, offeringId) =>
      json(call(`/offerings/${offeringId}/close`, { method: "POST", token: officerToken })),
    subscribeOffering: async (token, offeringId, tokens) => {
      await call(`/offerings/${offeringId}/subscribe`, {
        method: "POST",
        token,
        body: { tokens },
      });
    },
    listDistributions: (officerToken) => json(call("/distributions", { token: officerToken })),
    getDistribution: (officerToken, distributionId) =>
      json(call(`/distributions/${distributionId}`, { token: officerToken })),
    declareDistribution: (officerToken, assetId, totalAmountRial) =>
      json(
        call("/distributions", {
          method: "POST",
          token: officerToken,
          body: { assetId, totalAmountRial },
        }),
      ),
    assetOverview: (officerToken) => json(call("/reporting/assets", { token: officerToken })),
    screenInvestor: (officerToken, investorId) =>
      json(
        call(`/investors/${encodeURIComponent(investorId)}/screenings`, {
          method: "POST",
          token: officerToken,
        }),
      ),
    investorScreenings: (officerToken, investorId) =>
      json(
        call(`/investors/${encodeURIComponent(investorId)}/screenings`, { token: officerToken }),
      ),
    riskModel: (officerToken) =>
      json(call("/investors/risk-model/current", { token: officerToken })),
    assessRisk: (officerToken, investorId, answers) =>
      json(
        call(`/investors/${encodeURIComponent(investorId)}/risk-assessments`, {
          method: "POST",
          token: officerToken,
          body: { answers },
        }),
      ),
    investorRiskAssessments: (officerToken, investorId) =>
      json(
        call(`/investors/${encodeURIComponent(investorId)}/risk-assessments`, {
          token: officerToken,
        }),
      ),
    reissueKycClaim: async (officerToken, investorId) => {
      await call(`/investors/${encodeURIComponent(investorId)}/kyc/reissue-claim`, {
        method: "POST",
        token: officerToken,
      });
    },
    systemHealth: (officerToken) => json(call("/reporting/health", { token: officerToken })),
    publishAttestation: (officerToken, body) =>
      json(call("/attestations", { method: "POST", token: officerToken, body })),
    listAttestations: (officerToken, assetId) =>
      json(call(`/attestations?assetId=${encodeURIComponent(assetId)}`, { token: officerToken })),
    payDistribution: (officerToken, distributionId) =>
      json(call(`/distributions/${distributionId}/pay`, { method: "POST", token: officerToken })),
    myHoldings: (token) => json(call("/transfers/holdings", { token })),
    getPortfolio: () => json(call("/portfolio/me")),
    transferTokens: (token, body) => json(call("/transfers", { method: "POST", token, body })),
    requestRedemption: (token, body) => json(call("/redemptions", { method: "POST", token, body })),
    myRedemptions: (token) => json(call("/redemptions/me", { token })),
    listRedemptions: (officerToken) => json(call("/redemptions", { token: officerToken })),
    fulfillRedemption: (officerToken, redemptionId) =>
      json(call(`/redemptions/${redemptionId}/fulfill`, { method: "POST", token: officerToken })),
    rejectRedemption: async (officerToken, redemptionId, reason) => {
      await call(`/redemptions/${redemptionId}/reject`, {
        method: "POST",
        token: officerToken,
        body: { reason },
      });
    },
    holderRegistry: (officerToken, assetId) =>
      json(call(`/reporting/assets/${assetId}/registry`, { token: officerToken })),
    registryCsv: (officerToken, assetId) =>
      csv(call(`/reporting/assets/${assetId}/registry.csv`, { token: officerToken })),
    transfersCsv: (officerToken, assetId) =>
      csv(call(`/reporting/assets/${assetId}/transfers.csv`, { token: officerToken })),
    auditTrail: (officerToken, filter = {}) => {
      const query = new URLSearchParams({
        ...(filter.assetId !== undefined ? { assetId: filter.assetId } : {}),
        ...(filter.limit !== undefined ? { limit: String(filter.limit) } : {}),
      }).toString();
      return json(call(`/reporting/audit${query ? `?${query}` : ""}`, { token: officerToken }));
    },
    listInvestors: (officerToken) => json(call("/investors", { token: officerToken })),
    investorDetail: (officerToken, investorId) =>
      json(call(`/investors/${investorId}/detail`, { token: officerToken })),
    setInvestorStage: async (officerToken, investorId, stage) => {
      await call(`/crm/${investorId}/stage`, {
        method: "PUT",
        token: officerToken,
        body: { stage },
      });
    },
    addInvestorTag: async (officerToken, investorId, tag) => {
      await call(`/crm/${investorId}/tags`, { method: "POST", token: officerToken, body: { tag } });
    },
    removeInvestorTag: async (officerToken, investorId, tag) => {
      await call(`/crm/${investorId}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
        token: officerToken,
      });
    },
    addInvestorNote: (officerToken, investorId, text) =>
      json(
        call(`/crm/${investorId}/notes`, { method: "POST", token: officerToken, body: { text } }),
      ),
    createFollowUp: (officerToken, investorId, body) =>
      json(call(`/crm/${investorId}/follow-ups`, { method: "POST", token: officerToken, body })),
    completeFollowUp: async (officerToken, followUpId) => {
      await call(`/crm/follow-ups/${followUpId}/complete`, {
        method: "POST",
        token: officerToken,
      });
    },
    openFollowUps: (officerToken) => json(call("/crm/follow-ups", { token: officerToken })),
  };
};
