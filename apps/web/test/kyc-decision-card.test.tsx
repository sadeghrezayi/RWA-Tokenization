import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KycDecisionCard } from "../components/admin/kyc-decision-card";
import type { ApiClient } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const renderCard = (kycState: string, overrides: Partial<ApiClient> = {}, onDecided = vi.fn()) =>
  render(
    <KycDecisionCard
      locale="en"
      investorId="inv-1"
      token="tok"
      kycState={kycState as "submitted"}
      api={stubApi({
        investorScreenings: vi.fn().mockResolvedValue([]),
        investorRiskAssessments: vi.fn().mockResolvedValue([]),
        ...overrides,
      })}
      onDecided={onDecided}
    />,
  );

// 4.3 investor review workspace. The decision belongs where the evidence is:
// before this, an officer approved from a queue row showing an email and a
// badge, while the identity file, screening and risk rating lived on another
// screen entirely.
describe("KycDecisionCard", () => {
  it("offers ONLY start-review on a submitted application", async () => {
    renderCard("submitted");

    expect(await screen.findByTestId("kyc-start-review")).toBeTruthy();
    // Offering an action the server would answer with a 409 is a fake button.
    expect(screen.queryByTestId("kyc-approve")).toBeNull();
    expect(screen.queryByTestId("kyc-reject")).toBeNull();
  });

  it("offers approve and reject once the review has started", async () => {
    renderCard("in_review");

    expect(await screen.findByTestId("kyc-approve")).toBeTruthy();
    expect(screen.getByTestId("kyc-reject")).toBeTruthy();
    expect(screen.queryByTestId("kyc-start-review")).toBeNull();
  });

  it("offers nothing on a decided application, and says why", async () => {
    renderCard("approved");

    expect(await screen.findByTestId("kyc-no-actions")).toBeTruthy();
    expect(screen.queryByTestId("kyc-approve")).toBeNull();
    expect(screen.queryByTestId("kyc-start-review")).toBeNull();
  });

  it("offers nothing on a draft, because the applicant has not submitted", async () => {
    renderCard("draft");

    expect(await screen.findByTestId("kyc-no-actions")).toBeTruthy();
  });

  it("REFUSES a rejection with no reason, without calling the server", async () => {
    const reject = vi.fn();
    renderCard("in_review", { reject });

    fireEvent.click(await screen.findByTestId("kyc-reject"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(reject).not.toHaveBeenCalled();
  });

  it("sends a rejection with its reason and tells the page to reload", async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    renderCard("in_review", { reject }, onDecided);

    fireEvent.change(await screen.findByTestId("kyc-reject-reason"), {
      target: { value: "the address does not match the utility bill" },
    });
    fireEvent.click(screen.getByTestId("kyc-reject"));

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith(
        "tok",
        "inv-1",
        "the address does not match the utility bill",
      );
    });
    expect(onDecided).toHaveBeenCalled();
  });

  it("WARNS when approving someone nobody screened or rated — without blocking it", async () => {
    // The compliance point of 4.2: an officer about to approve a person who
    // was never screened should be told so at the moment of deciding. It is a
    // warning, not a gate — whether a lapse should BLOCK approval is a policy
    // decision nobody has made.
    renderCard("in_review");

    const warning = await screen.findByTestId("kyc-evidence-gaps");
    expect(warning.textContent).toMatch(/screen/i);
    expect(warning.textContent).toMatch(/rat(ed|ing)/i);
    // Still offered: the warning informs, it does not forbid.
    expect(screen.getByTestId("kyc-approve")).toBeTruthy();
  });

  it("says nothing about gaps once the applicant has been screened and rated", async () => {
    renderCard("in_review", {
      investorScreenings: vi.fn().mockResolvedValue([
        {
          outcome: "clear",
          provider: "mock",
          simulated: true,
          checkedAt: "2026-08-22T10:00:00.000Z",
          disclaimer: "SIMULATED",
        },
      ]),
      investorRiskAssessments: vi.fn().mockResolvedValue([
        {
          score: 1,
          band: "low",
          answers: [],
          assessedBy: "officer-1",
          assessedAt: "2026-08-22T10:00:00.000Z",
          advisory: "Advisory only",
        },
      ]),
    });

    await screen.findByTestId("kyc-approve");
    await waitFor(() => {
      expect(screen.queryByTestId("kyc-evidence-gaps")).toBeNull();
    });
  });
});
