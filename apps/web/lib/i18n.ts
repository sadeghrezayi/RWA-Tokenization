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
  amountLabel: string;
  distributionPaid: string;
  distributionDeclared: string;
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
    amountLabel: "Amount",
    distributionPaid: "Distribution paid.",
    distributionDeclared: "Distribution declared.",
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
