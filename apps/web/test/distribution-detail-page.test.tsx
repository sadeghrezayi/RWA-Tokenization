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

  it("pays_a_declared_distribution", async () => {
    const payDistribution = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(declared, { payDistribution }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    await userEvent.click(screen.getByRole("button", { name: "Pay distribution" }));

    await waitFor(() => {
      expect(payDistribution).toHaveBeenCalledWith("tok", "dist-1");
    });
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
