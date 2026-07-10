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
  kycStatusTitle: string;
  submitKycButton: string;
  refreshButton: string;
  eligible: string;
  notEligible: string;
  rejectionReasonLabel: string;
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
    kycStatusTitle: "KYC Status",
    submitKycButton: "Submit KYC documents",
    refreshButton: "Refresh",
    eligible: "Eligible to invest",
    notEligible: "Not yet eligible to invest",
    rejectionReasonLabel: "Rejection reason",
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
