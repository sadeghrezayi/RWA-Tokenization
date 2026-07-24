import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficerSecurityCard } from "../components/admin/officer-security-card";
import { stubApi } from "./auth-panel.test";

describe("OfficerSecurityCard", () => {
  it("shows_enabled_when_mfa_is_active_and_can_disable_it", async () => {
    const officerMfaStatus = vi.fn().mockResolvedValue({ status: "active" });
    const officerMfaDisable = vi.fn().mockResolvedValue(undefined);
    render(
      <OfficerSecurityCard
        locale="en"
        api={stubApi({ officerMfaStatus, officerMfaDisable })}
        token="csrf-1"
      />,
    );

    expect(await screen.findByText("Enabled")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disable two-factor" }));

    await waitFor(() => {
      expect(officerMfaDisable).toHaveBeenCalledWith("csrf-1");
    });
    expect(await screen.findByText("Not enabled")).toBeInTheDocument();
  });

  it("enrolls_then_confirms_and_reveals_recovery_codes", async () => {
    const officerMfaStatus = vi.fn().mockResolvedValue({ status: "none" });
    const officerMfaEnroll = vi
      .fn()
      .mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", keyUri: "otpauth://totp/x" });
    const officerMfaConfirm = vi
      .fn()
      .mockResolvedValue({ recoveryCodes: ["aaaaa-bbbbb", "ccccc-ddddd"] });
    render(
      <OfficerSecurityCard
        locale="en"
        api={stubApi({ officerMfaStatus, officerMfaEnroll, officerMfaConfirm })}
        token="csrf-1"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Enable two-factor" }));
    await waitFor(() => {
      expect(officerMfaEnroll).toHaveBeenCalledWith("csrf-1");
    });
    // The setup key is shown for manual entry into the authenticator app.
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Authentication code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirm & activate" }));

    await waitFor(() => {
      expect(officerMfaConfirm).toHaveBeenCalledWith("csrf-1", "123456");
    });
    // Recovery codes are revealed once.
    expect(await screen.findByText("aaaaa-bbbbb")).toBeInTheDocument();
    expect(screen.getByText("ccccc-ddddd")).toBeInTheDocument();
  });
});
