import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { ONBOARDING_FORM, fieldsFor } from "../../../src/application/onboarding/onboarding-form.js";
import { InvalidStepAnswersError } from "../../../src/application/onboarding/errors.js";
import { SaveStepAnswers } from "../../../src/application/onboarding/save-step-answers.js";
import { GetStepAnswers } from "../../../src/application/onboarding/get-step-answers.js";
import { StartOnboarding } from "../../../src/application/onboarding/start-onboarding.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import {
  InMemoryEvidenceStore,
  InMemoryOnboardingRepository,
  InMemoryStepAnswerStore,
} from "../../fakes/onboarding-fakes.js";

const NOW = new Date("2026-07-31T10:00:00Z");
const clock = { now: () => NOW };
const ids = { nextId: () => "app-1" };

let investors: InMemoryInvestorRepository;
let applications: InMemoryOnboardingRepository;
let evidence: InMemoryEvidenceStore;
let answers: InMemoryStepAnswerStore;
let save: SaveStepAnswers;
let read: GetStepAnswers;

const validProfile = (): Record<string, string> =>
  Object.fromEntries(fieldsFor("profile").map((field) => [field.name, "x"]));

beforeEach(async () => {
  investors = new InMemoryInvestorRepository();
  applications = new InMemoryOnboardingRepository();
  evidence = new InMemoryEvidenceStore();
  answers = new InMemoryStepAnswerStore();
  save = new SaveStepAnswers(applications, evidence, answers);
  read = new GetStepAnswers(answers);

  await investors.save(
    Investor.register("inv-1", EmailAddress.of("applicant@example.com"), PasswordHash.of("hash")),
  );
  await new StartOnboarding(investors, applications, ids, clock, evidence).execute({
    investorId: "inv-1",
  });
});

describe("the onboarding form definition", () => {
  it("is provisional and says so, so nobody mistakes it for a legal requirement", () => {
    // The field set is jurisdiction-specific configuration, not something this
    // codebase asserts as compliant.
    expect(ONBOARDING_FORM.provisional).toBe(true);
    expect(ONBOARDING_FORM.notice.toLowerCase()).toContain("local legal validation");
  });

  it("describes fields for every step that collects answers", () => {
    expect(fieldsFor("profile").length).toBeGreaterThan(0);
    expect(fieldsFor("bank_account").length).toBeGreaterThan(0);
    expect(fieldsFor("suitability").length).toBeGreaterThan(0);
    expect(fieldsFor("agreements").length).toBeGreaterThan(0);
    // Identity evidence is documents, not a form.
    expect(fieldsFor("identity_evidence")).toEqual([]);
  });
});

describe("SaveStepAnswers", () => {
  it("stores the answers and completes the step in one action", async () => {
    // Two actions would let an applicant "complete" a step whose answers never
    // saved, or vice versa.
    const view = await save.execute({
      investorId: "inv-1",
      step: "profile",
      answers: validProfile(),
    });

    expect(view.completedSteps).toEqual(["profile"]);
    expect(await read.execute({ investorId: "inv-1", step: "profile" })).toEqual(validProfile());
  });

  it("refuses when a required answer is missing", async () => {
    const [first] = fieldsFor("profile");
    const incomplete = Object.fromEntries(
      Object.entries(validProfile()).filter(([name]) => name !== first?.name),
    );

    await expect(
      save.execute({ investorId: "inv-1", step: "profile", answers: incomplete }),
    ).rejects.toThrow(InvalidStepAnswersError);
    // Nothing half-saved.
    expect(await read.execute({ investorId: "inv-1", step: "profile" })).toBeUndefined();
  });

  it("refuses a blank answer to a required field", async () => {
    const blank = { ...validProfile(), [fieldsFor("profile")[0]?.name ?? ""]: "   " };

    await expect(
      save.execute({ investorId: "inv-1", step: "profile", answers: blank }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("refuses a field the form does not define", async () => {
    // Otherwise a client could stash arbitrary personal data in the record.
    await expect(
      save.execute({
        investorId: "inv-1",
        step: "profile",
        answers: { ...validProfile(), smuggled: "extra" },
      }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("refuses a choice that is not on the list", async () => {
    const choice = fieldsFor("suitability").find((field) => field.type === "select");
    if (!choice) throw new Error("expected a select field");
    const withBadChoice = Object.fromEntries(
      fieldsFor("suitability").map((field) => [
        field.name,
        field.name === choice.name ? "not-an-option" : (field.options?.[0] ?? "x"),
      ]),
    );

    await expect(
      save.execute({ investorId: "inv-1", step: "suitability", answers: withBadChoice }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("requires an agreement to actually be accepted", async () => {
    const declined = Object.fromEntries(
      fieldsFor("agreements").map((field) => [field.name, "false"]),
    );

    await expect(
      save.execute({ investorId: "inv-1", step: "agreements", answers: declined }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("refuses an answer longer than the field allows", async () => {
    const field = fieldsFor("profile")[0];
    const tooLong = { ...validProfile(), [field?.name ?? ""]: "x".repeat(600) };

    await expect(
      save.execute({ investorId: "inv-1", step: "profile", answers: tooLong }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("refuses to answer the documents step, which has no form", async () => {
    await expect(
      save.execute({ investorId: "inv-1", step: "identity_evidence", answers: {} }),
    ).rejects.toThrow(InvalidStepAnswersError);
  });

  it("lets an applicant correct an answer before submitting", async () => {
    await save.execute({ investorId: "inv-1", step: "profile", answers: validProfile() });
    const corrected = { ...validProfile(), [fieldsFor("profile")[0]?.name ?? ""]: "corrected" };

    await save.execute({ investorId: "inv-1", step: "profile", answers: corrected });

    expect(await read.execute({ investorId: "inv-1", step: "profile" })).toEqual(corrected);
  });
});

describe("GetStepAnswers", () => {
  it("reports nothing stored rather than an empty answer set", async () => {
    // An empty object would render as "answered with blanks" in the wizard.
    expect(await read.execute({ investorId: "inv-1", step: "bank_account" })).toBeUndefined();
  });

  it("returns every step's answers for a reviewer", async () => {
    await save.execute({ investorId: "inv-1", step: "profile", answers: validProfile() });

    const all = await read.all({ investorId: "inv-1" });
    expect(all.profile).toEqual(validProfile());
    expect(all.bank_account).toBeUndefined();
  });
});
