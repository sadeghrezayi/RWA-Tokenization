import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfferingsPanel } from "../components/offerings-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, OfferingViewDto } from "../lib/api";

const offering = (overrides: Partial<OfferingViewDto>): OfferingViewDto => ({
  id: "off-1",
  assetId: "asset-1",
  assetName: "Pilot Real Estate SPV",
  tokenAddress: "0xToken1",
  supply: "100",
  priceRial: "1000",
  minPerInvestor: "5",
  maxPerInvestor: "80",
  minimumRaise: "20",
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-07-10T00:00:00.000Z",
  state: "open",
  totalSubscribed: "30",
  ...overrides,
});

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    ledgerMe: vi.fn().mockResolvedValue({ balanceRial: "50000", heldRial: "0" }),
    listOfferings: vi.fn().mockResolvedValue([]),
    subscribeOffering: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

const openSubscribeModal = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Subscribe" }));
  await userEvent.type(screen.getByLabelText("Number of tokens"), "10");
  await userEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
};

describe("OfferingsPanel (investor)", () => {
  it("shows_the_settlement_balance_formatted_as_rial", async () => {
    const api = apiWith({
      ledgerMe: vi.fn().mockResolvedValue({ balanceRial: "13000", heldRial: "80000" }),
    });
    render(<OfferingsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText(/13,000 ﷼/)).toBeInTheDocument();
    expect(screen.getByText(/80,000 ﷼/)).toBeInTheDocument();
  });

  it("lists_open_offerings_by_name_with_a_status_badge_and_subscribe", async () => {
    const api = apiWith({ listOfferings: vi.fn().mockResolvedValue([offering({})]) });
    render(<OfferingsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText("Pilot Real Estate SPV")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText(/30 \/ 100/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    // P2: the raw UUID is never shown as a label.
    expect(screen.queryByText("asset-1")).not.toBeInTheDocument();
  });

  it("subscribes_with_the_amount_entered_in_the_modal_and_refreshes", async () => {
    const subscribeOffering = vi.fn().mockResolvedValue(undefined);
    const listOfferings = vi
      .fn()
      .mockResolvedValueOnce([offering({})])
      .mockResolvedValueOnce([offering({ totalSubscribed: "40", mySubscribed: "10" })]);
    const api = apiWith({ subscribeOffering, listOfferings });
    render(<OfferingsPanel locale="en" api={api} token="tok" />);

    await openSubscribeModal();

    await waitFor(() => {
      expect(subscribeOffering).toHaveBeenCalledWith("tok", "off-1", "10");
    });
  });

  it("hides_subscribe_for_a_closed_offering_and_shows_my_allocation", async () => {
    const api = apiWith({
      listOfferings: vi.fn().mockResolvedValue([
        offering({
          state: "closed_success",
          mySubscribed: "40",
          myAllocation: {
            requested: "40",
            allocated: "33",
            costRial: "33000",
            refundRial: "7000",
          },
        }),
      ]),
    });
    render(<OfferingsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText(/33/)).toBeInTheDocument();
    expect(screen.getByText("Closed — funded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });

  it("shows_the_api_error_in_the_modal_when_subscription_fails", async () => {
    const api = apiWith({
      listOfferings: vi.fn().mockResolvedValue([offering({})]),
      subscribeOffering: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "insufficient ledger balance")),
    });
    render(<OfferingsPanel locale="en" api={api} token="tok" />);

    await openSubscribeModal();
    expect(await screen.findByRole("alert")).toHaveTextContent("insufficient ledger balance");
  });
});
