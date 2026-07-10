import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficerPanel } from "../components/officer-panel";
import type { InvestorViewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const pendingInvestor: InvestorViewDto = {
  id: "inv-9",
  email: "p@example.com",
  kycState: "submitted",
  eligibleForClaims: false,
};

describe("OfficerPanel", () => {
  it("logs_in_and_lists_pending_kyc", async () => {
    const pendingKyc = vi.fn().mockResolvedValue([pendingInvestor]);
    const api = stubApi({
      officerLogin: vi.fn().mockResolvedValue({ token: "off-tok" }),
      pendingKyc,
    });
    render(<OfficerPanel locale="en" api={api} />);

    await userEvent.type(screen.getByLabelText("Email"), "officer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "0fficer-pass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("p@example.com")).toBeInTheDocument();
    expect(pendingKyc).toHaveBeenCalledWith("off-tok");
  });

  it("approves_a_submitted_investor_after_starting_review", async () => {
    const startReview = vi.fn().mockResolvedValue(undefined);
    const approve = vi.fn().mockResolvedValue(undefined);
    const pendingKyc = vi.fn().mockResolvedValueOnce([pendingInvestor]).mockResolvedValueOnce([]);
    const api = stubApi({
      officerLogin: vi.fn().mockResolvedValue({ token: "off-tok" }),
      pendingKyc,
      startReview,
      approve,
    });
    render(<OfficerPanel locale="en" api={api} />);

    await userEvent.type(screen.getByLabelText("Email"), "officer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "0fficer-pass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith("off-tok", "inv-9");
    });
    expect(startReview).toHaveBeenCalledWith("off-tok", "inv-9");
    await waitFor(() => {
      expect(screen.queryByText("p@example.com")).not.toBeInTheDocument();
    });
  });
});
