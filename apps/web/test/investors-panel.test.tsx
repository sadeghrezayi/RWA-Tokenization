import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvestorsPanel } from "../components/investors-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDetailDto, InvestorDirectoryEntryDto } from "../lib/api";

const sara: InvestorDirectoryEntryDto = {
  id: "sara-id",
  email: "sara@demo.com",
  kycState: "approved",
  eligibleForClaims: true,
  balanceRial: "1250140000",
  heldRial: "0",
};

const carol: InvestorDirectoryEntryDto = {
  id: "carol-id",
  email: "carol@demo.com",
  kycState: "draft",
  eligibleForClaims: false,
  balanceRial: "0",
  heldRial: "0",
};

const saraDetail: InvestorDetailDto = {
  investor: {
    id: "sara-id",
    email: "sara@demo.com",
    kycState: "approved",
    eligibleForClaims: true,
  },
  chain: {
    identityAddress: "0xId1234567890abcdef",
    walletAddress: "0x7ab685e2cbcd42084733be6222b16d35db0b60a0",
  },
  ledger: { balanceRial: "1250140000", heldRial: "0" },
  holdings: [
    { assetId: "asset-1", assetName: "Vanak Tower SPV", tokenAddress: "0xTok1", tokens: "35" },
  ],
  transfers: [
    {
      id: "tr-1",
      direction: "sent",
      counterparty: "bob@demo.com",
      assetName: "Vanak Tower SPV",
      tokens: "15",
      at: "2026-07-20T06:50:26.000Z",
    },
  ],
  redemptions: [
    {
      id: "red-1",
      assetName: "Vanak Tower SPV",
      tokens: "10",
      state: "fulfilled",
      requestedAt: "2026-07-20T06:50:26.000Z",
      payoutRial: "1250000000",
    },
  ],
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listInvestors: vi.fn().mockResolvedValue([sara, carol]),
    investorDetail: vi.fn().mockResolvedValue(saraDetail),
    ...overrides,
  }) as ApiClient;

describe("InvestorsPanel", () => {
  it("lists_every_investor_with_kyc_badge_and_balances", async () => {
    render(<InvestorsPanel locale="en" api={apiWith({})} token="tok" />);

    expect(await screen.findByText("sara@demo.com")).toBeInTheDocument();
    expect(screen.getByText("carol@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("1,250,140,000 ﷼")).toBeInTheDocument();
  });

  it("opens_the_detail_with_chain_portfolio_and_history", async () => {
    const investorDetail = vi.fn().mockResolvedValue(saraDetail);
    render(<InvestorsPanel locale="en" api={apiWith({ investorDetail })} token="tok" />);
    await screen.findByText("sara@demo.com");

    await userEvent.click(screen.getAllByRole("button", { name: "Details" })[0] as HTMLElement);

    const dialog = within(await screen.findByRole("dialog"));
    expect(investorDetail).toHaveBeenCalledWith("tok", "sara-id");
    expect(dialog.getByText("0x7ab6…60a0")).toBeInTheDocument();
    expect(dialog.getAllByText("Vanak Tower SPV").length).toBeGreaterThan(0);
    expect(dialog.getByText("35")).toBeInTheDocument();
    expect(dialog.getByText(/bob@demo.com/)).toBeInTheDocument();
    expect(dialog.getByText("Sent")).toBeInTheDocument();
    expect(dialog.getByText(/1,250,000,000 ﷼/)).toBeInTheDocument();
  });

  it("shows_the_empty_state_without_investors", async () => {
    render(
      <InvestorsPanel
        locale="en"
        api={apiWith({ listInvestors: vi.fn().mockResolvedValue([]) })}
        token="tok"
      />,
    );

    expect(await screen.findByText("No investors yet.")).toBeInTheDocument();
  });

  it("surfaces_api_errors", async () => {
    render(
      <InvestorsPanel
        locale="en"
        api={apiWith({
          listInvestors: vi.fn().mockRejectedValue(new ApiError(403, "officer role required")),
        })}
        token="tok"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("officer role required");
  });

  it("shows_no_activity_hints_for_a_fresh_user", async () => {
    const investorDetail = vi.fn().mockResolvedValue({
      investor: {
        id: "carol-id",
        email: "carol@demo.com",
        kycState: "draft",
        eligibleForClaims: false,
      },
      chain: {},
      ledger: { balanceRial: "0", heldRial: "0" },
      holdings: [],
      transfers: [],
      redemptions: [],
    });
    render(<InvestorsPanel locale="en" api={apiWith({ investorDetail })} token="tok" />);
    await screen.findByText("carol@demo.com");

    await userEvent.click(screen.getAllByRole("button", { name: "Details" })[1] as HTMLElement);

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getAllByText("No activity yet.").length).toBeGreaterThan(0);
  });
});
