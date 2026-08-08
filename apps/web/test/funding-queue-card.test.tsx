import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FundingQueueCard } from "../components/admin/funding-queue-card";
import type { ApiClient, PendingFundingDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const waiting: PendingFundingDto = {
  id: "fund-1",
  status: "pending",
  amountRial: "50000000",
  reference: "TP-4F9K2AB7",
  requestedAt: "2026-08-02T09:00:00.000Z",
  investorId: "inv-1",
  investorEmail: "holder@example.com",
};

const renderQueue = (overrides: Partial<ApiClient>) =>
  render(
    <FundingQueueCard
      locale="en"
      api={stubApi({
        pendingFunding: vi.fn().mockResolvedValue([waiting]),
        ...overrides,
      })}
      csrfToken="csrf"
    />,
  );

describe("FundingQueueCard", () => {
  it("shows who is waiting, for how much, against which reference", async () => {
    renderQueue({});

    const row = await screen.findByTestId("pending-fund-1");
    // A treasury officer reads this beside a bank statement: the reference and
    // the person are what they match on, not an internal id.
    expect(row.textContent).toContain("holder@example.com");
    expect(row.textContent).toContain("TP-4F9K2AB7");
    expect(row.textContent).toContain("50,000,000");
    expect(row.textContent).not.toContain("inv-1");
  });

  it("says the queue is empty rather than showing a bare table", async () => {
    renderQueue({ pendingFunding: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/nothing waiting/i)).toBeTruthy();
  });

  it("distinguishes a queue that could not be read from an empty one", async () => {
    renderQueue({ pendingFunding: vi.fn().mockRejectedValue(new Error("database unreachable")) });

    expect((await screen.findByRole("alert")).textContent).toContain("database unreachable");
    expect(screen.queryByText(/nothing waiting/i)).toBeNull();
  });

  it("offers the declared amount as the default but lets treasury correct it", async () => {
    // What arrived is the fact that matters; the declared amount is only a
    // convenient starting point.
    const confirmFunding = vi.fn().mockResolvedValue({
      request: { ...waiting, status: "confirmed" },
      creditStatus: { status: "credited" },
    });
    renderQueue({ confirmFunding });

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    const received = screen.getByLabelText<HTMLInputElement>(/amount received/i);
    expect(received.value).toBe("50000000");

    fireEvent.change(received, { target: { value: "49950000" } });
    fireEvent.click(screen.getByRole("button", { name: /credit the investor/i }));

    await waitFor(() => {
      expect(confirmFunding).toHaveBeenCalledWith("csrf", "fund-1", "49950000");
    });
  });

  it("says plainly when the credit still needs a second approval", async () => {
    // Above the maker-checker threshold the money is not in the account yet.
    renderQueue({
      confirmFunding: vi.fn().mockResolvedValue({
        request: { ...waiting, status: "confirmed" },
        creditStatus: { status: "pending_approval", approvalId: "apr-9" },
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /credit the investor/i }));

    expect(await screen.findByText(/second approval/i)).toBeTruthy();
  });

  it("refuses to confirm an amount that is not positive, without calling the server", async () => {
    const confirmFunding = vi.fn();
    renderQueue({ confirmFunding });

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /credit the investor/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(confirmFunding).not.toHaveBeenCalled();
  });

  it("requires a reason to reject, without calling the server", async () => {
    const rejectFunding = vi.fn();
    renderQueue({ rejectFunding });

    fireEvent.click(await screen.findByRole("button", { name: /reject/i }));
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(rejectFunding).not.toHaveBeenCalled();
  });

  it("rejects with the reason the officer gave", async () => {
    const rejectFunding = vi.fn().mockResolvedValue({ ...waiting, status: "rejected" });
    renderQueue({ rejectFunding });

    fireEvent.click(await screen.findByRole("button", { name: /reject/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "no matching bank credit" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));

    await waitFor(() => {
      expect(rejectFunding).toHaveBeenCalledWith("csrf", "fund-1", "no matching bank credit");
    });
  });

  it("surfaces a refused confirmation instead of pretending it worked", async () => {
    renderQueue({
      confirmFunding: vi.fn().mockRejectedValue(new Error("this deposit was already confirmed")),
    });

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /credit the investor/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("already confirmed");
  });
});
