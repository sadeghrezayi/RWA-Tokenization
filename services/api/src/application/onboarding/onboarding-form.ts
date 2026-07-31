import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";

export type FieldType = "text" | "date" | "select" | "checkbox";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  // Permitted values for a "select"; the only accepted answers for that field.
  options?: string[];
  maxLength?: number;
  help?: string;
}

export interface OnboardingForm {
  provisional: boolean;
  notice: string;
  steps: Record<OnboardingStep, FormField[]>;
}

const MAX_TEXT = 200;

// ---------------------------------------------------------------------------
// PROVISIONAL FIELD SET — REQUIRES LOCAL LEGAL VALIDATION.
//
// What a KYC file must contain is jurisdiction- and policy-specific. Nothing
// here asserts compliance with any regime: this is a generic starting set,
// deliberately kept as CONFIGURATION in one file so it can be replaced without
// touching any code path. The API validates answers against whatever this says;
// the web wizard renders whatever this says. Changing the set is a one-file
// change with no client release.
//
// Everything collected here is personal data and is stored ENCRYPTED AT REST
// and erasable, the same as uploaded documents (2.3b).
// ---------------------------------------------------------------------------
export const ONBOARDING_FORM: OnboardingForm = {
  provisional: true,
  notice:
    "Provisional field set — the data an applicant must provide is jurisdiction-specific and REQUIRES LOCAL LEGAL VALIDATION before production use.",
  steps: {
    profile: [
      {
        name: "fullName",
        label: "Full legal name",
        type: "text",
        required: true,
        maxLength: MAX_TEXT,
      },
      {
        name: "nationalId",
        label: "National ID number",
        type: "text",
        required: true,
        maxLength: 50,
      },
      { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
      {
        name: "addressLine",
        label: "Residential address",
        type: "text",
        required: true,
        maxLength: MAX_TEXT,
      },
      { name: "city", label: "City", type: "text", required: true, maxLength: MAX_TEXT },
      { name: "postalCode", label: "Postal code", type: "text", required: false, maxLength: 20 },
    ],
    // Documents, not a form — the evidence store holds this step's content.
    identity_evidence: [],
    bank_account: [
      {
        name: "accountHolder",
        label: "Account holder name",
        type: "text",
        required: true,
        maxLength: MAX_TEXT,
        help: "Must match the name on your identity document.",
      },
      { name: "bankName", label: "Bank", type: "text", required: true, maxLength: MAX_TEXT },
      { name: "iban", label: "Account number / IBAN", type: "text", required: true, maxLength: 50 },
    ],
    suitability: [
      {
        name: "investmentExperience",
        label: "Investment experience",
        type: "select",
        required: true,
        options: ["none", "some", "extensive"],
      },
      {
        name: "riskTolerance",
        label: "Risk tolerance",
        type: "select",
        required: true,
        options: ["low", "medium", "high"],
      },
      {
        name: "sourceOfFunds",
        label: "Source of funds",
        type: "select",
        required: true,
        options: ["salary", "business", "inheritance", "investments", "other"],
      },
    ],
    agreements: [
      {
        name: "termsAccepted",
        label: "I accept the platform terms of service",
        type: "checkbox",
        required: true,
      },
      {
        name: "riskDisclosureAccepted",
        label: "I have read and understood the risk disclosure",
        type: "checkbox",
        required: true,
      },
    ],
  },
};

export const fieldsFor = (step: OnboardingStep): FormField[] => ONBOARDING_FORM.steps[step];
