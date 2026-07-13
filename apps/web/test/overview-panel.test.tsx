import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverviewPanel } from "../components/overview-panel";
import type {
  ApiClient,
  AssetOverviewDto,
  PortfolioOverviewDto,
  SystemHealthDto,
} from "../lib/api";

const asset = (overrides: Partial<AssetOverviewDto>): AssetOverviewDto => ({
  id: "asset-1",
  name: "Vanak Tower SPV",
  state: "tokenized",
  tokenAddress: "0xTok1",
  circulatingSupply: "67",
  holderCount: 3,
  totalRaisedRial: "67000",
  totalDistributedRial: "50000",
  offerings: [
    { id: "off-1", state: "closed_success", supply: "100", subscribed: "67", priceRial: "1000" },
  ],
  distributions: [{ id: "dist-1", state: "paid", totalAmountRial: "50000" }],
  ...overrides,
});

const portfolio = (assets: AssetOverviewDto[]): PortfolioOverviewDto => ({
  assets,
  summary: {
    assetCount: assets.length,
    tokenizedCount: assets.filter((a) => a.state === "tokenized").length,
    totalRaisedRial: "67000",
    totalDistributedRial: "50000",
  },
});

const health: SystemHealthDto = {
  overall: "healthy",
  services: { api: "up", postgres: "up", ipfs: "up", chain: "up" },
  chainBlockNumber: 564,
  pausedTokens: 1,
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    assetOverview: vi.fn().mockResolvedValue(portfolio([asset({})])),
    systemHealth: vi.fn().mockResolvedValue(health),
    ...overrides,
  }) as ApiClient;

describe("OverviewPanel", () => {
  it("shows_the_portfolio_summary_with_formatted_money", async () => {
    render(<OverviewPanel locale="en" api={apiWith({})} token="tok" />);

    // Raised appears in the summary stat and the asset row (same single asset).
    expect((await screen.findAllByText("67,000 ﷼")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("50,000 ﷼").length).toBeGreaterThan(0);
  });

  it("shows_the_service_health_strip", async () => {
    render(<OverviewPanel locale="en" api={apiWith({})} token="tok" />);

    expect(await screen.findByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText(/564/)).toBeInTheDocument(); // block number
  });

  it("lists_assets_by_name_with_supply_and_holders", async () => {
    render(<OverviewPanel locale="en" api={apiWith({})} token="tok" />);

    const row = within(await screen.findByTestId("overview-asset-asset-1"));
    expect(row.getByText("Vanak Tower SPV")).toBeInTheDocument();
    expect(row.getByText("Tokenized")).toBeInTheDocument();
    expect(row.getByText("67")).toBeInTheDocument(); // circulating supply
    expect(row.getByText("3")).toBeInTheDocument(); // holders
  });

  it("expands_an_asset_to_show_offering_and_distribution_history", async () => {
    render(<OverviewPanel locale="en" api={apiWith({})} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Details" }));

    // 67 sold of 100 → 33 remaining shown in the expanded detail.
    expect(await screen.findByText(/33/)).toBeInTheDocument();
    expect(screen.getByText(/Closed — funded/)).toBeInTheDocument();
  });

  it("shows_an_empty_state_when_there_are_no_assets", async () => {
    render(
      <OverviewPanel
        locale="en"
        api={apiWith({ assetOverview: vi.fn().mockResolvedValue(portfolio([])) })}
        token="tok"
      />,
    );

    expect(await screen.findByText(/No assets/)).toBeInTheDocument();
  });
});
