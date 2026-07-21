import type { BadgeTone } from "./badge";

export interface StatusBadge {
  tone: BadgeTone;
  label: string;
}

// Domain state → badge tone + human label. Keeps raw enums (closed_success,
// in_structuring) out of the UI entirely.
export const kycStatus = (state: string): StatusBadge => {
  switch (state) {
    case "approved":
      return { tone: "success", label: "Approved" };
    case "in_review":
      return { tone: "info", label: "In review" };
    case "submitted":
      return { tone: "info", label: "Submitted" };
    case "rejected":
      return { tone: "danger", label: "Rejected" };
    case "expired":
      return { tone: "warning", label: "Expired" };
    default:
      return { tone: "neutral", label: "Draft" };
  }
};

export const assetStatus = (state: string): StatusBadge => {
  switch (state) {
    case "tokenized":
      return { tone: "success", label: "Tokenized" };
    case "approved":
      return { tone: "info", label: "Approved" };
    case "in_structuring":
      return { tone: "warning", label: "In structuring" };
    case "suspended":
      return { tone: "danger", label: "Suspended" };
    case "retired":
      return { tone: "neutral", label: "Retired" };
    default:
      return { tone: "neutral", label: "Proposed" };
  }
};

export const offeringStatus = (state: string): StatusBadge => {
  switch (state) {
    case "open":
      return { tone: "info", label: "Open" };
    case "closed_success":
      return { tone: "success", label: "Closed — funded" };
    case "closed_failed":
      return { tone: "danger", label: "Closed — refunded" };
    default:
      return { tone: "neutral", label: "Draft" };
  }
};

// CRM relationship stage → badge tone (user-approved scope 2026-07-20).
export const stageStatus = (stage: string): StatusBadge => {
  switch (stage) {
    case "active":
      return { tone: "success", label: "Active" };
    case "onboarding":
      return { tone: "info", label: "Onboarding" };
    case "contacted":
      return { tone: "info", label: "Contacted" };
    case "dormant":
      return { tone: "warning", label: "Dormant" };
    default:
      return { tone: "neutral", label: "Lead" };
  }
};

export const distributionStatus = (state: string): StatusBadge => {
  switch (state) {
    case "paid":
      return { tone: "success", label: "Paid" };
    default:
      return { tone: "warning", label: "Declared" };
  }
};
