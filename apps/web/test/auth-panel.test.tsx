import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthPanel } from "../components/auth-panel";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";

export const stubApi = (overrides: Partial<ApiClient>): ApiClient => ({
  register: vi.fn(),
  login: vi.fn(),
  officerLogin: vi.fn(),
  me: vi.fn(),
  submitKyc: vi.fn(),
  pendingKyc: vi.fn(),
  startReview: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  listAssets: vi.fn(),
  proposeAsset: vi.fn(),
  startStructuring: vi.fn(),
  attachAssetDocument: vi.fn(),
  recordCustody: vi.fn(),
  confirmChecklistItem: vi.fn(),
  approveAsset: vi.fn(),
  tokenizeAsset: vi.fn(),
  ledgerMe: vi.fn(),
  creditLedger: vi.fn(),
  listOfferings: vi.fn(),
  createOffering: vi.fn(),
  openOffering: vi.fn(),
  closeOffering: vi.fn(),
  subscribeOffering: vi.fn(),
  listDistributions: vi.fn(),
  declareDistribution: vi.fn(),
  payDistribution: vi.fn(),
  assetOverview: vi.fn(),
  systemHealth: vi.fn(),
  publishAttestation: vi.fn(),
  listAttestations: vi.fn(),
  myHoldings: vi.fn(),
  transferTokens: vi.fn(),
  requestRedemption: vi.fn(),
  myRedemptions: vi.fn(),
  listRedemptions: vi.fn(),
  fulfillRedemption: vi.fn(),
  rejectRedemption: vi.fn(),
  ...overrides,
});

const fill = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
};

describe("AuthPanel", () => {
  it("registers_then_logs_in_and_reports_the_token", async () => {
    const register = vi.fn().mockResolvedValue({ investorId: "inv-1" });
    const login = vi.fn().mockResolvedValue({ token: "tok-1", investorId: "inv-1" });
    const onAuthed = vi.fn();
    render(<AuthPanel locale="en" api={stubApi({ register, login })} onAuthed={onAuthed} />);

    await fill("a@example.com", "s3cure-pass");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(onAuthed).toHaveBeenCalledWith("tok-1");
    });
    expect(register).toHaveBeenCalledWith("a@example.com", "s3cure-pass");
    expect(login).toHaveBeenCalledWith("a@example.com", "s3cure-pass");
  });

  it("logs_in_an_existing_investor", async () => {
    const login = vi.fn().mockResolvedValue({ token: "tok-2", investorId: "inv-1" });
    const onAuthed = vi.fn();
    render(<AuthPanel locale="en" api={stubApi({ login })} onAuthed={onAuthed} />);

    await fill("a@example.com", "s3cure-pass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(onAuthed).toHaveBeenCalledWith("tok-2");
    });
  });

  it("shows_the_api_error_on_bad_credentials", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, "invalid email or password"));
    render(<AuthPanel locale="en" api={stubApi({ login })} onAuthed={vi.fn()} />);

    await fill("a@example.com", "wrong-pass1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid email or password");
  });
});
