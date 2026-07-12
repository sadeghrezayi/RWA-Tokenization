import { describe, expect, it } from "vitest";
import {
  assetStatus,
  distributionStatus,
  kycStatus,
  offeringStatus,
} from "../components/ui/status";

describe("status → badge mapping (human labels, not raw enums)", () => {
  it("maps_kyc_states_to_tone_and_label", () => {
    expect(kycStatus("approved")).toEqual({ tone: "success", label: "Approved" });
    expect(kycStatus("in_review")).toEqual({ tone: "info", label: "In review" });
    expect(kycStatus("rejected")).toEqual({ tone: "danger", label: "Rejected" });
    expect(kycStatus("draft")).toEqual({ tone: "neutral", label: "Draft" });
  });

  it("maps_asset_states_with_readable_labels", () => {
    expect(assetStatus("in_structuring").label).toBe("In structuring");
    expect(assetStatus("tokenized")).toEqual({ tone: "success", label: "Tokenized" });
    expect(assetStatus("proposed").tone).toBe("neutral");
  });

  it("maps_offering_states_never_showing_raw_enum_text", () => {
    expect(offeringStatus("closed_success")).toEqual({ tone: "success", label: "Closed — funded" });
    expect(offeringStatus("closed_failed")).toEqual({ tone: "danger", label: "Closed — refunded" });
    expect(offeringStatus("open")).toEqual({ tone: "info", label: "Open" });
    expect(offeringStatus("draft").label).toBe("Draft");
  });

  it("maps_distribution_states", () => {
    expect(distributionStatus("declared").tone).toBe("warning");
    expect(distributionStatus("paid")).toEqual({ tone: "success", label: "Paid" });
  });
});
