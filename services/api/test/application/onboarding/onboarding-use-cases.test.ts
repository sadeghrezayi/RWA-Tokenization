import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import {
  EvidenceNotFoundError,
  KycDecisionIsFinalError,
  EvidenceTooLargeError,
  MissingIdentityEvidenceError,
  OnboardingNotStartedError,
  UnsupportedEvidenceTypeError,
} from "../../../src/application/onboarding/errors.js";
import { StartOnboarding } from "../../../src/application/onboarding/start-onboarding.js";
import { GetOnboardingProgress } from "../../../src/application/onboarding/get-onboarding-progress.js";
import { CompleteOnboardingStep } from "../../../src/application/onboarding/complete-onboarding-step.js";
import {
  MAX_EVIDENCE_BYTES,
  UploadEvidence,
} from "../../../src/application/onboarding/upload-evidence.js";
import { RemoveEvidence } from "../../../src/application/onboarding/remove-evidence.js";
import { SubmitOnboarding } from "../../../src/application/onboarding/submit-onboarding.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import {
  InMemoryEvidenceStore,
  InMemoryOnboardingRepository,
} from "../../fakes/onboarding-fakes.js";

const NOW = new Date("2026-07-31T10:00:00Z");
const scan = Buffer.from("passport-scan-bytes", "utf8");

let investors: InMemoryInvestorRepository;
let applications: InMemoryOnboardingRepository;
let evidence: InMemoryEvidenceStore;
let start: StartOnboarding;
let progress: GetOnboardingProgress;
let completeStep: CompleteOnboardingStep;
let upload: UploadEvidence;
let remove: RemoveEvidence;
let submit: SubmitOnboarding;

const clock = { now: () => NOW };
let nextId = 0;
const ids = { nextId: () => `app-${String(++nextId)}` };

const uploadPassport = (investorId = "inv-1") =>
  upload.execute({
    investorId,
    step: "identity_evidence",
    filename: "passport.jpg",
    contentType: "image/jpeg",
    bytes: scan,
  });

// Every step done, with a real document behind the evidence step.
const completeEverything = async (investorId = "inv-1"): Promise<void> => {
  await uploadPassport(investorId);
  for (const step of [
    "profile",
    "identity_evidence",
    "bank_account",
    "suitability",
    "agreements",
  ] as const) {
    await completeStep.execute({ investorId, step });
  }
};

beforeEach(async () => {
  nextId = 0;
  investors = new InMemoryInvestorRepository();
  applications = new InMemoryOnboardingRepository();
  evidence = new InMemoryEvidenceStore();
  start = new StartOnboarding(investors, applications, ids, clock, evidence);
  progress = new GetOnboardingProgress(applications, evidence);
  completeStep = new CompleteOnboardingStep(applications, evidence);
  upload = new UploadEvidence(applications, evidence);
  remove = new RemoveEvidence(applications, evidence);
  submit = new SubmitOnboarding(investors, applications, clock, evidence);

  await investors.save(
    Investor.register("inv-1", EmailAddress.of("applicant@example.com"), PasswordHash.of("hash")),
  );
  await investors.save(
    Investor.register("inv-2", EmailAddress.of("other@example.com"), PasswordHash.of("hash")),
  );
});

describe("StartOnboarding", () => {
  it("starts an application with every step outstanding", async () => {
    const view = await start.execute({ investorId: "inv-1" });

    expect(view.applicationId).toBe("app-1");
    expect(view.status).toBe("in_progress");
    expect(view.outstandingSteps).toEqual([
      "profile",
      "identity_evidence",
      "bank_account",
      "suitability",
      "agreements",
    ]);
    expect(view.completedSteps).toEqual([]);
  });

  it("returns the existing application instead of starting a second one", async () => {
    await start.execute({ investorId: "inv-1" });
    await completeStep.execute({ investorId: "inv-1", step: "profile" });

    const again = await start.execute({ investorId: "inv-1" });

    // Re-entering the wizard must not discard work already done.
    expect(again.applicationId).toBe("app-1");
    expect(again.completedSteps).toEqual(["profile"]);
  });

  it("refuses to start for an investor who does not exist", async () => {
    await expect(start.execute({ investorId: "ghost" })).rejects.toThrow(InvestorNotFoundError);
  });
});

describe("GetOnboardingProgress", () => {
  it("reports nothing started rather than inventing an application", async () => {
    // The caller needs to distinguish "not started" from "started and empty" to
    // show the right screen.
    expect(await progress.execute({ investorId: "inv-1" })).toBeUndefined();
  });

  it("lists the applicant's uploaded evidence as metadata", async () => {
    await start.execute({ investorId: "inv-1" });
    await uploadPassport();

    const view = await progress.execute({ investorId: "inv-1" });

    expect(view?.evidence).toHaveLength(1);
    expect(view?.evidence[0]?.filename).toBe("passport.jpg");
    expect(view?.evidence[0]).not.toHaveProperty("bytes");
  });

  it("tells the applicant what the reviewer asked for", async () => {
    await start.execute({ investorId: "inv-1" });
    await completeEverything();
    await submit.execute({ investorId: "inv-1" });
    const application = await applications.findByInvestor("inv-1");
    if (!application) throw new Error("expected an application");
    await applications.save(
      application.requestChanges([{ step: "bank_account", reason: "name mismatch" }]),
    );

    const view = await progress.execute({ investorId: "inv-1" });

    expect(view?.status).toBe("changes_requested");
    expect(view?.changeRequests).toEqual([{ step: "bank_account", reason: "name mismatch" }]);
    expect(view?.outstandingSteps).toEqual(["bank_account"]);
  });
});

describe("CompleteOnboardingStep", () => {
  beforeEach(async () => {
    await start.execute({ investorId: "inv-1" });
  });

  it("records a completed step", async () => {
    const view = await completeStep.execute({ investorId: "inv-1", step: "profile" });

    expect(view.completedSteps).toEqual(["profile"]);
    expect(view.outstandingSteps).not.toContain("profile");
  });

  it("refuses to mark identity evidence complete with nothing uploaded", async () => {
    // The step's whole purpose is the document; letting it pass empty would put
    // an unreviewable application in front of an officer.
    await expect(
      completeStep.execute({ investorId: "inv-1", step: "identity_evidence" }),
    ).rejects.toThrow(MissingIdentityEvidenceError);
  });

  it("accepts identity evidence once a document exists", async () => {
    await uploadPassport();
    const view = await completeStep.execute({ investorId: "inv-1", step: "identity_evidence" });
    expect(view.completedSteps).toContain("identity_evidence");
  });

  it("refuses when the applicant never started", async () => {
    await expect(completeStep.execute({ investorId: "inv-2", step: "profile" })).rejects.toThrow(
      OnboardingNotStartedError,
    );
  });
});

describe("UploadEvidence", () => {
  beforeEach(async () => {
    await start.execute({ investorId: "inv-1" });
  });

  it("stores a document and returns what the applicant can see about it", async () => {
    const descriptor = await uploadPassport();

    expect(descriptor.filename).toBe("passport.jpg");
    expect(descriptor.byteSize).toBe(scan.length);
    expect(await evidence.listFor("inv-1")).toHaveLength(1);
  });

  it("refuses a file type an officer cannot review", async () => {
    await expect(
      upload.execute({
        investorId: "inv-1",
        step: "identity_evidence",
        filename: "payload.exe",
        contentType: "application/x-msdownload",
        bytes: scan,
      }),
    ).rejects.toThrow(UnsupportedEvidenceTypeError);
    expect(await evidence.listFor("inv-1")).toHaveLength(0);
  });

  it("refuses an oversized file", async () => {
    await expect(
      upload.execute({
        investorId: "inv-1",
        step: "identity_evidence",
        filename: "huge.pdf",
        contentType: "application/pdf",
        bytes: Buffer.alloc(MAX_EVIDENCE_BYTES + 1),
      }),
    ).rejects.toThrow(EvidenceTooLargeError);
  });

  it("refuses an empty file", async () => {
    await expect(
      upload.execute({
        investorId: "inv-1",
        step: "identity_evidence",
        filename: "empty.pdf",
        contentType: "application/pdf",
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toThrow(UnsupportedEvidenceTypeError);
  });

  it("refuses to change an application that is with the reviewer", async () => {
    await completeEverything();
    await submit.execute({ investorId: "inv-1" });

    await expect(uploadPassport()).rejects.toThrow();
  });

  it("refuses when the applicant never started", async () => {
    await expect(uploadPassport("inv-2")).rejects.toThrow(OnboardingNotStartedError);
  });
});

describe("RemoveEvidence", () => {
  beforeEach(async () => {
    await start.execute({ investorId: "inv-1" });
  });

  it("erases a document the applicant uploaded", async () => {
    const descriptor = await uploadPassport();

    await remove.execute({ investorId: "inv-1", reference: descriptor.reference });

    expect(await evidence.listFor("inv-1")).toHaveLength(0);
  });

  it("reopens the evidence step once the last document is gone", async () => {
    // Otherwise a completed step would point at nothing.
    const descriptor = await uploadPassport();
    await completeStep.execute({ investorId: "inv-1", step: "identity_evidence" });

    await remove.execute({ investorId: "inv-1", reference: descriptor.reference });

    const view = await progress.execute({ investorId: "inv-1" });
    expect(view?.outstandingSteps).toContain("identity_evidence");
  });

  it("will not let one applicant erase another's document", async () => {
    const descriptor = await uploadPassport();
    await start.execute({ investorId: "inv-2" });

    // Reported as absent, not forbidden: an outsider learns nothing about what
    // does or does not exist.
    await expect(
      remove.execute({ investorId: "inv-2", reference: descriptor.reference }),
    ).rejects.toThrow(EvidenceNotFoundError);
    expect(await evidence.listFor("inv-1")).toHaveLength(1);
  });

  it("reports an unknown reference as absent", async () => {
    await expect(remove.execute({ investorId: "inv-1", reference: "nope" })).rejects.toThrow(
      EvidenceNotFoundError,
    );
  });
});

describe("SubmitOnboarding", () => {
  beforeEach(async () => {
    await start.execute({ investorId: "inv-1" });
  });

  it("submits a complete application and puts the investor in the officer's queue", async () => {
    await completeEverything();

    const view = await submit.execute({ investorId: "inv-1" });

    expect(view.status).toBe("submitted");
    expect(view.submittedAt).toEqual(NOW);
    // The KYC state machine remains the authority on review; submitting the
    // wizard is what feeds it.
    expect((await investors.findById("inv-1"))?.kycStatus.state).toBe("submitted");
  });

  it("refuses an incomplete application", async () => {
    await completeStep.execute({ investorId: "inv-1", step: "profile" });

    await expect(submit.execute({ investorId: "inv-1" })).rejects.toThrow();
    expect((await investors.findById("inv-1"))?.kycStatus.state).toBe("draft");
  });

  it("resubmits after changes without disturbing a review already under way", async () => {
    await completeEverything();
    await submit.execute({ investorId: "inv-1" });

    // The officer picked it up, then sent it back.
    const reviewing = await investors.findById("inv-1");
    if (!reviewing) throw new Error("expected an investor");
    await investors.save(reviewing.startKycReview());
    const application = await applications.findByInvestor("inv-1");
    if (!application) throw new Error("expected an application");
    await applications.save(
      application.requestChanges([{ step: "bank_account", reason: "name mismatch" }]),
    );

    await completeStep.execute({ investorId: "inv-1", step: "bank_account" });
    const view = await submit.execute({ investorId: "inv-1" });

    expect(view.status).toBe("submitted");
    // in_review → submitted is not a legal KYC transition; a resubmission must
    // not try to force one.
    expect((await investors.findById("inv-1"))?.kycStatus.state).toBe("in_review");
  });

  it("refuses to resubmit once KYC was rejected, rather than going nowhere", async () => {
    // "rejected" is terminal in the KYC machine. Accepting the wizard again
    // would leave the applicant waiting on a review that can never be queued.
    await completeEverything();
    await submit.execute({ investorId: "inv-1" });
    const investor = await investors.findById("inv-1");
    if (!investor) throw new Error("expected an investor");
    await investors.save(investor.startKycReview().rejectKyc("documents do not match"));
    const application = await applications.findByInvestor("inv-1");
    if (!application) throw new Error("expected an application");
    await applications.save(application.requestChanges([{ step: "profile", reason: "redo" }]));
    await completeStep.execute({ investorId: "inv-1", step: "profile" });

    await expect(submit.execute({ investorId: "inv-1" })).rejects.toThrow(KycDecisionIsFinalError);
    // And the application is left as it was, not half-moved.
    expect((await progress.execute({ investorId: "inv-1" }))?.status).toBe("changes_requested");
  });

  it("refuses when the applicant never started", async () => {
    await expect(submit.execute({ investorId: "inv-2" })).rejects.toThrow(
      OnboardingNotStartedError,
    );
  });
});
