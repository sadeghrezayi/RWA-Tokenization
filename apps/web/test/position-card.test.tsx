import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionCard } from "../components/investor/position-card";
import type { ApiClient, PortfolioDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const portfolio = (overrides: Partial<PortfolioDto> = {}): PortfolioDto => ({
  totalInvestedRial: "70000000",
  portfolioValueRial: "90000000",
  portfolioValueFresh: true,
  valuedAt: "2026-07-01T00:00:00.000Z",
  incomeReceivedRial: "3000000",
  holdings: [
    {
      assetId: "asset-1",
      assetName: "Vanak Tower — Floor 7",
      tokens: "45",
      valueRial: "60000000",
      valuationFresh: true,
      valuedAt: "2026-07-01T00:00:00.000Z",
      shareBasisPoints: 6666,
    },
    {
      assetId: "asset-2",
      assetName: "Karaj Warehouse",
      tokens: "10",
      valueRial: "30000000",
      valuationFresh: true,
      valuedAt: "2026-07-02T00:00:00.000Z",
      shareBasisPoints: 3334,
    },
  ],
  income: [
    {
      distributionId: "dist-1",
      assetId: "asset-1",
      assetName: "Vanak Tower — Floor 7",
      amountRial: "2000000",
      paidAt: "2026-07-10T00:00:00.000Z",
    },
    {
      distributionId: "dist-2",
      assetId: "asset-2",
      assetName: "Karaj Warehouse",
      amountRial: "1000000",
      paidAt: "2026-07-11T00:00:00.000Z",
    },
  ],
  subscriptions: [
    {
      offeringId: "off-1",
      assetId: "asset-1",
      assetName: "Vanak Tower — Floor 7",
      state: "closed_success",
      requested: "50",
      allocated: "45",
      costRial: "45000000",
      refundRial: "5000000",
      closesAt: "2026-06-30T00:00:00.000Z",
    },
    {
      offeringId: "off-2",
      assetId: "asset-2",
      assetName: "Karaj Warehouse",
      state: "closed_success",
      requested: "10",
      allocated: "10",
      costRial: "25000000",
      refundRial: "0",
      closesAt: "2026-06-20T00:00:00.000Z",
    },
  ],
  ...overrides,
});

const renderPosition = (assetId: string, overrides: Partial<ApiClient> = {}) =>
  render(
    <PositionCard
      locale="en"
      assetId={assetId}
      api={stubApi({
        getPortfolio: vi.fn().mockResolvedValue(portfolio()),
        ...overrides,
      })}
    />,
  );

describe("PositionCard", () => {
  it("names the asset and what is held in it", async () => {
    renderPosition("asset-1");

    expect(await screen.findByText("Vanak Tower — Floor 7")).toBeTruthy();
    expect(screen.getByTestId("position-tokens").textContent).toContain("45");
  });

  it("shows this asset's numbers, never the whole portfolio's", async () => {
    renderPosition("asset-1");

    // Invested 45,000,000 here — not the 70,000,000 across everything.
    expect((await screen.findByTestId("position-invested")).textContent).toContain("45,000,000");
    expect(screen.getByTestId("position-value").textContent).toContain("60,000,000");
    expect(screen.getByTestId("position-income").textContent).toContain("2,000,000");
  });

  it("dates the value it shows and flags one that has gone stale", async () => {
    renderPosition("asset-1", {
      getPortfolio: vi.fn().mockResolvedValue(
        portfolio({
          holdings: [
            {
              assetId: "asset-1",
              assetName: "Vanak Tower — Floor 7",
              tokens: "45",
              valueRial: "60000000",
              valuationFresh: false,
              valuedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    });

    expect((await screen.findByTestId("position-value")).textContent).toContain("2026-01-01");
    // Flagged on the badge and explained in the callout below it.
    expect(screen.getAllByText(/out of date/i).length).toBeGreaterThan(1);
  });

  it("says a holding has no valuation instead of showing it as worth zero", async () => {
    renderPosition("asset-1", {
      getPortfolio: vi.fn().mockResolvedValue(
        portfolio({
          holdings: [
            {
              assetId: "asset-1",
              assetName: "Vanak Tower — Floor 7",
              tokens: "45",
              valuationFresh: false,
            },
          ],
        }),
      ),
    });

    const value = await screen.findByTestId("position-value");
    expect(value.textContent).not.toContain("0 ﷼");
    expect(value.textContent).toContain("—");
  });

  it("lists only the income paid on this asset", async () => {
    renderPosition("asset-1");

    expect(await screen.findByTestId("income-dist-1")).toBeTruthy();
    expect(screen.queryByTestId("income-dist-2")).toBeNull();
  });

  it("lists only the subscriptions made for this asset", async () => {
    renderPosition("asset-1");

    const row = await screen.findByTestId("subscription-off-1");
    // Requested 50, allocated 45, so 5,000,000 came back.
    expect(row.textContent).toContain("5,000,000");
    expect(screen.queryByTestId("subscription-off-2")).toBeNull();
  });

  it("says there is no position here rather than rendering an empty shell", async () => {
    renderPosition("asset-unknown");

    expect(await screen.findByText(/no position in this asset/i)).toBeTruthy();
  });

  it("distinguishes a portfolio it could not read from an empty position", async () => {
    renderPosition("asset-1", {
      getPortfolio: vi.fn().mockRejectedValue(new Error("portfolio unavailable")),
    });

    expect((await screen.findByRole("alert")).textContent).toContain("portfolio unavailable");
    expect(screen.queryByText(/no position in this asset/i)).toBeNull();
  });

  it("keeps a closed-out position reachable through its subscription history", async () => {
    // Redeemed everything: no holding left, but the money that went in and the
    // income that came out are still the holder's record.
    renderPosition("asset-1", {
      getPortfolio: vi.fn().mockResolvedValue(portfolio({ holdings: [] })),
    });

    expect(await screen.findByTestId("subscription-off-1")).toBeTruthy();
    expect(screen.getByTestId("position-tokens").textContent).toContain("0");
  });
});
