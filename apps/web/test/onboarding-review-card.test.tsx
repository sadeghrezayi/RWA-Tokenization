import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingReviewCard } from "../components/admin/onboarding-review-card";
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
    suitability: [],
    agreements: [
      { name: "termsAccepted", label: "I accept the terms", type: "checkbox", required: true },
    ],
  },
};

const submitted: OnboardingProgressDto = {
  applicationId: "app-1",
  status: "submitted",
  completedSteps: ["profile", "identity_evidence", "bank_account", "suitability", "agreements"],
  outstandingSteps: [],
  changeRequests: [],
  evidence: [
    {
      reference: "ref-1",
      investorId: "inv-1",
      step: "identity_evidence",
      filename: "passport.jpg",
      contentType: "image/jpeg",
      byteSize: 2048,
      uploadedAt: "2026-07-31T10:00:00.000Z",
    },
  ],
  submittedAt: "2026-07-31T10:30:00.000Z",
};

const answers: OnboardingAnswersDto = {
  form,
  answers: {
    profile: { fullName: "Sara Ahmadi", city: "Tehran" },
    bank_account: { iban: "IR820540102680020817909002" },
    agreements: { termsAccepted: "true" },
  },
};

const renderCard = (overrides: Partial<ApiClient>) =>
  render(
    <OnboardingReviewCard
      locale="en"
      api={stubApi({
        getApplicantOnboarding: vi
          .fn()
          .mockResolvedValue({ started: true, application: submitted }),
        getApplicantAnswers: vi.fn().mockResolvedValue(answers),
        ...overrides,
      })}
      csrfToken="csrf"
      investorId="inv-1"
    />,
  );

describe("OnboardingReviewCard", () => {
  it("says plainly when the applicant never started, rather than showing an empty file", async () => {
    renderCard({
      getApplicantOnboarding: vi.fn().mockResolvedValue({ started: false }),
    });

    expect(await screen.findByText(/has not started/i)).toBeTruthy();
  });

  it("distinguishes an unreadable application from an empty one", async () => {
    renderCard({
      getApplicantOnboarding: vi.fn().mockRejectedValue(new Error("database unreachable")),
    });

    expect((await screen.findByRole("alert")).textContent).toContain("database unreachable");
    expect(screen.queryByText(/has not started/i)).toBeNull();
  });

  it("shows each answer against the label the applicant was asked", async () => {
    renderCard({});

    expect(await screen.findByText("Full legal name")).toBeTruthy();
    expect(screen.getByText("Sara Ahmadi")).toBeTruthy();
    expect(screen.getByText("Account number")).toBeTruthy();
    expect(screen.getByText("IR820540102680020817909002")).toBeTruthy();
  });

  it("marks the field set as provisional so a reviewer knows what it is not", async () => {
    renderCard({});
    expect(await screen.findByText(/local legal validation/i)).toBeTruthy();
  });

  it("lists documents without fetching their content until asked", async () => {
    const getEvidence = vi.fn();
    renderCard({ getEvidence });

    expect(await screen.findByText("passport.jpg")).toBeTruthy();
    // Opening a queue must not decrypt everybody's identity documents.
    expect(getEvidence).not.toHaveBeenCalled();
  });

  it("opens a document only when the reviewer asks for it", async () => {
    const getEvidence = vi.fn().mockResolvedValue({
      filename: "passport.jpg",
      contentType: "image/jpeg",
      contentBase64: "AAEC",
    });
    renderCard({ getEvidence });

    fireEvent.click(await screen.findByRole("button", { name: /view/i }));

    await waitFor(() => {
      expect(getEvidence).toHaveBeenCalledWith("ref-1");
    });
    const image = await screen.findByAltText("passport.jpg");
    expect(image.getAttribute("src")).toBe("data:image/jpeg;base64,AAEC");
  });

  it("reports a document that cannot be opened instead of showing a blank frame", async () => {
    renderCard({ getEvidence: vi.fn().mockRejectedValue(new Error("decryption failed")) });

    fireEvent.click(await screen.findByRole("button", { name: /view/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("decryption failed");
  });

  it("sends the application back with a reason for each named step", async () => {
    const requestOnboardingChanges = vi
      .fn()
      .mockResolvedValue({ ...submitted, status: "changes_requested" });
    renderCard({ requestOnboardingChanges });

    fireEvent.click(await screen.findByRole("button", { name: /request changes/i }));
    fireEvent.change(screen.getByLabelText(/Bank account/), {
      target: { value: "the account name does not match" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send back/i }));

    await waitFor(() => {
      expect(requestOnboardingChanges).toHaveBeenCalledWith("csrf", "inv-1", [
        { step: "bank_account", reason: "the account name does not match" },
      ]);
    });
  });

  it("refuses to send an application back with no reason at all", async () => {
    // The API refuses this too; catching it here keeps the reviewer from a
    // pointless round-trip and an error they cannot act on.
    const requestOnboardingChanges = vi.fn();
    renderCard({ requestOnboardingChanges });

    fireEvent.click(await screen.findByRole("button", { name: /request changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /send back/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(requestOnboardingChanges).not.toHaveBeenCalled();
  });

  it("shows what was already asked for when the application is back with the applicant", async () => {
    renderCard({
      getApplicantOnboarding: vi.fn().mockResolvedValue({
        started: true,
        application: {
          ...submitted,
          status: "changes_requested",
          outstandingSteps: ["bank_account"],
          changeRequests: [{ step: "bank_account", reason: "the account name does not match" }],
        },
      }),
    });

    expect(await screen.findByText(/the account name does not match/)).toBeTruthy();
    // Waiting on the applicant — the reviewer should not be invited to send it
    // back again while it is already with them.
    expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
  });

  it("says a document could not be displayed instead of leaving a broken frame", async () => {
    // A corrupt or truncated upload is a real possibility; a broken-image icon
    // tells the reviewer nothing about what to do.
    renderCard({
      getEvidence: vi.fn().mockResolvedValue({
        filename: "passport.jpg",
        contentType: "image/jpeg",
        contentBase64: "not-an-image",
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: /view/i }));
    fireEvent.error(await screen.findByAltText("passport.jpg"));

    expect(await screen.findByText(/could not be displayed/i)).toBeTruthy();
  });

  it("reads an accepted agreement as words, not as a stored value", async () => {
    // "true" on a compliance screen is developer-speak; the reviewer is
    // reading whether the applicant accepted something.
    renderCard({});

    expect(await screen.findByText("I accept the terms")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.queryByText("true")).toBeNull();
  });
});
