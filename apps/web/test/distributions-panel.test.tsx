import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistributionsPanel } from "../components/distributions-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto, DistributionViewDto } from "../lib/api";

const distribution = (overrides: Partial<DistributionViewDto>): DistributionViewDto => ({
  id: "dist-1",
  assetId: "asset-1",
  assetName: "Pilot Real Estate SPV",
  tokenAddress: "0xToken1",
  totalAmountRial: "100000",
  state: "declared",
  payouts: [
    { investorId: "a", email: "a@demo.com", tokens: "67", amountRial: "67000" },
    { investorId: "b", email: "b@demo.com", tokens: "33", amountRial: "33000" },
  ],
  reconciliation: { declared: "100000", allocated: "100000", balanced: true },
  ...overrides,
});

const tokenizedAsset: AssetViewDto = {
  id: "asset-1",
  name: "Pilot Real Estate SPV",
  type: "asset_backed",
  state: "tokenized",
  tokenAddress: "0xToken1",
  checklist: { confirmed: [], unconfirmed: [] },
  dossier: { complete: true, missingKinds: [], documents: [] },
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listDistributions: vi.fn().mockResolvedValue([]),
    listAssets: vi.fn().mockResolvedValue([tokenizedAsset]),
    declareDistribution: vi.fn().mockResolvedValue({ distributionId: "dist-1" }),
    payDistribution: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

describe("DistributionsPanel", () => {
  it("declares_a_distribution_via_the_modal_and_refreshes", async () => {
    const declareDistribution = vi.fn().mockResolvedValue({ distributionId: "dist-1" });
    const listDistributions = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([distribution({})]);
    render(
      <DistributionsPanel
        locale="en"
        api={apiWith({ declareDistribution, listDistributions })}
        token="tok"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Declare distribution" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText(/Amount/), "100000");
    await userEvent.click(dialog.getByRole("button", { name: "Declare distribution" }));

    await waitFor(() => {
      expect(declareDistribution).toHaveBeenCalledWith("tok", "asset-1", "100000");
    });
  });

  it("shows_reconciliation_and_pays_a_declared_distribution", async () => {
    const payDistribution = vi.fn().mockResolvedValue(undefined);
    const api = apiWith({
      listDistributions: vi.fn().mockResolvedValue([distribution({})]),
      payDistribution,
    });
    render(<DistributionsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText(/balanced/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pay" }));

    await waitFor(() => {
      expect(payDistribution).toHaveBeenCalledWith("tok", "dist-1");
    });
  });

  it("hides_pay_for_an_already_paid_distribution", async () => {
    const api = apiWith({
      listDistributions: vi.fn().mockResolvedValue([distribution({ state: "paid" })]),
    });
    render(<DistributionsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText("Paid")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
  });

  it("shows_the_api_error_when_paying_fails", async () => {
    const api = apiWith({
      listDistributions: vi.fn().mockResolvedValue([distribution({})]),
      payDistribution: vi.fn().mockRejectedValue(new ApiError(409, "already paid")),
    });
    render(<DistributionsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Pay" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already paid");
  });
});
