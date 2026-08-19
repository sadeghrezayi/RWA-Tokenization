// Language policy (product decision 2026-07-10): the platform is multilingual
// by architecture — locale-scoped routes, per-locale dictionary and text
// direction — but the DEFAULT AND DEMO locale is always English. New locales
// are added here only on an explicit business decision.
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const direction: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
};

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);

export interface Dictionary {
  languageName: string;
  appTitle: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  adminTitle: string;
  adminSubtitle: string;
  logout: string;
  registerTitle: string;
  emailLabel: string;
  passwordLabel: string;
  registerButton: string;
  loginButton: string;
  authFailed: string;
  forgotPassword: string;
  resetRequestTitle: string;
  resetRequestSubtitle: string;
  sendResetLink: string;
  resetRequestSent: string;
  backToSignIn: string;
  resetTitle: string;
  resetSubtitle: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  resetSubmit: string;
  resetSuccess: string;
  resetPasswordMismatch: string;
  resetMissingToken: string;
  emailLabelShort: string;
  emailVerifiedLabel: string;
  emailUnverifiedLabel: string;
  resendVerificationButton: string;
  verificationSent: string;
  verifyEmailTitle: string;
  verifyEmailSubtitle: string;
  verifyEmailButton: string;
  verifyEmailSuccess: string;
  verifyMissingToken: string;
  mfaChallengeTitle: string;
  mfaChallengeSubtitle: string;
  mfaCodeLabel: string;
  mfaCodeHint: string;
  mfaVerifyButton: string;
  securityNav: string;
  securityTitle: string;
  securitySubtitle: string;
  mfaCardTitle: string;
  mfaStatusActiveLabel: string;
  mfaStatusInactiveLabel: string;
  mfaEnableButton: string;
  mfaDisableButton: string;
  mfaScanInstruction: string;
  mfaSetupKeyLabel: string;
  mfaConfirmButton: string;
  mfaRecoveryTitle: string;
  mfaRecoveryHint: string;
  mfaEnabledNotice: string;
  mfaDisabledNotice: string;
  approvalsNav: string;
  publicHomeTitle: string;
  publicHomeLead: string;
  publicBrowseTitle: string;
  publicBrowseCta: string;
  publicSignIn: string;
  publicCatalogEmpty: string;
  publicCatalogFailed: string;
  publicPerToken: string;
  publicClosesOn: string;
  publicTermsTitle: string;
  publicPricePerToken: string;
  publicSupply: string;
  publicMinPerInvestor: string;
  publicMaxPerInvestor: string;
  publicWindow: string;
  publicRiskNotice: string;
  publicHowToInvest: string;
  publicInvestGate: string;
  publicSignInToInvest: string;
  publicOfferingMissing: string;
  publicBackToBrowse: string;
  opsTitle: string;
  opsSubtitle: string;
  opsAllClear: string;
  opsLoadFailed: string;
  opsQueueKyc: string;
  opsQueueApprovals: string;
  opsQueueRedemptions: string;
  opsWaitingSince: string;
  opsOpenQueue: string;
  notificationsTitle: string;
  notificationsEmpty: string;
  notificationsMarkRead: string;
  notificationsMarkAllRead: string;
  notificationsUnreadLabel: string;
  approvalsTitle: string;
  approvalsSubtitle: string;
  noApprovals: string;
  requestedByLabel: string;
  creditSubmittedForApproval: string;
  approvalApproved: string;
  approvalRejected: string;
  officerTitle: string;
  pendingKycTitle: string;
  emptyQueue: string;
  approveButton: string;
  rejectButton: string;
  rejectReasonPrompt: string;
  assetsTitle: string;
  proposeAssetButton: string;
  assetNameLabel: string;
  assetIssuerLabel: string;
  assetIssuerPlatform: string;
  assetBroughtByLabel: string;
  startStructuringButton: string;
  attachDocumentButton: string;
  documentKindLabel: string;
  documentTitleLabel: string;
  custodianLabel: string;
  custodyLocationLabel: string;
  recordCustodyButton: string;
  approveAssetButton: string;
  tokenizeAssetButton: string;
  tokenAddressLabel: string;
  missingKindsLabel: string;
  noAssets: string;
  availableLabel: string;
  heldLabel: string;
  offeringsTitle: string;
  noOfferings: string;
  supplyLabel: string;
  priceLabel: string;
  subscribedLabel: string;
  mySubscriptionLabel: string;
  myAllocationLabel: string;
  subscribeButton: string;
  subscribeTokensLabel: string;
  confirmSubscribe: string;
  subscribeSuccess: string;
  cancelButton: string;
  checkoutLimitsLabel: string;
  checkoutCostLabel: string;
  checkoutRemainingLabel: string;
  checkoutTokensInvalid: string;
  checkoutOutsideLimits: string;
  checkoutShortBy: string;
  checkoutBalanceUnknown: string;
  checkoutAddFunds: string;
  checkoutHoldNotice: string;
  positionTokensLabel: string;
  positionValueLabel: string;
  positionInvestedLabel: string;
  positionIncomeLabel: string;
  positionNone: string;
  positionHistoryTitle: string;
  positionHistorySubtitle: string;
  positionBack: string;
  documentVisibleToHolders: string;
  documentHiddenFromHolders: string;
  showToHoldersButton: string;
  hideFromHoldersButton: string;
  disclosureUpdated: string;
  propertyTitle: string;
  propertySubtitle: string;
  noPropertyRecorded: string;
  addressLabel: string;
  cityLabel: string;
  propertyTypeLabel: string;
  areaLabel: string;
  titleReferenceLabel: string;
  builtInYearLabel: string;
  recordPropertyButton: string;
  propertyRecorded: string;
  rightsTitle: string;
  rightsSubtitle: string;
  rightsNotEstablished: string;
  rightKindLabel: string;
  rightNoteLabel: string;
  conveyRightButton: string;
  withdrawRightButton: string;
  rightConveyed: string;
  rightWithdrawn: string;
  rightsProvisionalNotice: string;
  positionDocumentsTitle: string;
  positionDocumentsSubtitle: string;
  positionNoDocuments: string;
  createOfferingButton: string;
  openOfferingButton: string;
  closeOfferingButton: string;
  creditLedgerButton: string;
  distributionsTitle: string;
  noDistributions: string;
  declareDistributionButton: string;
  payDistributionButton: string;
  reconciliationLabel: string;
  balancedLabel: string;
  kycStatusTitle: string;
  submitKycButton: string;
  refreshButton: string;
  eligible: string;
  notEligible: string;
  rejectionReasonLabel: string;
  overviewTitle: string;
  healthTitle: string;
  valuationLabel: string;
  asOfLabel: string;
  freshLabel: string;
  staleLabel: string;
  attestButton: string;
  publishAttestationTitle: string;
  attestationKindLabel: string;
  valueLabel: string;
  validUntilLabel: string;
  documentCidLabel: string;
  valuationsLabel: string;
  noValuation: string;
  attestationPublished: string;
  totalAssetsLabel: string;
  tokenizedLabel: string;
  totalRaisedLabel: string;
  totalDistributedLabel: string;
  circulatingLabel: string;
  holdersLabel: string;
  raisedLabel: string;
  blockLabel: string;
  pausedTokensLabel: string;
  healthyLabel: string;
  degradedLabel: string;
  detailsLabel: string;
  soldLabel: string;
  remainingLabel: string;
  noOverviewAssets: string;
  holdingsTitle: string;
  noHoldings: string;
  tokensLabel: string;
  transferButton: string;
  redeemButton: string;
  toEmailLabel: string;
  transferSent: string;
  redemptionRequested: string;
  redemptionsTitle: string;
  noRedemptions: string;
  fulfillButton: string;
  redemptionFulfilled: string;
  redemptionRejected: string;
  payoutLabel: string;
  myRedemptionsTitle: string;
  actionsLabel: string;
  statusLabel: string;
  confirmReject: string;
  checklistLabel: string;
  tokenSymbolLabel: string;
  offeringOpened: string;
  offeringClosed: string;
  offeringCreated: string;
  ledgerCredited: string;
  noTokenizedAssets: string;
  assetLabel: string;
  investorIdLabel: string;
  investorLabel: string;
  amountLabel: string;
  distributionPaid: string;
  distributionDeclared: string;
  registryTitle: string;
  auditTitle: string;
  walletLabel: string;
  shareLabel: string;
  holderSinceLabel: string;
  historyLabel: string;
  downloadRegistryButton: string;
  downloadHistoryButton: string;
  matchesChainLabel: string;
  mismatchLabel: string;
  registryTotalLabel: string;
  onChainSupplyLabel: string;
  noRegistryHolders: string;
  noAuditEvents: string;
  eventLabel: string;
  actorLabel: string;
  whenLabel: string;
  allAssetsLabel: string;
  csvDownloaded: string;
  unknownHolderLabel: string;
  investorsTitle: string;
  noInvestors: string;
  detailsButton: string;
  openButton: string;
  navGroupMain: string;
  navGroupInvestors: string;
  navGroupIssuers: string;
  navGroupAssets: string;
  navGroupReporting: string;
  navGroupAccount: string;
  portfolioNav: string;
  offeringsNav: string;
  profileNav: string;
  onboardingNav: string;
  onboardingTitle: string;
  onboardingIntro: string;
  onboardingNotStarted: string;
  onboardingStartButton: string;
  onboardingInProgress: string;
  onboardingUnderReview: string;
  onboardingUnderReviewBody: string;
  onboardingChangesRequested: string;
  onboardingChangesIntro: string;
  onboardingEvidenceHelp: string;
  onboardingNoDocuments: string;
  onboardingUploadLabel: string;
  onboardingRemoveDocument: string;
  onboardingContinueButton: string;
  onboardingSaveButton: string;
  onboardingSubmitButton: string;
  onboardingChoosePlaceholder: string;
  onboardingOpenWizard: string;
  onboardingReviewTitle: string;
  onboardingReviewNotStarted: string;
  onboardingReviewSubmittedAt: string;
  onboardingReviewAlreadyAsked: string;
  onboardingReviewNotAnswered: string;
  onboardingReviewViewButton: string;
  onboardingReviewRequestChanges: string;
  onboardingReviewSendBack: string;
  onboardingReviewReasonHelp: string;
  onboardingReviewNeedsReason: string;
  onboardingReviewOpenFile: string;
  onboardingReviewLoading: string;
  onboardingReviewUndisplayable: string;
  onboardingReviewAccepted: string;
  onboardingReviewDeclined: string;
  portfolioSummaryTitle: string;
  portfolioInvestedLabel: string;
  portfolioIncomeLabel: string;
  portfolioIncomeHint: string;
  portfolioValuedAt: string;
  portfolioValueFresh: string;
  portfolioValueStale: string;
  portfolioStaleExplainer: string;
  portfolioNotValued: string;
  portfolioNotValuedExplainer: string;
  portfolioAllocationTitle: string;
  portfolioNoAllocation: string;
  portfolioIncomeTitle: string;
  portfolioIncomeSubtitle: string;
  portfolioNoIncome: string;
  portfolioPaidAt: string;
  menuLabel: string;
  fundingNav: string;
  fundingTitle: string;
  fundingSubtitle: string;
  fundingAvailableLabel: string;
  fundingAvailableHint: string;
  fundingHeldLabel: string;
  fundingHeldHint: string;
  fundingAmountLabel: string;
  fundingAmountHint: string;
  fundingRequestButton: string;
  fundingInstructionsTitle: string;
  fundingNotCreditedYet: string;
  fundingNotConfigured: string;
  fundingReferenceLabel: string;
  fundingBankLabel: string;
  fundingAccountHolderLabel: string;
  fundingAccountNumberLabel: string;
  fundingHistoryTitle: string;
  fundingNoHistory: string;
  fundingRequestedLabel: string;
  fundingDeclaredLabel: string;
  fundingReceivedLabel: string;
  fundingStatusLabel: string;
  fundingCancelButton: string;
  fundingStatus: Record<"pending" | "confirmed" | "rejected" | "cancelled", string>;
  fundingQueueNav: string;
  fundingQueueTitle: string;
  fundingQueueSubtitle: string;
  fundingQueueEmpty: string;
  fundingQueueConfirmButton: string;
  fundingQueueRejectButton: string;
  fundingQueueConfirmTitle: string;
  fundingQueueConfirmHelp: string;
  fundingQueueReceivedLabel: string;
  fundingQueueReceivedHint: string;
  fundingQueueCreditButton: string;
  fundingQueueRejectTitle: string;
  fundingQueueRejectHelp: string;
  fundingQueueReasonLabel: string;
  fundingQueueSendRejectionButton: string;
  fundingQueueAmountInvalid: string;
  fundingQueueReasonRequired: string;
  fundingQueueParked: string;
  issuersNav: string;
  issuersTitle: string;
  issuersSubtitle: string;
  issuersEmpty: string;
  issuersLegalNameLabel: string;
  issuersRegistrationLabel: string;
  issuersContactLabel: string;
  issuersAppliedLabel: string;
  issuersStateLabel: string;
  issuersStateApplied: string;
  issuersStateInReview: string;
  issuersStateApproved: string;
  issuersStateRejected: string;
  issuersStateSuspended: string;
  issuersCanSubmit: string;
  issuersStartReviewButton: string;
  issuersApproveButton: string;
  issuersRejectButton: string;
  issuersSuspendButton: string;
  issuersReinstateButton: string;
  issuersRejectTitle: string;
  issuersRejectHelp: string;
  issuersSuspendTitle: string;
  issuersSuspendHelp: string;
  issuersReasonLabel: string;
  issuersReasonRequired: string;
  issuersSendRejectionButton: string;
  issuersConfirmSuspensionButton: string;
  issuersDecidedBy: string;
  issuerDetailBack: string;
  issuerTeamTitle: string;
  issuerTeamSubtitle: string;
  issuerTeamEmpty: string;
  issuerTeamMemberLabel: string;
  issuerTeamRoleLabel: string;
  issuerTeamAddedLabel: string;
  issuerRoleAdmin: string;
  issuerRoleContributor: string;
  issuerPortalTitle: string;
  issuerOrganisationNav: string;
  issuerNoMembership: string;
  issuerMayBringAssets: string;
  issuerAssetsTitle: string;
  issuerAssetsSubtitle: string;
  issuerNoAssetsYet: string;
  issuerBringAssetLabel: string;
  issuerBringAssetButton: string;
  issuerAssetBrought: string;
  issuerCannotBringAssetsYet: string;
  issuerInviteEmailLabel: string;
  issuerInviteEmailHint: string;
  issuerInviteButton: string;
  issuerInviteEmailRequired: string;
  issuerRemoveButton: string;
  issuerOrganisationTitle: string;
  signedInAs: string;
  investorPortalTitle: string;
  backToAssets: string;
  backToOfferings: string;
  backToDistributions: string;
  dossierLabel: string;
  custodyLabel: string;
  noDocuments: string;
  documentRefLabel: string;
  noCustody: string;
  noChecklist: string;
  structuringStarted: string;
  documentAttached: string;
  custodyRecorded: string;
  checklistConfirmed: string;
  assetApproved: string;
  assetTokenized: string;
  windowLabel: string;
  minMaxLabel: string;
  minimumRaiseLabel: string;
  allocationsLabel: string;
  requestedLabel: string;
  allocatedLabel: string;
  costLabel: string;
  refundLabel: string;
  payoutsLabel: string;
  openOfferingAction: string;
  closeOfferingAction: string;
  payDistributionAction: string;
  viewAssetLink: string;
  assetProposed: string;
  dossierCompleteLabel: string;
  balanceLabel: string;
  identityAddressLabel: string;
  portfolioLabel: string;
  transfersLabel: string;
  redemptionsLabel: string;
  sentLabel: string;
  receivedLabel: string;
  noActivity: string;
  ledgerSectionLabel: string;
  chainSectionLabel: string;
  stageLabel: string;
  tagsLabel: string;
  investedLabel: string;
  portfolioValueLabel: string;
  addTagLabel: string;
  addTagButton: string;
  relationshipSectionLabel: string;
  salesSectionLabel: string;
  timelineSectionLabel: string;
  followUpsSectionLabel: string;
  subscriptionsLabel: string;
  addNoteLabel: string;
  addNoteButton: string;
  noNotes: string;
  addFollowUpButton: string;
  followUpTextLabel: string;
  followUpDueLabel: string;
  completeButton: string;
  overdueLabel: string;
  noFollowUps: string;
  backToInvestors: string;
  followUpQueueTitle: string;
  noOpenFollowUps: string;
  dueLabel: string;
  freshValueLabel: string;
  staleValueLabel: string;
  investorsSummaryLabel: string;
  stageUpdated: string;
  tagAdded: string;
  noteAdded: string;
  followUpCreated: string;
  followUpCompleted: string;
  stages: Record<"lead" | "contacted" | "onboarding" | "active" | "dormant", string>;
  kycStates: Record<
    "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired",
    string
  >;
}

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    languageName: "English",
    appTitle: "Asset Tokenization Platform",
    dashboardTitle: "Investor Dashboard",
    dashboardSubtitle: "Your KYC status, settlement balance, and available offerings.",
    adminTitle: "Admin Console",
    adminSubtitle: "KYC review, asset onboarding, offerings, and income distributions.",
    logout: "Log out",
    registerTitle: "Investor Access",
    emailLabel: "Email",
    passwordLabel: "Password",
    registerButton: "Register",
    loginButton: "Log in",
    authFailed: "Authentication failed. Please try again.",
    forgotPassword: "Forgot password?",
    resetRequestTitle: "Reset your password",
    resetRequestSubtitle: "Enter your account email and we'll send a reset link.",
    sendResetLink: "Send reset link",
    resetRequestSent:
      "If that email is registered, a password-reset link is on its way. Check your inbox.",
    backToSignIn: "Back to sign in",
    resetTitle: "Choose a new password",
    resetSubtitle: "Enter a new password for your account.",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm password",
    resetSubmit: "Update password",
    resetSuccess: "Your password has been updated. You can now sign in.",
    resetPasswordMismatch: "Those passwords don't match.",
    resetMissingToken:
      "This reset link is missing its token. Request a new one from the sign-in page.",
    emailLabelShort: "Email",
    emailVerifiedLabel: "Verified",
    emailUnverifiedLabel: "Unverified",
    resendVerificationButton: "Resend verification email",
    verificationSent: "Verification email sent. Check your inbox for the link.",
    verifyEmailTitle: "Verify your email",
    verifyEmailSubtitle: "Confirm this is your email address to finish setting up your account.",
    verifyEmailButton: "Verify email",
    verifyEmailSuccess: "Your email is verified. Thanks for confirming.",
    verifyMissingToken:
      "This verification link is missing its token. Request a new one from your profile.",
    mfaChallengeTitle: "Two-factor authentication",
    mfaChallengeSubtitle:
      "Enter the 6-digit code from your authenticator app to finish signing in.",
    mfaCodeLabel: "Authentication code",
    mfaCodeHint: "You can also enter one of your recovery codes.",
    mfaVerifyButton: "Verify",
    securityNav: "Security",
    securityTitle: "Security",
    securitySubtitle: "Protect the operator account with two-factor authentication.",
    mfaCardTitle: "Two-factor authentication (TOTP)",
    mfaStatusActiveLabel: "Enabled",
    mfaStatusInactiveLabel: "Not enabled",
    mfaEnableButton: "Enable two-factor",
    mfaDisableButton: "Disable two-factor",
    mfaScanInstruction:
      "Add this setup key to an authenticator app (Google Authenticator, 1Password, etc.), then enter a generated code to activate.",
    mfaSetupKeyLabel: "Setup key",
    mfaConfirmButton: "Confirm & activate",
    mfaRecoveryTitle: "Save your recovery codes",
    mfaRecoveryHint:
      "Each code works once if you lose your authenticator. They are shown only now — store them somewhere safe.",
    mfaEnabledNotice: "Two-factor authentication is on for this account.",
    mfaDisabledNotice: "Two-factor authentication has been turned off.",
    approvalsNav: "Approvals",
    publicHomeTitle: "Invest in real-world assets",
    publicHomeLead:
      "Ownership of real assets, represented as transferable tokens on a permissioned chain. Browse what is currently open.",
    publicBrowseTitle: "Open offerings",
    publicBrowseCta: "Browse offerings",
    publicSignIn: "Sign in",
    publicCatalogEmpty: "No offerings are open right now.",
    publicCatalogFailed: "Offerings could not be loaded. Please try again shortly.",
    publicPerToken: "per token",
    publicClosesOn: "closes",
    publicTermsTitle: "Offering terms",
    publicPricePerToken: "Price per token",
    publicSupply: "Total supply",
    publicMinPerInvestor: "Minimum per investor",
    publicMaxPerInvestor: "Maximum per investor",
    publicWindow: "Subscription window",
    publicRiskNotice:
      "Capital is at risk. The value of an asset-backed token can fall as well as rise, and tokens may be difficult to sell. Figures shown are the offering's terms and past attested valuations — they are not a forecast. Seek independent advice before investing.",
    publicHowToInvest: "How to invest",
    publicInvestGate: "Subscribing requires an account and completed identity verification.",
    publicSignInToInvest: "Sign in to invest",
    publicOfferingMissing: "This offering is not available.",
    publicBackToBrowse: "Back to offerings",
    opsTitle: "Work queue",
    opsSubtitle: "Everything waiting on a decision, longest wait first.",
    opsAllClear: "Nothing is waiting on you right now.",
    opsLoadFailed: "The work queue could not be loaded.",
    opsQueueKyc: "KYC reviews",
    opsQueueApprovals: "Approvals",
    opsQueueRedemptions: "Redemptions",
    opsWaitingSince: "waiting since",
    opsOpenQueue: "Open",
    notificationsTitle: "Notifications",
    notificationsEmpty: "No notifications yet.",
    notificationsMarkRead: "Mark read",
    notificationsMarkAllRead: "Mark all read",
    notificationsUnreadLabel: "unread",
    approvalsTitle: "Pending approvals",
    approvalsSubtitle:
      "Two-person review for sensitive actions. You can't approve your own request.",
    noApprovals: "Nothing is awaiting approval.",
    requestedByLabel: "Requested by",
    creditSubmittedForApproval:
      "This credit is above the approval threshold — it's been submitted for a second officer to approve.",
    approvalApproved: "Approved and applied.",
    approvalRejected: "Request rejected.",
    officerTitle: "Compliance Review",
    pendingKycTitle: "Pending KYC applications",
    emptyQueue: "No applications waiting for review.",
    approveButton: "Approve",
    rejectButton: "Reject",
    rejectReasonPrompt: "Rejection reason",
    assetsTitle: "Asset Onboarding",
    proposeAssetButton: "Propose asset",
    assetNameLabel: "Asset name",
    assetIssuerLabel: "Issuer",
    assetIssuerPlatform: "The platform",
    assetBroughtByLabel: "Brought by",
    startStructuringButton: "Start structuring",
    attachDocumentButton: "Attach document",
    documentKindLabel: "Document kind",
    documentTitleLabel: "Document title",
    custodianLabel: "Custodian",
    custodyLocationLabel: "Custody location",
    recordCustodyButton: "Record custody",
    approveAssetButton: "Approve asset",
    tokenizeAssetButton: "Tokenize asset",
    tokenAddressLabel: "Token",
    missingKindsLabel: "Missing",
    noAssets: "No assets yet.",
    availableLabel: "Available",
    heldLabel: "Held in escrow",
    offeringsTitle: "Offerings",
    noOfferings: "No offerings yet.",
    supplyLabel: "Supply",
    priceLabel: "Price (Rial)",
    subscribedLabel: "Subscribed",
    mySubscriptionLabel: "My subscription",
    myAllocationLabel: "My allocation",
    subscribeButton: "Subscribe",
    subscribeTokensLabel: "Number of tokens",
    confirmSubscribe: "Confirm subscription",
    subscribeSuccess: "Subscription submitted.",
    cancelButton: "Cancel",
    checkoutLimitsLabel: "Per investor",
    checkoutCostLabel: "Order total",
    checkoutRemainingLabel: "Left after this",
    checkoutTokensInvalid: "Enter the number of tokens as a positive whole number.",
    checkoutOutsideLimits: "Outside this offering's per-investor limits:",
    checkoutShortBy: "Not enough available — short by",
    checkoutBalanceUnknown:
      "Your available balance could not be read, so this order cannot be checked yet.",
    checkoutAddFunds: "Add funds",
    checkoutHoldNotice:
      "Confirming holds this amount in escrow until the offering closes. Unallocated funds are returned.",
    positionTokensLabel: "Tokens held",
    positionValueLabel: "Value of this holding",
    positionInvestedLabel: "Invested in this asset",
    positionIncomeLabel: "Income from this asset",
    positionNone: "You have no position in this asset.",
    positionHistoryTitle: "How this position was built",
    positionHistorySubtitle: "Every offering you subscribed to for this asset.",
    positionBack: "Back to portfolio",
    documentVisibleToHolders: "Visible to holders",
    documentHiddenFromHolders: "Hidden from holders",
    showToHoldersButton: "Show to holders",
    hideFromHoldersButton: "Hide from holders",
    disclosureUpdated: "Disclosure updated.",
    propertyTitle: "Property",
    propertySubtitle: "The building this token is issued against.",
    noPropertyRecorded: "No property recorded for this asset yet.",
    addressLabel: "Address",
    cityLabel: "City",
    propertyTypeLabel: "Property type",
    areaLabel: "Area (m²)",
    titleReferenceLabel: "Title reference",
    builtInYearLabel: "Built in year",
    recordPropertyButton: "Record property",
    propertyRecorded: "Property recorded.",
    rightsTitle: "What this token conveys",
    rightsSubtitle: "Each right, in the wording it was granted in.",
    rightsNotEstablished:
      "The rights this token conveys have not been established yet — which is not the same as conveying nothing.",
    rightKindLabel: "Right",
    rightNoteLabel: "Wording it was granted in",
    conveyRightButton: "Convey right",
    withdrawRightButton: "Withdraw",
    rightConveyed: "Right recorded.",
    rightWithdrawn: "Right withdrawn.",
    rightsProvisionalNotice:
      "This list of rights is provisional and requires local legal validation before anyone relies on it.",
    positionDocumentsTitle: "Documents",
    positionDocumentsSubtitle: "Published by the operator for this asset.",
    positionNoDocuments: "No documents have been published for this asset yet.",
    createOfferingButton: "Create offering",
    openOfferingButton: "Open",
    closeOfferingButton: "Close",
    creditLedgerButton: "Credit ledger",
    distributionsTitle: "Income Distributions",
    noDistributions: "No distributions yet.",
    declareDistributionButton: "Declare distribution",
    payDistributionButton: "Pay",
    reconciliationLabel: "Reconciliation",
    balancedLabel: "balanced",
    kycStatusTitle: "KYC Status",
    submitKycButton: "Submit KYC documents",
    refreshButton: "Refresh",
    eligible: "Eligible to invest",
    notEligible: "Not yet eligible to invest",
    rejectionReasonLabel: "Rejection reason",
    overviewTitle: "Overview",
    healthTitle: "System health",
    valuationLabel: "Valuation",
    asOfLabel: "as of",
    freshLabel: "Fresh",
    staleLabel: "Stale",
    attestButton: "Attest",
    publishAttestationTitle: "Publish attestation",
    attestationKindLabel: "Kind",
    valueLabel: "Value",
    validUntilLabel: "Valid until",
    documentCidLabel: "Document reference (optional IPFS CID)",
    valuationsLabel: "Attestations",
    noValuation: "No valuation yet",
    attestationPublished: "Attestation published.",
    totalAssetsLabel: "Assets",
    tokenizedLabel: "Tokenized",
    totalRaisedLabel: "Total raised",
    totalDistributedLabel: "Total distributed",
    circulatingLabel: "Circulating",
    holdersLabel: "Holders",
    raisedLabel: "Raised",
    blockLabel: "Block",
    pausedTokensLabel: "Paused tokens",
    healthyLabel: "Healthy",
    degradedLabel: "Degraded",
    detailsLabel: "Details",
    soldLabel: "Sold",
    remainingLabel: "Remaining",
    noOverviewAssets: "No assets onboarded yet.",
    holdingsTitle: "My Holdings",
    noHoldings: "You don't hold any tokens yet.",
    tokensLabel: "Tokens",
    transferButton: "Transfer",
    redeemButton: "Redeem",
    toEmailLabel: "Recipient email",
    transferSent: "Transfer completed.",
    redemptionRequested: "Redemption requested — the operator will review it.",
    redemptionsTitle: "Redemption Requests",
    noRedemptions: "No redemption requests.",
    fulfillButton: "Fulfill",
    redemptionFulfilled: "Redemption fulfilled and paid out.",
    redemptionRejected: "Redemption rejected.",
    payoutLabel: "Payout",
    myRedemptionsTitle: "My redemptions",
    actionsLabel: "Actions",
    statusLabel: "Status",
    confirmReject: "Confirm rejection",
    checklistLabel: "Checklist",
    tokenSymbolLabel: "Token symbol",
    offeringOpened: "Offering opened.",
    offeringClosed: "Offering closed.",
    offeringCreated: "Offering created.",
    ledgerCredited: "Ledger credited.",
    noTokenizedAssets: "No tokenized assets yet — tokenize an asset first.",
    assetLabel: "Asset",
    investorIdLabel: "Investor ID",
    investorLabel: "Investor",
    amountLabel: "Amount",
    distributionPaid: "Distribution paid.",
    distributionDeclared: "Distribution declared.",
    registryTitle: "Holder Registry",
    auditTitle: "Audit Log",
    walletLabel: "Wallet",
    shareLabel: "Share",
    holderSinceLabel: "Since",
    historyLabel: "Transfer history",
    downloadRegistryButton: "Download registry CSV",
    downloadHistoryButton: "Download history CSV",
    matchesChainLabel: "Matches chain",
    mismatchLabel: "MISMATCH vs chain",
    registryTotalLabel: "Registry total",
    onChainSupplyLabel: "On-chain supply",
    noRegistryHolders: "No holders yet.",
    noAuditEvents: "No audit events yet.",
    eventLabel: "Event",
    actorLabel: "Actor",
    whenLabel: "When",
    allAssetsLabel: "All assets",
    csvDownloaded: "CSV downloaded.",
    unknownHolderLabel: "Unknown wallet",
    investorsTitle: "Investors",
    noInvestors: "No investors yet.",
    detailsButton: "Details",
    openButton: "Open",
    navGroupMain: "Overview",
    navGroupInvestors: "Investors",
    navGroupIssuers: "Issuers",
    navGroupAssets: "Assets",
    navGroupReporting: "Reporting",
    navGroupAccount: "Account",
    portfolioNav: "Portfolio",
    offeringsNav: "Offerings",
    profileNav: "Profile",
    onboardingNav: "Verification",
    onboardingTitle: "Identity verification",
    onboardingIntro: "We need a few details and one identity document before you can invest.",
    onboardingNotStarted: "You have not started your verification yet.",
    onboardingStartButton: "Start verification",
    onboardingInProgress: "In progress",
    onboardingUnderReview: "Under review",
    onboardingUnderReviewBody:
      "Your application is with our compliance team. You will be notified when it is decided, or if anything needs changing.",
    onboardingChangesRequested: "Changes requested",
    onboardingChangesIntro: "Our reviewer asked you to update the following, then resubmit:",
    onboardingEvidenceHelp:
      "Upload a clear photo or scan of your identity document (JPEG, PNG or PDF, up to 10 MB).",
    onboardingNoDocuments: "No document uploaded yet.",
    onboardingUploadLabel: "Choose a document",
    onboardingRemoveDocument: "Remove",
    onboardingContinueButton: "Continue",
    onboardingSaveButton: "Save and continue",
    onboardingSubmitButton: "Submit for review",
    onboardingChoosePlaceholder: "Choose…",
    onboardingOpenWizard: "Open verification",
    onboardingReviewTitle: "Identity verification file",
    onboardingReviewNotStarted: "This applicant has not started their verification.",
    onboardingReviewSubmittedAt: "Submitted",
    onboardingReviewAlreadyAsked: "You already asked the applicant to update:",
    onboardingReviewNotAnswered: "— not answered —",
    onboardingReviewViewButton: "View",
    onboardingReviewRequestChanges: "Request changes",
    onboardingReviewSendBack: "Send back to applicant",
    onboardingReviewReasonHelp:
      "Write a reason for each step the applicant must redo. Steps you leave blank stay accepted.",
    onboardingReviewNeedsReason: "Name at least one step and say what needs changing.",
    onboardingReviewOpenFile: "Review",
    onboardingReviewLoading: "Loading…",
    onboardingReviewUndisplayable:
      "This document could not be displayed — it may be corrupt or in an unexpected format.",
    onboardingReviewAccepted: "Accepted",
    onboardingReviewDeclined: "Not accepted",
    portfolioSummaryTitle: "Your position",
    portfolioInvestedLabel: "Invested",
    portfolioIncomeLabel: "Income received",
    portfolioIncomeHint: "Distributions actually paid to you",
    portfolioValuedAt: "Valued",
    portfolioValueFresh: "Valuation current",
    portfolioValueStale: "Out of date",
    portfolioStaleExplainer:
      "This value comes from a valuation that is now out of date. It is shown with the date it was made, not as today's price.",
    portfolioNotValued: "Not yet valued",
    portfolioNotValuedExplainer:
      "No valuation has been published for your holdings yet, so no value is shown. Your token balance is unaffected.",
    portfolioAllocationTitle: "How your portfolio is split",
    portfolioNoAllocation: "There is nothing valued to break down yet.",
    portfolioIncomeTitle: "Income",
    portfolioIncomeSubtitle: "Distributions that have been paid to you.",
    portfolioNoIncome: "No income has been paid to you yet.",
    portfolioPaidAt: "Paid",
    menuLabel: "Menu",
    fundingNav: "Funds",
    fundingTitle: "Your funds",
    fundingSubtitle: "Add money by bank transfer before you invest.",
    fundingAvailableLabel: "Available",
    fundingAvailableHint: "Ready to invest",
    fundingHeldLabel: "Committed",
    fundingHeldHint: "Held against open subscriptions",
    fundingAmountLabel: "Amount to transfer",
    fundingAmountHint: "In Rial, whole numbers only.",
    fundingRequestButton: "Get payment details",
    fundingInstructionsTitle: "Make the transfer",
    fundingNotCreditedYet:
      "Nothing has been credited yet. Transfer this amount quoting the reference below; your balance updates once our team matches it to a bank credit, which can take a working day.",
    fundingNotConfigured:
      "This platform cannot accept transfers yet — no bank account has been configured. Please contact us before sending any money.",
    fundingReferenceLabel: "Reference",
    fundingBankLabel: "Bank",
    fundingAccountHolderLabel: "Account holder",
    fundingAccountNumberLabel: "Account number",
    fundingHistoryTitle: "Funding history",
    fundingNoHistory: "No funding requests yet.",
    fundingRequestedLabel: "Requested",
    fundingDeclaredLabel: "Declared",
    fundingReceivedLabel: "Received",
    fundingStatusLabel: "Status",
    fundingCancelButton: "Cancel",
    fundingStatus: {
      pending: "Awaiting your transfer",
      confirmed: "Confirmed",
      rejected: "Rejected",
      cancelled: "Cancelled",
    },
    fundingQueueNav: "Deposits",
    fundingQueueTitle: "Deposits awaiting confirmation",
    fundingQueueSubtitle: "Match each reference against the bank statement before confirming.",
    fundingQueueEmpty: "Nothing waiting — every declared transfer has been settled.",
    fundingQueueConfirmButton: "Confirm",
    fundingQueueRejectButton: "Reject",
    fundingQueueConfirmTitle: "Confirm a deposit",
    fundingQueueConfirmHelp: "Confirming credits the investor's balance.",
    fundingQueueReceivedLabel: "Amount received",
    fundingQueueReceivedHint:
      "What actually arrived on the statement — correct it if it differs from what was declared.",
    fundingQueueCreditButton: "Credit the investor",
    fundingQueueRejectTitle: "Reject a deposit",
    fundingQueueRejectHelp: "The investor sees this reason.",
    fundingQueueReasonLabel: "Reason",
    fundingQueueSendRejectionButton: "Send rejection",
    fundingQueueAmountInvalid: "Enter the amount received as a positive whole number.",
    fundingQueueReasonRequired: "Say why this deposit is being rejected.",
    fundingQueueParked:
      "Recorded. This credit is above the approval threshold, so it needs a second approval before the investor's balance changes.",
    issuersNav: "Issuers",
    issuersTitle: "Issuer applications",
    issuersSubtitle:
      "Organisations applying to bring assets to the platform. An applicant can do nothing until it is approved, and every refusal carries a reason.",
    issuersEmpty: "No issuer applications yet.",
    issuersLegalNameLabel: "Legal name",
    issuersRegistrationLabel: "Registration number",
    issuersContactLabel: "Contact",
    issuersAppliedLabel: "Applied",
    issuersStateLabel: "State",
    issuersStateApplied: "Applied",
    issuersStateInReview: "In review",
    issuersStateApproved: "Approved",
    issuersStateRejected: "Rejected",
    issuersStateSuspended: "Suspended",
    issuersCanSubmit: "May bring assets",
    issuersStartReviewButton: "Start review",
    issuersApproveButton: "Approve",
    issuersRejectButton: "Reject",
    issuersSuspendButton: "Suspend",
    issuersReinstateButton: "Reinstate",
    issuersRejectTitle: "Reject this application",
    issuersRejectHelp:
      "The applicant is told why. Rejection is final — re-applying starts a new application.",
    issuersSuspendTitle: "Suspend this issuer",
    issuersSuspendHelp:
      "Suspension stops new assets immediately. It can be reversed by reinstating the organisation.",
    issuersReasonLabel: "Reason",
    issuersReasonRequired: "Say why this application is being refused.",
    issuersSendRejectionButton: "Send rejection",
    issuersConfirmSuspensionButton: "Confirm suspension",
    issuersDecidedBy: "Decided by",
    issuerDetailBack: "← Back to issuers",
    issuerOrganisationTitle: "Organisation",
    issuerTeamTitle: "People acting for this issuer",
    issuerTeamSubtitle:
      "Everyone here has completed individual verification — the organisation's own approval does not cover its people. Invitations are by email.",
    issuerTeamEmpty: "Nobody acts for this organisation yet.",
    issuerTeamMemberLabel: "Person",
    issuerTeamRoleLabel: "Role",
    issuerTeamAddedLabel: "Added",
    issuerRoleAdmin: "Administrator",
    issuerRoleContributor: "Contributor",
    issuerPortalTitle: "Issuer Portal",
    issuerOrganisationNav: "My organisation",
    issuerNoMembership:
      "You do not act for an issuer organisation yet. Once an organisation adds you to its team, it appears here.",
    issuerMayBringAssets: "May bring assets",
    issuerAssetsTitle: "Assets you brought",
    issuerAssetsSubtitle: "Where each one stands in the platform's review.",
    issuerNoAssetsYet:
      "You have not brought any assets yet. Once the platform records one for your organisation, it appears here.",
    issuerBringAssetLabel: "Asset name",
    issuerBringAssetButton: "Bring this asset",
    issuerAssetBrought: "Asset brought. The platform will review it.",
    issuerCannotBringAssetsYet: "This organisation cannot bring assets yet",
    issuerInviteEmailLabel: "Email",
    issuerInviteEmailHint: "They must already hold a verified platform account.",
    issuerInviteButton: "Invite",
    issuerInviteEmailRequired: "Enter the email address of the person to invite.",
    issuerRemoveButton: "Remove",
    signedInAs: "Signed in as",
    investorPortalTitle: "Investor Portal",
    backToAssets: "← Back to assets",
    backToOfferings: "← Back to offerings",
    backToDistributions: "← Back to distributions",
    dossierLabel: "Legal dossier",
    custodyLabel: "Custody",
    noDocuments: "No documents attached yet.",
    documentRefLabel: "Reference (IPFS)",
    noCustody: "No custody arrangement recorded.",
    noChecklist: "No checklist items.",
    structuringStarted: "Structuring started.",
    documentAttached: "Document attached.",
    custodyRecorded: "Custody recorded.",
    checklistConfirmed: "Checklist item confirmed.",
    assetApproved: "Asset approved.",
    assetTokenized: "Asset tokenized.",
    windowLabel: "Window",
    minMaxLabel: "Per investor",
    minimumRaiseLabel: "Minimum raise",
    allocationsLabel: "Allocations",
    requestedLabel: "Requested",
    allocatedLabel: "Allocated",
    costLabel: "Cost",
    refundLabel: "Refund",
    payoutsLabel: "Payouts",
    openOfferingAction: "Open offering",
    closeOfferingAction: "Close offering",
    payDistributionAction: "Pay distribution",
    viewAssetLink: "View asset",
    assetProposed: "Asset proposed.",
    dossierCompleteLabel: "Complete",
    balanceLabel: "Balance",
    identityAddressLabel: "On-chain identity",
    portfolioLabel: "Portfolio",
    transfersLabel: "Transfers",
    redemptionsLabel: "Redemptions",
    sentLabel: "Sent",
    receivedLabel: "Received",
    noActivity: "No activity yet.",
    ledgerSectionLabel: "Settlement ledger",
    chainSectionLabel: "On-chain",
    stageLabel: "Stage",
    tagsLabel: "Tags",
    investedLabel: "Invested",
    portfolioValueLabel: "Portfolio value",
    addTagLabel: "New tag",
    addTagButton: "Add tag",
    relationshipSectionLabel: "Relationship",
    salesSectionLabel: "Sales",
    timelineSectionLabel: "Activity timeline",
    followUpsSectionLabel: "Follow-ups",
    subscriptionsLabel: "Subscription history",
    addNoteLabel: "Add a note",
    addNoteButton: "Save note",
    noNotes: "No notes yet.",
    addFollowUpButton: "Add follow-up",
    followUpTextLabel: "Follow-up",
    followUpDueLabel: "Due date",
    completeButton: "Complete",
    overdueLabel: "Overdue",
    noFollowUps: "No follow-ups.",
    backToInvestors: "← Back to investors",
    followUpQueueTitle: "Open Follow-ups",
    noOpenFollowUps: "No open follow-ups.",
    dueLabel: "Due",
    freshValueLabel: "Fresh",
    staleValueLabel: "Stale valuation",
    investorsSummaryLabel: "Total across investors",
    stageUpdated: "Relationship stage updated.",
    tagAdded: "Tag updated.",
    noteAdded: "Note saved.",
    followUpCreated: "Follow-up added.",
    followUpCompleted: "Follow-up completed.",
    stages: {
      lead: "Lead",
      contacted: "Contacted",
      onboarding: "Onboarding",
      active: "Active",
      dormant: "Dormant",
    },
    kycStates: {
      draft: "Draft",
      submitted: "Submitted",
      in_review: "In review",
      approved: "Approved",
      rejected: "Rejected",
      expired: "Expired",
    },
  },
};
