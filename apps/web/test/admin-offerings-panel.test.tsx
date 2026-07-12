import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminOfferingsPanel } from "../components/admin-offerings-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, OfferingViewDto } from "../lib/api";

const offering = (overrides: Partial<OfferingViewDto>): OfferingViewDto => ({
  id: "off-1",
  assetId: "asset-1",
  tokenAddress: "0xToken1",
  supply: "100",
  priceRial: "1000",
  minPerInvestor: "5",
  maxPerInvestor: "80",
  minimumRaise: "20",
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-07-10T00:00:00.000Z",
  state: "draft",
  totalSubscribed: "0",
  ...overrides,
});

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listOfferings: vi.fn().mockResolvedValue([]),
    createOffering: vi.fn().mockResolvedValue({ offeringId: "off-1" }),
    openOffering: vi.fn().mockResolvedValue(undefined),
    closeOffering: vi.fn().mockResolvedValue({ state: "closed_success", allocations: [] }),
    creditLedger: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

describe("AdminOfferingsPanel", () => {
  it("opens_a_draft_offering_and_refreshes", async () => {
    const openOffering = vi.fn().mockResolvedValue(undefined);
    const listOfferings = vi
      .fn()
      .mockResolvedValueOnce([offering({ state: "draft" })])
      .mockResolvedValueOnce([offering({ state: "open" })]);
    render(
      <AdminOfferingsPanel
        locale="en"
        api={apiWith({ openOffering, listOfferings })}
        token="tok"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(openOffering).toHaveBeenCalledWith("tok", "off-1");
    });
  });

  it("closes_an_open_offering", async () => {
    const closeOffering = vi.fn().mockResolvedValue({ state: "closed_success", allocations: [] });
    const api = apiWith({
      listOfferings: vi.fn().mockResolvedValue([offering({ state: "open" })]),
      closeOffering,
    });
    render(<AdminOfferingsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(closeOffering).toHaveBeenCalledWith("tok", "off-1");
    });
  });

  it("credits_an_investor_ledger_with_prompted_values", async () => {
    const creditLedger = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "prompt").mockReturnValueOnce("inv-9").mockReturnValueOnce("50000");
    render(<AdminOfferingsPanel locale="en" api={apiWith({ creditLedger })} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Credit ledger" }));

    await waitFor(() => {
      expect(creditLedger).toHaveBeenCalledWith("tok", "inv-9", "50000");
    });
  });

  it("shows_the_api_error_when_an_action_fails", async () => {
    const api = apiWith({
      listOfferings: vi.fn().mockResolvedValue([offering({ state: "open" })]),
      closeOffering: vi.fn().mockRejectedValue(new ApiError(409, "window still open")),
    });
    render(<AdminOfferingsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("window still open");
  });
});
