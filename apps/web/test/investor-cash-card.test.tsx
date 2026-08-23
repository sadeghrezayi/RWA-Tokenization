import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestorCashCard } from "../components/admin/investor-cash-card";
import type { ApiClient, InvestorFundingDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const declared: InvestorFundingDto = {
  id: "f-1",
  status: "awaiting_transfer",
  amountRial: "50000000",
  reference: "TP-ABCD2345",
  requestedAt: "2026-08-20T10:00:00.000Z",
};

const renderCard = (rows: InvestorFundingDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <InvestorCashCard
      locale="en"
      investorId="inv-1"
      token="tok"
      api={stubApi({ investorFunding: vi.fn().mockResolvedValue(rows), ...overrides })}
    />,
  );

// 4.3 Investor 360, Cash & payments.
describe("InvestorCashCard", () => {
  it("shows the reference an officer matches against a bank statement", async () => {
    renderCard([declared]);

    const row = await screen.findByTestId("cash-0");
    expect(row.textContent).toMatch(/TP-ABCD2345/);
    expect(row.textContent).toMatch(/50,000,000/);
  });

  it("shows what ARRIVED beside what was declared, when they differ", async () => {
    // Treasury confirms the amount that actually landed. Showing only the
    // declared figure would misstate the record in the officer's own view.
    renderCard([
      {
        ...declared,
        status: "settled",
        settledAt: "2026-08-21T10:00:00.000Z",
        settledAmountRial: "49950000",
      },
    ]);

    expect((await screen.findByTestId("cash-settled-0")).textContent).toMatch(/49,950,000/);
  });

  it("does not repeat the amount when the full sum arrived", async () => {
    renderCard([
      {
        ...declared,
        status: "settled",
        settledAt: "2026-08-21T10:00:00.000Z",
        settledAmountRial: "50000000",
      },
    ]);

    await screen.findByTestId("cash-0");
    expect(screen.queryByTestId("cash-settled-0")).toBeNull();
  });

  it("carries the reason a deposit was rejected", async () => {
    renderCard([{ ...declared, status: "rejected", rejectionReason: "no matching credit found" }]);

    expect((await screen.findByTestId("cash-0")).textContent).toMatch(/no matching credit/);
  });

  it("says no deposit was declared, rather than showing an empty box", async () => {
    renderCard([]);

    expect(await screen.findByTestId("no-cash-movements")).toBeTruthy();
  });

  it("distinguishes a failed load from no deposits", async () => {
    renderCard([], { investorFunding: vi.fn().mockRejectedValue(new Error("upstream is down")) });

    expect((await screen.findByRole("alert")).textContent).toMatch(/upstream is down/);
    expect(screen.queryByTestId("no-cash-movements")).toBeNull();
  });
});
