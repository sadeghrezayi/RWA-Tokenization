import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KycStatusCard } from "../components/kyc-status-card";
import type { ApiClient, InvestorViewDto } from "../lib/api";

const investor = (overrides: Partial<InvestorViewDto>): InvestorViewDto => ({
  id: "inv-1",
  email: "a@example.com",
  kycState: "draft",
  eligibleForClaims: false,
  ...overrides,
});

const apiWith = (overrides: Partial<ApiClient>): ApiClient => ({
  register: vi.fn(),
  getInvestor: vi.fn().mockResolvedValue(investor({})),
  submitKyc: vi.fn(),
  ...overrides,
});

describe("KycStatusCard", () => {
  it("shows_the_approved_state_with_eligibility", async () => {
    const api = apiWith({
      getInvestor: vi
        .fn()
        .mockResolvedValue(investor({ kycState: "approved", eligibleForClaims: true })),
    });
    render(<KycStatusCard locale="en" api={api} investorId="inv-1" />);

    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Eligible to invest")).toBeInTheDocument();
  });

  it("shows_the_rejection_reason_when_rejected", async () => {
    const api = apiWith({
      getInvestor: vi
        .fn()
        .mockResolvedValue(
          investor({ kycState: "rejected", kycRejectionReason: "document mismatch" }),
        ),
    });
    render(<KycStatusCard locale="en" api={api} investorId="inv-1" />);

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/document mismatch/)).toBeInTheDocument();
  });

  it("submits_kyc_from_draft_and_refreshes_the_state", async () => {
    const getInvestor = vi
      .fn()
      .mockResolvedValueOnce(investor({ kycState: "draft" }))
      .mockResolvedValueOnce(investor({ kycState: "submitted" }));
    const submitKyc = vi.fn().mockResolvedValue(undefined);
    const api = apiWith({ getInvestor, submitKyc });
    render(<KycStatusCard locale="en" api={api} investorId="inv-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Submit KYC documents" }));

    await waitFor(() => {
      expect(screen.getByText("Submitted")).toBeInTheDocument();
    });
    expect(submitKyc).toHaveBeenCalledWith("inv-1");
    expect(getInvestor).toHaveBeenCalledTimes(2);
  });

  it("hides_the_submit_button_outside_draft", async () => {
    const api = apiWith({
      getInvestor: vi.fn().mockResolvedValue(investor({ kycState: "in_review" })),
    });
    render(<KycStatusCard locale="en" api={api} investorId="inv-1" />);

    expect(await screen.findByText("In review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit KYC documents" })).not.toBeInTheDocument();
  });
});
