import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingWizard } from "../components/investor/onboarding-wizard";
import { ApiError } from "../lib/api";
import type {
  ApiClient,
  OnboardingAnswersDto,
  OnboardingFormDto,
  OnboardingProgressDto,
} from "../lib/api";
import { stubApi } from "./auth-panel.test";

const form: OnboardingFormDto = {
  provisional: true,
  notice: "Provisional field set — requires local legal validation.",
  steps: {
    profile: [
      { name: "fullName", label: "Full legal name", type: "text", required: true },
      { name: "city", label: "City", type: "text", required: false },
    ],
    identity_evidence: [],
    bank_account: [{ name: "iban", label: "Account number", type: "text", required: true }],
    suitability: [
      {
        name: "riskTolerance",
        label: "Risk tolerance",
        type: "select",
        required: true,
        options: ["low", "high"],
      },
    ],
    agreements: [
      { name: "termsAccepted", label: "I accept the terms", type: "checkbox", required: true },
    ],
  },
};

const progress = (over: Partial<OnboardingProgressDto> = {}): OnboardingProgressDto => ({
  applicationId: "app-1",
  status: "in_progress",
  completedSteps: [],
  outstandingSteps: ["profile", "identity_evidence", "bank_account", "suitability", "agreements"],
  changeRequests: [],
  evidence: [],
  ...over,
});

const answers = (over: Partial<OnboardingAnswersDto> = {}): OnboardingAnswersDto => ({
  form,
  answers: {},
  ...over,
});

const renderWizard = (overrides: Partial<ApiClient>) =>
  render(<OnboardingWizard locale="en" api={stubApi(overrides)} csrfToken="csrf" />);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingWizard", () => {
  it("offers to start when nothing has been started", async () => {
    const startOnboarding = vi.fn().mockResolvedValue(progress());
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({ started: false }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
      startOnboarding,
    });

    const start = await screen.findByRole("button", { name: /start/i });
    fireEvent.click(start);

    await waitFor(() => {
      expect(startOnboarding).toHaveBeenCalledWith("csrf");
    });
  });

  it("says an unreadable application failed rather than showing an empty wizard", async () => {
    renderWizard({
      getOnboarding: vi.fn().mockRejectedValue(new Error("network down")),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
    });

    expect((await screen.findByRole("alert")).textContent).toContain("network down");
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull();
  });

  it("renders the fields the server defines, not a hard-coded form", async () => {
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({ started: true, application: progress() }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
    });

    expect(await screen.findByLabelText(/Full legal name/)).toBeTruthy();
    expect(screen.getByLabelText(/City/)).toBeTruthy();
    // And it says the set is provisional rather than implying it is settled law.
    expect(screen.getByText(/local legal validation/i)).toBeTruthy();
  });

  it("prefills what the applicant already answered", async () => {
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({ started: true, application: progress() }),
      getOnboardingAnswers: vi
        .fn()
        .mockResolvedValue(answers({ answers: { profile: { fullName: "Sara Ahmadi" } } })),
    });

    const field = await screen.findByLabelText<HTMLInputElement>(/Full legal name/);
    expect(field.value).toBe("Sara Ahmadi");
  });

  it("saves a step's answers", async () => {
    const saveOnboardingAnswers = vi
      .fn()
      .mockResolvedValue(progress({ completedSteps: ["profile"] }));
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({ started: true, application: progress() }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
      saveOnboardingAnswers,
    });

    fireEvent.change(await screen.findByLabelText(/Full legal name/), {
      target: { value: "Sara Ahmadi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveOnboardingAnswers).toHaveBeenCalledWith("csrf", "profile", {
        fullName: "Sara Ahmadi",
        city: "",
      });
    });
  });

  it("keeps what was typed when the server rejects the answers", async () => {
    // Losing the form on a validation error is the fastest way to make someone
    // abandon onboarding.
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({ started: true, application: progress() }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
      saveOnboardingAnswers: vi
        .fn()
        .mockRejectedValue(new ApiError(400, '"Full legal name" is required')),
    });

    fireEvent.change(await screen.findByLabelText(/Full legal name/), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Full legal name");
    expect(screen.getByLabelText<HTMLInputElement>(/Full legal name/).value).toBe("typed");
  });

  it("lists uploaded documents and can remove one", async () => {
    const removeEvidence = vi.fn().mockResolvedValue(progress());
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({
        started: true,
        application: progress({
          completedSteps: ["profile"],
          evidence: [
            {
              reference: "ref-1",
              investorId: "inv-1",
              step: "identity_evidence",
              filename: "passport.jpg",
              contentType: "image/jpeg",
              byteSize: 1024,
              uploadedAt: "2026-07-31T10:00:00.000Z",
            },
          ],
        }),
      }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
      removeEvidence,
    });

    fireEvent.click(await screen.findByRole("tab", { name: /Identity/ }));
    expect(screen.getByText("passport.jpg")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(removeEvidence).toHaveBeenCalledWith("csrf", "ref-1");
    });
  });

  it("only offers to submit once every step is done", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(progress({ status: "submitted" }));
    const { rerender } = renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({
        started: true,
        application: progress({ completedSteps: ["profile"] }),
      }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
      submitOnboarding,
    });

    await screen.findByRole("tab", { name: /Your details/ });
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();

    rerender(
      <OnboardingWizard
        locale="en"
        api={stubApi({
          getOnboarding: vi.fn().mockResolvedValue({
            started: true,
            application: progress({
              completedSteps: [
                "profile",
                "identity_evidence",
                "bank_account",
                "suitability",
                "agreements",
              ],
              outstandingSteps: [],
            }),
          }),
          getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
          submitOnboarding,
        })}
        csrfToken="csrf"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /submit/i }));
    await waitFor(() => {
      expect(submitOnboarding).toHaveBeenCalledWith("csrf");
    });
  });

  it("shows an application under review as read-only", async () => {
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({
        started: true,
        application: progress({
          status: "submitted",
          completedSteps: [
            "profile",
            "identity_evidence",
            "bank_account",
            "suitability",
            "agreements",
          ],
          outstandingSteps: [],
          submittedAt: "2026-07-31T10:00:00.000Z",
        }),
      }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
    });

    expect(await screen.findByText(/under review/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("tells the applicant exactly what the reviewer asked for", async () => {
    renderWizard({
      getOnboarding: vi.fn().mockResolvedValue({
        started: true,
        application: progress({
          status: "changes_requested",
          completedSteps: ["profile", "identity_evidence", "suitability", "agreements"],
          outstandingSteps: ["bank_account"],
          changeRequests: [{ step: "bank_account", reason: "the account name does not match" }],
        }),
      }),
      getOnboardingAnswers: vi.fn().mockResolvedValue(answers()),
    });

    expect(await screen.findByText(/the account name does not match/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Bank/ }).textContent).toContain("needs changes");
  });
});
