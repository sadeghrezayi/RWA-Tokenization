import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfferingDetailPage } from "../components/offering-detail-page";
import { ApiError } from "../lib/api";
import type { ApiClient, OfferingViewDto } from "../lib/api";

const open: OfferingViewDto = {
  id: "off-1",
  assetId: "asset-1",
  assetName: "Vanak Tower SPV",
  tokenAddress: "0xTok1",
  supply: "100",
  priceRial: "1000",
  minPerInvestor: "1",
  maxPerInvestor: "100",
  minimumRaise: "1",
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-08-01T00:00:00.000Z",
  state: "open",
  totalSubscribed: "60",
  participants: [
    { investorId: "sara", email: "sara@demo.com", subscribed: "60" },
    { investorId: "bob", email: "bob@demo.com", subscribed: "40" },
  ],
};

const closedWithAllocations: OfferingViewDto = {
  ...open,
  state: "closed_success",
  totalSubscribed: "100",
  participants: [
    {
      investorId: "sara",
      email: "sara@demo.com",
      subscribed: "60",
      requested: "60",
      allocated: "60",
      costRial: "60000",
      refundRial: "0",
    },
  ],
};

const apiWith = (offering: OfferingViewDto, overrides: Partial<ApiClient> = {}): ApiClient =>
  ({
    getOffering: vi.fn().mockResolvedValue(offering),
    openOffering: vi.fn().mockResolvedValue(undefined),
    closeOffering: vi.fn().mockResolvedValue({ state: "closed_success", allocations: [] }),
    ...overrides,
  }) as ApiClient;

const renderPage = (api: ApiClient) =>
  render(
    <OfferingDetailPage locale="en" api={api} token="tok" offeringId="off-1" onBack={vi.fn()} />,
  );

describe("OfferingDetailPage", () => {
  it("shows_config_window_progress_and_status", async () => {
    const getOffering = vi.fn().mockResolvedValue(open);
    renderPage(apiWith(open, { getOffering }));

    expect(await screen.findByRole("heading", { name: /Vanak Tower SPV/ })).toBeInTheDocument();
    expect(getOffering).toHaveBeenCalledWith("tok", "off-1");
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("1,000 ﷼")).toBeInTheDocument(); // price
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(0); // subscribed
  });

  it("closes_an_open_offering", async () => {
    const closeOffering = vi.fn().mockResolvedValue({ state: "closed_success", allocations: [] });
    renderPage(apiWith(open, { closeOffering }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    await userEvent.click(screen.getByRole("button", { name: "Close offering" }));

    await waitFor(() => {
      expect(closeOffering).toHaveBeenCalledWith("tok", "off-1");
    });
  });

  it("opens_a_draft_offering", async () => {
    const openOffering = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith({ ...open, state: "draft", totalSubscribed: "0" }, { openOffering }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    await userEvent.click(screen.getByRole("button", { name: "Open offering" }));

    await waitFor(() => {
      expect(openOffering).toHaveBeenCalledWith("tok", "off-1");
    });
  });

  it("shows_no_lifecycle_actions_once_closed", async () => {
    renderPage(apiWith({ ...open, state: "closed_success" }));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    expect(screen.getByText("Closed — funded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close offering" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open offering" })).not.toBeInTheDocument();
  });

  it("lists_the_participants_with_emails_and_subscribed_amounts", async () => {
    renderPage(apiWith(open));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    expect(screen.getByText("sara@demo.com")).toBeInTheDocument();
    expect(screen.getByText("bob@demo.com")).toBeInTheDocument();
  });

  it("shows_allocations_after_close", async () => {
    renderPage(apiWith(closedWithAllocations));
    await screen.findByRole("heading", { name: /Vanak Tower SPV/ });

    const saraRow = screen.getByText("sara@demo.com").closest("tr");
    expect(saraRow).not.toBeNull();
    expect(saraRow).toHaveTextContent("60,000 ﷼"); // cost
  });

  it("surfaces_a_load_error", async () => {
    renderPage(
      apiWith(open, { getOffering: vi.fn().mockRejectedValue(new ApiError(404, "no offering")) }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no offering");
  });
});
