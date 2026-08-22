import type { RiskBandThresholds } from "../../domain/risk/risk-rating.js";

export interface RiskFactorOption {
  value: string;
  label: string;
  points: number;
}

export interface RiskFactor {
  id: string;
  label: string;
  help: string;
  options: RiskFactorOption[];
}

export interface RiskModel {
  provisional: boolean;
  notice: string;
  thresholds: RiskBandThresholds;
  factors: RiskFactor[];
}

// ---------------------------------------------------------------------------
// PROVISIONAL RISK MODEL — REQUIRES LOCAL LEGAL VALIDATION.
//
// What makes a customer high risk, and what weight each factor carries, is set
// by the operator's own AML policy and by local regulation. Nothing here
// asserts compliance with any regime, and these weights were NOT derived from
// one: they are a generic, obviously-arbitrary starting set, kept as
// CONFIGURATION in one file so a compliance officer can replace them without
// touching a code path. The use case scores whatever this says; the officer's
// form renders whatever this says.
//
// The rating is ADVISORY. Nothing in the platform reads a band and approves,
// refuses or limits anybody — it directs how closely a person looks.
// ---------------------------------------------------------------------------
export const RISK_MODEL: RiskModel = {
  provisional: true,
  notice:
    "Provisional risk model — the factors and weights below are a generic starting set, not a compliance methodology. This model REQUIRES LOCAL LEGAL VALIDATION before production use. The resulting rating is advisory and decides nothing on its own.",
  thresholds: { medium: 3, high: 6 },
  factors: [
    {
      id: "geography",
      label: "Where the applicant is resident",
      help: "Residency drives most AML frameworks' geographic risk. The list of higher-risk jurisdictions is a policy input this codebase does not supply.",
      options: [
        { value: "domestic", label: "Domestic", points: 0 },
        { value: "foreign_low", label: "Foreign — no elevated concern recorded", points: 2 },
        {
          value: "foreign_elevated",
          label: "Foreign — elevated concern recorded by policy",
          points: 4,
        },
      ],
    },
    {
      id: "source_of_funds",
      label: "Declared source of funds",
      help: "As declared by the applicant in onboarding; a declaration is not evidence.",
      options: [
        { value: "salary", label: "Salary or pension", points: 0 },
        { value: "business", label: "Business income", points: 1 },
        { value: "sale_of_assets", label: "Sale of assets", points: 2 },
        { value: "other_unverified", label: "Other or unverified", points: 3 },
      ],
    },
    {
      id: "exposure",
      label: "Political or public exposure",
      help: "Whether the officer's review found the applicant, or a close associate, to be politically exposed. This is the officer's finding, not an automated determination.",
      options: [
        { value: "none_found", label: "None found in review", points: 0 },
        { value: "associate", label: "Close associate of a politically exposed person", points: 3 },
        { value: "pep", label: "Politically exposed person", points: 5 },
      ],
    },
    {
      id: "screening_outcome",
      label: "What screening returned",
      help: "Recorded by the officer from the screening card. While the screening adapter is a labelled mock it checks nothing, so 'clear' here means only that the mock was run.",
      options: [
        { value: "clear", label: "Clear", points: 0 },
        { value: "possible_match", label: "Possible match — needs resolution", points: 4 },
      ],
    },
  ],
};
