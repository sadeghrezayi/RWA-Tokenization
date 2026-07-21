import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvestorsPanel } from "../components/investors-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDirectoryDto, OpenFollowUpDto } from "../lib/api";

const directory: InvestorDirectoryDto = {
  investors: [
    {
      id: "sara-id",
      email: "sara@demo.com",
      kycState: "approved",
      eligibleForClaims: true,
      balanceRial: "1250140000",
      heldRial: "0",
      stage: "active",
      tags: ["qualified"],
      totalInvestedRial: "60000",
      portfolioValueRial: "6250000000",
    },
    {
      id: "carol-id",
      email: "carol@demo.com",
      kycState: "draft",
      eligibleForClaims: false,
      balanceRial: "0",
      heldRial: "0",
      stage: "lead",
      tags: [],
      totalInvestedRial: "0",
      portfolioValueRial: "0",
    },
  ],
  summary: {
    investorCount: 2,
    totalBalanceRial: "1250140000",
    totalInvestedRial: "60000",
    totalPortfolioValueRial: "6250000000",
  },
};

const overdue: OpenFollowUpDto = {
  id: "f1",
  investorId: "sara-id",
  email: "sara@demo.com",
  text: "Send prospectus",
  dueAt: "2026-01-01T00:00:00.000Z",
  overdue: true,
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listInvestors: vi.fn().mockResolvedValue(directory),
    openFollowUps: vi.fn().mockResolvedValue([overdue]),
    completeFollowUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

describe("InvestorsPanel", () => {
  it("lists_investors_with_kyc_stage_balance_and_sales_columns", async () => {
    render(<InvestorsPanel locale="en" api={apiWith({})} token="tok" onOpenInvestor={vi.fn()} />);

    await screen.findByTestId("investor-sara-id");
    expect(
      within(screen.getByTestId("investor-sara-id")).getByText("sara@demo.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("carol@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("qualified")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("investor-sara-id")).getByText("1,250,140,000 ﷼"),
    ).toBeInTheDocument();
  });

  it("shows_the_totals_summary", async () => {
    render(<InvestorsPanel locale="en" api={apiWith({})} token="tok" onOpenInvestor={vi.fn()} />);
    await screen.findByTestId("investor-sara-id");

    // Appears in both the totals strip and sara's row.
    expect(screen.getAllByText("6,250,000,000 ﷼").length).toBeGreaterThanOrEqual(2);
  });

  it("navigates_to_the_detail_page_on_details", async () => {
    const onOpenInvestor = vi.fn();
    render(
      <InvestorsPanel locale="en" api={apiWith({})} token="tok" onOpenInvestor={onOpenInvestor} />,
    );
    await screen.findByTestId("investor-sara-id");

    await userEvent.click(
      within(screen.getByTestId("investor-sara-id")).getByRole("button", { name: "Open" }),
    );

    expect(onOpenInvestor).toHaveBeenCalledWith("sara-id");
  });

  it("shows_the_open_follow_up_queue_and_completes_one", async () => {
    const completeFollowUp = vi.fn().mockResolvedValue(undefined);
    render(
      <InvestorsPanel
        locale="en"
        api={apiWith({ completeFollowUp })}
        token="tok"
        onOpenInvestor={vi.fn()}
      />,
    );

    expect(await screen.findByText("Send prospectus")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => {
      expect(completeFollowUp).toHaveBeenCalledWith("tok", "f1");
    });
  });

  it("shows_the_empty_state_without_investors", async () => {
    render(
      <InvestorsPanel
        locale="en"
        api={apiWith({
          listInvestors: vi.fn().mockResolvedValue({
            investors: [],
            summary: {
              investorCount: 0,
              totalBalanceRial: "0",
              totalInvestedRial: "0",
              totalPortfolioValueRial: "0",
            },
          }),
          openFollowUps: vi.fn().mockResolvedValue([]),
        })}
        token="tok"
        onOpenInvestor={vi.fn()}
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
        onOpenInvestor={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("officer role required");
  });
});
