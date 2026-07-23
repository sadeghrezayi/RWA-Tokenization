import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficerLogin } from "../components/officer-login";
import { OfficerPanel } from "../components/officer-panel";
import type { InvestorViewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const pendingInvestor: InvestorViewDto = {
  id: "inv-9",
  email: "p@example.com",
  kycState: "submitted",
  eligibleForClaims: false,
};

describe("OfficerLogin", () => {
  it("signs_in_and_signals_success", async () => {
    const onAuthed = vi.fn();
    // Login establishes the httpOnly cookie server-side; onAuthed just signals.
    const officerLogin = vi.fn().mockResolvedValue({ token: "off-tok", csrfToken: "csrf" });
    render(<OfficerLogin locale="en" api={stubApi({ officerLogin })} onAuthed={onAuthed} />);

    await userEvent.type(screen.getByLabelText("Email"), "officer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "0fficer-pass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(onAuthed).toHaveBeenCalledTimes(1);
    });
    expect(officerLogin).toHaveBeenCalledWith("officer@example.com", "0fficer-pass");
  });
});

describe("OfficerPanel (KYC queue)", () => {
  it("lists_pending_kyc_for_the_given_token", async () => {
    const pendingKyc = vi.fn().mockResolvedValue([pendingInvestor]);
    const api = stubApi({ pendingKyc });
    render(<OfficerPanel locale="en" api={api} token="off-tok" />);

    expect(await screen.findByText("p@example.com")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(pendingKyc).toHaveBeenCalledWith("off-tok");
  });

  it("approves_a_submitted_investor_after_starting_review", async () => {
    const startReview = vi.fn().mockResolvedValue(undefined);
    const approve = vi.fn().mockResolvedValue(undefined);
    const pendingKyc = vi.fn().mockResolvedValueOnce([pendingInvestor]).mockResolvedValueOnce([]);
    const api = stubApi({ pendingKyc, startReview, approve });
    render(<OfficerPanel locale="en" api={api} token="off-tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith("off-tok", "inv-9");
    });
    expect(startReview).toHaveBeenCalledWith("off-tok", "inv-9");
    await waitFor(() => {
      expect(screen.queryByText("p@example.com")).not.toBeInTheDocument();
    });
  });

  it("rejects_a_submitted_investor_with_a_reason_from_the_modal", async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    const pendingKyc = vi.fn().mockResolvedValueOnce([pendingInvestor]).mockResolvedValueOnce([]);
    const api = stubApi({
      pendingKyc,
      startReview: vi.fn().mockResolvedValue(undefined),
      reject,
    });
    render(<OfficerPanel locale="en" api={api} token="off-tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText(/Rejection reason/), "document mismatch");
    await userEvent.click(dialog.getByRole("button", { name: "Confirm rejection" }));

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith("off-tok", "inv-9", "document mismatch");
    });
  });
});
