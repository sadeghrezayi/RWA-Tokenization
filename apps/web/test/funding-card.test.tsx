import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FundingCard } from "../components/investor/funding-card";
import type { ApiClient, FundingRequestDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const instructions = {
  bankName: "Bank Melli",
  accountHolder: "Tokenization Platform LLC",
  accountNumber: "IR820540102680020817909002",
  notice: "Quote the reference exactly as shown.",
};

const pending: FundingRequestDto = {
  id: "fund-1",
  status: "pending",
  amountRial: "50000000",
  reference: "TP-4F9K2AB7",
  requestedAt: "2026-08-02T09:00:00.000Z",
};

const renderCard = (overrides: Partial<ApiClient>) =>
  render(
    <FundingCard
      locale="en"
      api={stubApi({
        ledgerMe: vi.fn().mockResolvedValue({ balanceRial: "12000000", heldRial: "2000000" }),
        myFunding: vi.fn().mockResolvedValue([]),
        ...overrides,
      })}
      csrfToken="csrf"
      token="tok"
    />,
  );

describe("FundingCard", () => {
  it("shows what is available to invest and what is already committed", async () => {
    renderCard({});

    // Exact text, not a substring: "2,000,000" also matches "12,000,000".
    expect(await screen.findByText("12,000,000 ﷼")).toBeTruthy();
    expect(screen.getByText("2,000,000 ﷼")).toBeTruthy();
  });

  it("distinguishes a balance that could not be read from a zero balance", async () => {
    renderCard({ ledgerMe: vi.fn().mockRejectedValue(new Error("ledger unavailable")) });

    expect((await screen.findByRole("alert")).textContent).toContain("ledger unavailable");
    // Showing "0" here would tell the holder their money is gone.
    expect(screen.queryByText("0 ﷼")).toBeNull();
  });

  it("hands back the reference and where to send the money", async () => {
    const requestFunding = vi.fn().mockResolvedValue({ request: pending, instructions });
    renderCard({ requestFunding });

    fireEvent.change(await screen.findByLabelText(/amount/i), {
      target: { value: "50000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /get payment details/i }));

    await waitFor(() => {
      expect(requestFunding).toHaveBeenCalledWith("csrf", "50000000");
    });
    expect(await screen.findByText("TP-4F9K2AB7")).toBeTruthy();
    expect(screen.getByText("IR820540102680020817909002")).toBeTruthy();
    expect(screen.getByText(/Bank Melli/)).toBeTruthy();
  });

  it("says money has not moved yet, so nobody thinks the deposit is done", async () => {
    renderCard({
      requestFunding: vi.fn().mockResolvedValue({ request: pending, instructions }),
    });

    fireEvent.change(await screen.findByLabelText(/amount/i), { target: { value: "50000000" } });
    fireEvent.click(screen.getByRole("button", { name: /get payment details/i }));

    expect(await screen.findByText(/nothing has been credited yet/i)).toBeTruthy();
  });

  it("warns when the platform has no bank account configured", async () => {
    // Sending someone to transfer money to "NOT CONFIGURED" would be worse
    // than telling them the platform is not ready.
    renderCard({
      requestFunding: vi.fn().mockResolvedValue({
        request: pending,
        instructions: { ...instructions, accountNumber: "NOT CONFIGURED" },
      }),
    });

    fireEvent.change(await screen.findByLabelText(/amount/i), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: /get payment details/i }));

    expect(await screen.findByText(/cannot accept transfers yet/i)).toBeTruthy();
  });

  it("keeps the amount when the server rejects it", async () => {
    renderCard({
      requestFunding: vi.fn().mockRejectedValue(new Error('"amountRial" must be positive')),
    });

    const field = await screen.findByLabelText<HTMLInputElement>(/amount/i);
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /get payment details/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("must be positive");
    expect(screen.getByLabelText<HTMLInputElement>(/amount/i).value).toBe("0");
  });

  it("lists past requests with what actually arrived", async () => {
    renderCard({
      myFunding: vi.fn().mockResolvedValue([
        {
          ...pending,
          id: "fund-2",
          status: "confirmed",
          settledAmountRial: "49950000",
          settledAt: "2026-08-03T09:00:00.000Z",
        },
      ]),
    });

    const row = await screen.findByTestId("funding-fund-2");
    // The declared amount and what was received are different facts.
    expect(row.textContent).toContain("49,950,000");
    expect(row.textContent).toMatch(/confirmed/i);
  });

  it("shows why a request was rejected", async () => {
    renderCard({
      myFunding: vi.fn().mockResolvedValue([
        {
          ...pending,
          id: "fund-3",
          status: "rejected",
          rejectionReason: "no matching bank credit",
          settledAt: "2026-08-03T09:00:00.000Z",
        },
      ]),
    });

    expect(await screen.findByText(/no matching bank credit/)).toBeTruthy();
  });

  it("lets the holder withdraw a request they have not paid", async () => {
    const cancelFunding = vi.fn().mockResolvedValue({ ...pending, status: "cancelled" });
    renderCard({ myFunding: vi.fn().mockResolvedValue([pending]), cancelFunding });

    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(cancelFunding).toHaveBeenCalledWith("csrf", "fund-1");
    });
  });

  it("offers no cancel on something already settled", async () => {
    renderCard({
      myFunding: vi
        .fn()
        .mockResolvedValue([{ ...pending, status: "confirmed", settledAmountRial: "1" }]),
    });

    await screen.findByTestId("funding-fund-1");
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("says there is no funding history rather than showing an empty table", async () => {
    renderCard({});
    expect(await screen.findByText(/no funding requests yet/i)).toBeTruthy();
  });
});
