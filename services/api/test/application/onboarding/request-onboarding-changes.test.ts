import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { OnboardingApplication } from "../../../src/domain/onboarding/onboarding-application.js";
import { InvalidOnboardingTransitionError } from "../../../src/domain/onboarding/errors.js";
import { OnboardingNotStartedError } from "../../../src/application/onboarding/errors.js";
import { RequestOnboardingChanges } from "../../../src/application/onboarding/request-onboarding-changes.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import {
  InMemoryEvidenceStore,
  InMemoryOnboardingRepository,
} from "../../fakes/onboarding-fakes.js";
import { RecordingNotifier } from "../../fakes/notification-fakes.js";

const NOW = new Date("2026-07-31T10:00:00Z");

let investors: InMemoryInvestorRepository;
let applications: InMemoryOnboardingRepository;
let evidence: InMemoryEvidenceStore;
let notifier: RecordingNotifier;
let requestChanges: RequestOnboardingChanges;

const submittedApplication = async (): Promise<void> => {
  const application = [
    "profile",
    "identity_evidence",
    "bank_account",
    "suitability",
    "agreements",
  ].reduce(
    (acc, step) => acc.completeStep(step as "profile"),
    OnboardingApplication.start({
      id: "app-1",
      investorId: "inv-1",
      kind: "individual",
      now: NOW,
    }),
  );
  await applications.save(application.submit(NOW));
};

beforeEach(async () => {
  investors = new InMemoryInvestorRepository();
  applications = new InMemoryOnboardingRepository();
  evidence = new InMemoryEvidenceStore();
  notifier = new RecordingNotifier();
  requestChanges = new RequestOnboardingChanges(investors, applications, evidence, notifier);

  await investors.save(
    Investor.register("inv-1", EmailAddress.of("applicant@example.com"), PasswordHash.of("hash")),
  );
});

describe("RequestOnboardingChanges", () => {
  it("reopens exactly the steps the reviewer named", async () => {
    await submittedApplication();

    const view = await requestChanges.execute({
      investorId: "inv-1",
      requests: [{ step: "identity_evidence", reason: "the photo is unreadable" }],
    });

    expect(view.status).toBe("changes_requested");
    expect(view.outstandingSteps).toEqual(["identity_evidence"]);
    expect(view.changeRequests).toEqual([
      { step: "identity_evidence", reason: "the photo is unreadable" },
    ]);
  });

  it("tells the applicant, by email as well as in-app", async () => {
    // Otherwise the application stalls silently: the applicant is not logged in
    // and has no way to learn it came back.
    await submittedApplication();

    await requestChanges.execute({
      investorId: "inv-1",
      requests: [{ step: "bank_account", reason: "the account name does not match" }],
    });

    expect(notifier.sent).toHaveLength(1);
    const [sent] = notifier.sent;
    expect(sent?.recipient).toEqual({
      kind: "investor",
      id: "inv-1",
      email: "applicant@example.com",
    });
    expect(sent?.spec.important).toBe(true);
    // The reason travels with the message — a bare "action needed" would make
    // the applicant guess.
    expect(sent?.spec.body).toContain("the account name does not match");
  });

  it("refuses an empty list, so a rejection is never unexplained", async () => {
    await submittedApplication();

    await expect(requestChanges.execute({ investorId: "inv-1", requests: [] })).rejects.toThrow(
      InvalidOnboardingTransitionError,
    );
    expect(notifier.sent).toHaveLength(0);
  });

  it("refuses when the applicant never started", async () => {
    await expect(
      requestChanges.execute({
        investorId: "inv-1",
        requests: [{ step: "profile", reason: "incomplete" }],
      }),
    ).rejects.toThrow(OnboardingNotStartedError);
  });
});
