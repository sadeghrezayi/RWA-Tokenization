import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordPanel } from "../components/reset-password-panel";
import { ApiError } from "../lib/api";
import { stubApi } from "./auth-panel.test";

describe("ResetPasswordPanel", () => {
  it("resets_the_password_with_the_token_and_shows_success", async () => {
    const resetPassword = vi.fn().mockResolvedValue(undefined);
    render(<ResetPasswordPanel locale="en" api={stubApi({ resetPassword })} token="tok-123" />);

    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pw");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pw");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith("tok-123", "brand-new-pw");
    });
    expect(screen.getByText(/password has been updated/i)).toBeInTheDocument();
  });

  it("blocks_submission_when_the_passwords_do_not_match", async () => {
    const resetPassword = vi.fn().mockResolvedValue(undefined);
    render(<ResetPasswordPanel locale="en" api={stubApi({ resetPassword })} token="tok-123" />);

    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pw");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different-pw");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("surfaces_the_api_error_for_an_invalid_or_expired_token", async () => {
    const resetPassword = vi
      .fn()
      .mockRejectedValue(new ApiError(400, "this reset link is invalid or has expired"));
    render(<ResetPasswordPanel locale="en" api={stubApi({ resetPassword })} token="stale" />);

    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pw");
    await userEvent.type(screen.getByLabelText("Confirm password"), "brand-new-pw");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/i);
  });

  it("shows_a_missing_token_message_and_no_form_when_token_is_absent", () => {
    const resetPassword = vi.fn();
    render(<ResetPasswordPanel locale="en" api={stubApi({ resetPassword })} token={undefined} />);

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
