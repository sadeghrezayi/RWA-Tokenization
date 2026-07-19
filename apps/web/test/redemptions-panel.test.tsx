import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RedemptionsPanel } from "../components/redemptions-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, RedemptionDto } from "../lib/api";

const requested: RedemptionDto = {
  id: "red-1",
  assetId: "asset-1",
  tokenAddress: "0xTok1",
  investorId: "investor-abc-123",
  tokens: "25",
  state: "requested",
  requestedAt: "2026-07-14T00:00:00.000Z",
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listRedemptions: vi.fn().mockResolvedValue([requested]),
    fulfillRedemption: vi.fn().mockResolvedValue({ payoutRial: "312500000" }),
    rejectRedemption: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

describe("RedemptionsPanel", () => {
  it("lists_the_queue_with_status_badges", async () => {
    render(<RedemptionsPanel locale="en" api={apiWith({})} token="tok" />);

    expect(await screen.findByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("fulfills_a_requested_redemption", async () => {
    const fulfillRedemption = vi.fn().mockResolvedValue({ payoutRial: "312500000" });
    render(<RedemptionsPanel locale="en" api={apiWith({ fulfillRedemption })} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Fulfill" }));

    await waitFor(() => {
      expect(fulfillRedemption).toHaveBeenCalledWith("tok", "red-1");
    });
  });

  it("rejects_via_the_modal_with_a_reason", async () => {
    const rejectRedemption = vi.fn().mockResolvedValue(undefined);
    render(<RedemptionsPanel locale="en" api={apiWith({ rejectRedemption })} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Rejection reason"), "stale valuation");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(rejectRedemption).toHaveBeenCalledWith("tok", "red-1", "stale valuation");
    });
  });

  it("shows_the_api_error_when_fulfillment_fails", async () => {
    const api = apiWith({
      fulfillRedemption: vi.fn().mockRejectedValue(new ApiError(409, "no fresh valuation")),
    });
    render(<RedemptionsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Fulfill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no fresh valuation");
  });
});
