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
  officerTitle: string;
  pendingKycTitle: string;
  emptyQueue: string;
  approveButton: string;
  rejectButton: string;
  rejectReasonPrompt: string;
  assetsTitle: string;
  proposeAssetButton: string;
  assetNameLabel: string;
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
  navGroupAssets: string;
  navGroupReporting: string;
  navGroupAccount: string;
  portfolioNav: string;
  offeringsNav: string;
  profileNav: string;
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
    officerTitle: "Compliance Review",
    pendingKycTitle: "Pending KYC applications",
    emptyQueue: "No applications waiting for review.",
    approveButton: "Approve",
    rejectButton: "Reject",
    rejectReasonPrompt: "Rejection reason",
    assetsTitle: "Asset Onboarding",
    proposeAssetButton: "Propose asset",
    assetNameLabel: "Asset name",
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
    navGroupAssets: "Assets",
    navGroupReporting: "Reporting",
    navGroupAccount: "Account",
    portfolioNav: "Portfolio",
    offeringsNav: "Offerings",
    profileNav: "Profile",
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
