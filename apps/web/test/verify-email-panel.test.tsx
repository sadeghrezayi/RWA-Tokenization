import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailPanel } from "../components/verify-email-panel";
import { ApiError } from "../lib/api";
import { stubApi } from "./auth-panel.test";

describe("VerifyEmailPanel", () => {
  it("verifies_the_email_with_the_token_and_shows_success", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(undefined);
    render(<VerifyEmailPanel locale="en" api={stubApi({ verifyEmail })} token="tok-123" />);

    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => {
      expect(verifyEmail).toHaveBeenCalledWith("tok-123");
    });
    expect(screen.getByText(/email is verified/i)).toBeInTheDocument();
  });

  it("surfaces_the_api_error_for_an_invalid_or_expired_token", async () => {
    const verifyEmail = vi
      .fn()
      .mockRejectedValue(new ApiError(400, "this verification link is invalid or has expired"));
    render(<VerifyEmailPanel locale="en" api={stubApi({ verifyEmail })} token="stale" />);

    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/i);
  });

  it("shows_a_missing_token_message_and_no_button_when_token_is_absent", () => {
    const verifyEmail = vi.fn();
    render(<VerifyEmailPanel locale="en" api={stubApi({ verifyEmail })} token={undefined} />);

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify email" })).not.toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
