import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortfolioSummary } from "../components/investor/portfolio-summary";
import type { ApiClient, PortfolioDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

// `valuedAt` is omitted rather than set to undefined — exactOptionalPropertyTypes
// treats "absent" and "present but undefined" as different things, and the API
// omits it when nothing has been valued.
const unvalued = (over: Partial<PortfolioDto>): PortfolioDto => {
  const withDate = portfolio(over);
  delete withDate.valuedAt;
  return withDate;
};

const portfolio = (over: Partial<PortfolioDto> = {}): PortfolioDto => ({
  totalInvestedRial: "45000",
  portfolioValueRial: "6250000000",
  portfolioValueFresh: true,
  valuedAt: "2026-07-01T00:00:00.000Z",
  incomeReceivedRial: "1500000",
  holdings: [
    {
      assetId: "asset-1",
      assetName: "Vanak Tower SPV",
      tokens: "45",
      valueRial: "6250000000",
      valuationFresh: true,
      valuedAt: "2026-07-01T00:00:00.000Z",
      shareBasisPoints: 10000,
    },
  ],
  income: [
    {
      distributionId: "dist-2",
      assetId: "asset-1",
      assetName: "Vanak Tower SPV",
      amountRial: "1000000",
      paidAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  subscriptions: [],
  ...over,
});

const renderSummary = (overrides: Partial<ApiClient>) =>
  render(<PortfolioSummary locale="en" api={stubApi(overrides)} />);

describe("PortfolioSummary", () => {
  it("shows what was invested, what it is worth and what has been received", async () => {
    renderSummary({ getPortfolio: vi.fn().mockResolvedValue(portfolio()) });

    expect(await screen.findByText(/45,000/)).toBeTruthy();
    // The value legitimately appears twice — once as the headline, once in the
    // per-asset table — so this asserts presence, not uniqueness.
    expect((await screen.findAllByText(/6,250,000,000/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/1,500,000/)).toBeTruthy();
  });

  it("dates the valuation the value came from", async () => {
    // An unqualified "your portfolio is worth X" would be a claim the platform
    // cannot stand behind; the attestation date is what makes it a fact.
    renderSummary({ getPortfolio: vi.fn().mockResolvedValue(portfolio()) });

    expect((await screen.findAllByText(/2026-07-01/)).length).toBeGreaterThan(0);
  });

  it("says plainly when the valuation behind the value is stale", async () => {
    renderSummary({
      getPortfolio: vi.fn().mockResolvedValue(
        portfolio({
          portfolioValueFresh: false,
          holdings: [
            {
              assetId: "asset-1",
              assetName: "Vanak Tower SPV",
              tokens: "45",
              valueRial: "6250000000",
              valuationFresh: false,
              valuedAt: "2026-01-01T00:00:00.000Z",
              shareBasisPoints: 10000,
            },
          ],
        }),
      ),
    });

    expect((await screen.findAllByText(/out of date/i)).length).toBeGreaterThan(0);
  });

  it("makes no claim at all when nothing has been valued", async () => {
    renderSummary({
      getPortfolio: vi.fn().mockResolvedValue(
        unvalued({
          portfolioValueRial: "0",
          holdings: [
            {
              assetId: "asset-1",
              assetName: "Vanak Tower SPV",
              tokens: "45",
              valuationFresh: false,
            },
          ],
        }),
      ),
    });

    expect(await screen.findByText(/no valuation has been published/i)).toBeTruthy();
  });

  it("breaks the portfolio down by asset", async () => {
    renderSummary({ getPortfolio: vi.fn().mockResolvedValue(portfolio()) });

    // The asset appears in the legend, the table and the income list.
    expect((await screen.findAllByText("Vanak Tower SPV")).length).toBeGreaterThan(0);
    expect(screen.getByRole("list").textContent).toContain("100.0%");
  });

  it("lists income that was actually paid, with its date", async () => {
    renderSummary({ getPortfolio: vi.fn().mockResolvedValue(portfolio()) });

    const row = await screen.findByTestId("income-dist-2");
    expect(row.textContent).toContain("Vanak Tower SPV");
    expect(row.textContent).toContain("2026-07-10");
    expect(row.textContent).toContain("1,000,000");
  });

  it("says no income has been paid yet rather than showing an empty table", async () => {
    renderSummary({
      getPortfolio: vi.fn().mockResolvedValue(portfolio({ income: [], incomeReceivedRial: "0" })),
    });

    expect(await screen.findByText(/no income/i)).toBeTruthy();
  });

  it("distinguishes a portfolio that could not be read from an empty one", async () => {
    renderSummary({ getPortfolio: vi.fn().mockRejectedValue(new Error("service unavailable")) });

    expect((await screen.findByRole("alert")).textContent).toContain("service unavailable");
    expect(screen.queryByText(/no valuation has been published/i)).toBeNull();
  });

  it("promises nothing about the future", async () => {
    // OD-21: no projected yield, expected return or forecast anywhere on the
    // holder's own screen.
    const { container } = renderSummary({
      getPortfolio: vi.fn().mockResolvedValue(portfolio()),
    });
    await screen.findAllByText("Vanak Tower SPV");

    expect(container.textContent).not.toMatch(/project|forecast|expected return|estimated yield/i);
  });
});
