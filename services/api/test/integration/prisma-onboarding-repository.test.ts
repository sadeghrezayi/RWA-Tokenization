import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OnboardingApplication } from "../../src/domain/onboarding/onboarding-application.js";
import { PrismaOnboardingRepository } from "../../src/infrastructure/persistence/prisma-onboarding-repository.js";

// 2.3b: persistence for the 2.3a onboarding lifecycle against real Postgres.
const prisma = new PrismaClient();
const repo = new PrismaOnboardingRepository(prisma);

const NOW = new Date("2026-07-31T10:00:00Z");
const LATER = new Date("2026-08-01T10:00:00Z");

const started = (id = "app-1", investorId = "inv-1") =>
  OnboardingApplication.start({ id, investorId, kind: "individual", now: NOW });

const complete = (app: OnboardingApplication) =>
  app
    .completeStep("profile")
    .completeStep("identity_evidence")
    .completeStep("bank_account")
    .completeStep("suitability")
    .completeStep("agreements");

beforeEach(async () => {
  await prisma.onboardingApplication.deleteMany({});
});

afterAll(async () => {
  await prisma.onboardingApplication.deleteMany({});
  await prisma.$disconnect();
});

describe("PrismaOnboardingRepository (integration, real Postgres)", () => {
  it("round-trips an in-progress application by id and by investor", async () => {
    await repo.save(started().completeStep("profile"));

    const byId = await repo.findById("app-1");
    expect(byId?.investorId).toBe("inv-1");
    expect(byId?.status).toBe("in_progress");
    expect(byId?.completedSteps()).toEqual(["profile"]);
    expect(byId?.startedAt).toEqual(NOW);
    expect(byId?.submittedAt).toBeUndefined();

    const byInvestor = await repo.findByInvestor("inv-1");
    expect(byInvestor?.id).toBe("app-1");
  });

  it("round-trips a submitted application with its timestamp", async () => {
    await repo.save(complete(started()).submit(NOW));

    const loaded = await repo.findById("app-1");
    expect(loaded?.status).toBe("submitted");
    expect(loaded?.submittedAt).toEqual(NOW);
    expect(loaded?.isReadyToSubmit()).toBe(true);
  });

  it("round-trips the reviewer's change requests", async () => {
    const returned = complete(started())
      .submit(NOW)
      .requestChanges([{ step: "identity_evidence", reason: "photo is unreadable" }]);
    await repo.save(returned);

    const loaded = await repo.findById("app-1");
    expect(loaded?.status).toBe("changes_requested");
    expect(loaded?.changeRequests).toEqual([
      { step: "identity_evidence", reason: "photo is unreadable" },
    ]);
    // Precisely the reopened step is outstanding after a reload.
    expect(loaded?.outstandingSteps()).toEqual(["identity_evidence"]);
  });

  it("updates in place rather than creating a second application", async () => {
    await repo.save(started());
    await repo.save(complete(started()).submit(LATER));

    expect(await prisma.onboardingApplication.count()).toBe(1);
    expect((await repo.findById("app-1"))?.submittedAt).toEqual(LATER);
  });

  it("reports an unknown application as absent", async () => {
    expect(await repo.findById("nope")).toBeUndefined();
    expect(await repo.findByInvestor("nobody")).toBeUndefined();
  });
});
