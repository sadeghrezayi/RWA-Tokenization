import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistributionDetailPage } from "../components/distribution-detail-page";
import { ApiError } from "../lib/api";
import type { ApiClient, DistributionViewDto } from "../lib/api";

const declared: DistributionViewDto = {
  id: "dist-1",
  assetId: "asset-1",
  assetName: "Vanak Tower SPV",
  tokenAddress: "0xTok1",
  totalAmountRial: "500000",
  state: "declared",
  payouts: [
    { investorId: "sara", email: "sara@demo.com", tokens: "35", amountRial: "175000" },
    { investorId: "bob", email: "bob@demo.com", tokens: "55", amountRial: "275000" },
  ],
  reconciliation: { declared: "500000", allocated: "450000", balanced: false },
};

const apiWith = (dist: DistributionViewDto, overrides: Partial<ApiClient> = {}): ApiClient =>
  ({
    getDistribution: vi.fn().mockResolvedValue(dist),
    payDistribution: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

const renderPage = (api: ApiClient) =>
  render(
    <DistributionDetailPage
      locale="en"
      api={api}
      token="tok"
      distributionId="dist-1"
      onBack={vi.fn()}
    />,
  );

describe("DistributionDetailPage", () => {
  it("shows_the_amount_status_reconciliation_and_payouts", async () => {
    const getDistribution = vi.fn().mockResolvedValue(declared);
    renderPage(apiWith(declared, { getDistribution }));

    expect(await screen.findByRole("heading", { name: /Vanak Tower SPV/ })).toBeInTheDocument();
    expect(getDistribution).toHaveBeenCalledWith("tok", "dist-1");
    expect(screen.getByText("Declared")).toBeInTheDocument();
    expect(screen.getByText("175,000 ﷼")).toBeInTheDocument(); // sara payout
    expect(screen.getByText("275,000 ﷼")).toBeInTheDocument(); // bob payout
    // P2: payouts name the holder (email), not a raw id.
    expect(screen.getByText("sara@demo.com")).toBeInTheDocument();
    expect(screen.getByText("bob@demo.com")).toBeInTheDocument();
  });

  // 4.1: paying takes two people now. The officer who asks has NOT paid
  // anything, and telling them they have would be the screen lying about money.
  it("says the payout is waiting for a second officer, not that it is paid", async () => {
    const payDistribution = vi.fn().mockResolvedValue({
      status: "pending_approval",
      approvalId: "appr-1",
    });
    renderPage(apiWith(declared, { payDistribution }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    await userEvent.click(screen.getByRole("button", { name: /pay distribution/i }));

    await waitFor(() => {
      expect(payDistribution).toHaveBeenCalledWith("tok", "dist-1");
    });
    expect(await screen.findByTestId("payout-requested")).toBeTruthy();
    expect(screen.getByTestId("payout-requested").textContent.toLowerCase()).toContain("approval");
    // NOT asserted here: the toast's wording. `useToast` returns a deliberate
    // no-op outside its provider, so no toast renders in a component test and
    // an assertion about its text could never fail — which is worse than no
    // assertion, because it reads like cover. The visible line above is the
    // testable surface; the toast string is checked by reading it.
    expect(screen.queryByText(/distribution paid/i)).toBeNull();
  });

  it("tells the officer up front that a payout needs two people", async () => {
    renderPage(apiWith(declared));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    // Before clicking: the button's own label or its hint must say so, or the
    // officer learns the rule only by being surprised by it.
    const hint = screen.getByTestId("payout-needs-two");
    expect(hint.textContent.toLowerCase()).toMatch(/second|approval|two/);
  });

  it("hides_the_pay_action_once_paid", async () => {
    renderPage(apiWith({ ...declared, state: "paid" }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay distribution" })).not.toBeInTheDocument();
  });

  it("surfaces_a_load_error", async () => {
    renderPage(
      apiWith(declared, {
        getDistribution: vi.fn().mockRejectedValue(new ApiError(404, "no distribution")),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no distribution");
  });
});
