import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoldingsCard } from "../components/holdings-card";
import type { ApiClient, HoldingDto, RedemptionDto } from "../lib/api";

const holding: HoldingDto = {
  assetId: "asset-1",
  assetName: "Vanak Tower SPV",
  tokenAddress: "0xTok1",
  tokens: "42",
};

const fulfilled: RedemptionDto = {
  id: "red-1",
  assetId: "asset-1",
  tokenAddress: "0xTok1",
  investorId: "alice",
  tokens: "10",
  state: "fulfilled",
  requestedAt: "2026-07-14T00:00:00.000Z",
  payoutRial: "312500000",
  resolvedAt: "2026-07-15T00:00:00.000Z",
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    myHoldings: vi.fn().mockResolvedValue([holding]),
    myRedemptions: vi.fn().mockResolvedValue([]),
    transferTokens: vi.fn().mockResolvedValue({ transferId: "tr-1" }),
    requestRedemption: vi.fn().mockResolvedValue({ redemptionId: "red-1" }),
    ...overrides,
  }) as ApiClient;

describe("HoldingsCard", () => {
  it("lists_holdings_by_asset_name_with_token_counts", async () => {
    render(<HoldingsCard locale="en" api={apiWith({})} token="tok" />);

    expect(await screen.findByText("Vanak Tower SPV")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows_the_empty_state_without_holdings", async () => {
    render(
      <HoldingsCard
        locale="en"
        api={apiWith({ myHoldings: vi.fn().mockResolvedValue([]) })}
        token="tok"
      />,
    );
    expect(await screen.findByText(/don't hold any tokens/)).toBeInTheDocument();
  });

  it("transfers_via_the_modal_addressed_by_email", async () => {
    const transferTokens = vi.fn().mockResolvedValue({ transferId: "tr-1" });
    render(<HoldingsCard locale="en" api={apiWith({ transferTokens })} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Transfer" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Recipient email"), "bob@demo.com");
    await userEvent.type(dialog.getByLabelText("Tokens"), "25");
    await userEvent.click(dialog.getByRole("button", { name: "Transfer" }));

    await waitFor(() => {
      expect(transferTokens).toHaveBeenCalledWith("tok", {
        assetId: "asset-1",
        toEmail: "bob@demo.com",
        tokens: "25",
      });
    });
  });

  it("requests_a_redemption_via_the_modal", async () => {
    const requestRedemption = vi.fn().mockResolvedValue({ redemptionId: "red-1" });
    render(<HoldingsCard locale="en" api={apiWith({ requestRedemption })} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Tokens"), "10");
    await userEvent.click(dialog.getByRole("button", { name: "Redeem" }));

    await waitFor(() => {
      expect(requestRedemption).toHaveBeenCalledWith("tok", { assetId: "asset-1", tokens: "10" });
    });
  });

  it("shows_my_redemptions_with_payout_when_fulfilled", async () => {
    render(
      <HoldingsCard
        locale="en"
        api={apiWith({ myRedemptions: vi.fn().mockResolvedValue([fulfilled]) })}
        token="tok"
      />,
    );

    expect(await screen.findByText("Fulfilled")).toBeInTheDocument();
    expect(screen.getByText(/312,500,000 ﷼/)).toBeInTheDocument();
  });
});
