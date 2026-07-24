import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KycStatusCard } from "../components/kyc-status-card";
import type { InvestorViewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const investor = (overrides: Partial<InvestorViewDto>): InvestorViewDto => ({
  id: "inv-1",
  email: "a@example.com",
  emailVerified: true,
  kycState: "draft",
  eligibleForClaims: false,
  ...overrides,
});

describe("KycStatusCard", () => {
  it("loads_own_profile_with_the_token_and_shows_eligibility", async () => {
    const me = vi
      .fn()
      .mockResolvedValue(investor({ kycState: "approved", eligibleForClaims: true }));
    render(<KycStatusCard locale="en" api={stubApi({ me })} token="tok-1" />);

    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Eligible to invest")).toBeInTheDocument();
    expect(me).toHaveBeenCalledWith("tok-1");
  });

  it("shows_the_rejection_reason_when_rejected", async () => {
    const me = vi
      .fn()
      .mockResolvedValue(investor({ kycState: "rejected", kycRejectionReason: "doc mismatch" }));
    render(<KycStatusCard locale="en" api={stubApi({ me })} token="tok-1" />);

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/doc mismatch/)).toBeInTheDocument();
  });

  it("submits_kyc_from_draft_and_refreshes", async () => {
    const me = vi
      .fn()
      .mockResolvedValueOnce(investor({ kycState: "draft" }))
      .mockResolvedValueOnce(investor({ kycState: "submitted" }));
    const submitKyc = vi.fn().mockResolvedValue(undefined);
    render(<KycStatusCard locale="en" api={stubApi({ me, submitKyc })} token="tok-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Submit KYC documents" }));

    await waitFor(() => {
      expect(screen.getByText("Submitted")).toBeInTheDocument();
    });
    expect(submitKyc).toHaveBeenCalledWith("tok-1");
  });

  it("hides_the_submit_button_outside_draft", async () => {
    const me = vi.fn().mockResolvedValue(investor({ kycState: "in_review" }));
    render(<KycStatusCard locale="en" api={stubApi({ me })} token="tok-1" />);

    expect(await screen.findByText("In review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit KYC documents" })).not.toBeInTheDocument();
  });

  it("shows_verified_and_no_resend_when_the_email_is_verified", async () => {
    const me = vi.fn().mockResolvedValue(investor({ emailVerified: true }));
    render(<KycStatusCard locale="en" api={stubApi({ me })} token="tok-1" />);

    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
  });

  it("shows_unverified_and_resends_the_verification_email", async () => {
    const me = vi.fn().mockResolvedValue(investor({ emailVerified: false }));
    const requestEmailVerification = vi.fn().mockResolvedValue(undefined);
    render(
      <KycStatusCard locale="en" api={stubApi({ me, requestEmailVerification })} token="tok-1" />,
    );

    expect(await screen.findByText("Unverified")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resend verification email" }));

    await waitFor(() => {
      expect(requestEmailVerification).toHaveBeenCalledWith("a@example.com");
    });
    expect(screen.getByText(/Verification email sent/i)).toBeInTheDocument();
  });
});
