import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AesGcmCipher } from "../../src/infrastructure/crypto/aes-gcm-cipher.js";
import { PrismaStepAnswerStore } from "../../src/infrastructure/persistence/prisma-step-answer-store.js";

// 2.3e: the applicant's typed answers are personal data, so they get the same
// treatment as the documents — sealed at rest, erasable, tenant-scoped.
const prisma = new PrismaClient();
const key = randomBytes(32);
const clock = { now: () => new Date("2026-07-31T12:00:00Z") };
const store = new PrismaStepAnswerStore(prisma, new AesGcmCipher(key), clock);

const profile = { fullName: "Sara Ahmadi", nationalId: "1234567890" };

beforeEach(async () => {
  await prisma.onboardingAnswer.deleteMany({});
});

afterAll(async () => {
  await prisma.onboardingAnswer.deleteMany({});
  await prisma.$disconnect();
});

describe("PrismaStepAnswerStore (integration, real Postgres)", () => {
  it("round-trips a step's answers", async () => {
    await store.save("inv-1", "profile", profile);
    expect(await store.read("inv-1", "profile")).toEqual(profile);
  });

  it("writes ciphertext, never the answers themselves", async () => {
    await store.save("inv-1", "profile", profile);

    const row = await prisma.onboardingAnswer.findFirst({ where: { investorId: "inv-1" } });
    const stored = Buffer.from(row?.content ?? []);
    expect(stored.toString("utf8")).not.toContain("Sara");
    expect(stored.toString("utf8")).not.toContain("1234567890");
  });

  it("replaces an earlier answer instead of keeping both", async () => {
    await store.save("inv-1", "profile", profile);
    await store.save("inv-1", "profile", { ...profile, fullName: "Sara A." });

    expect(await prisma.onboardingAnswer.count({ where: { investorId: "inv-1" } })).toBe(1);
    expect((await store.read("inv-1", "profile"))?.fullName).toBe("Sara A.");
  });

  it("keeps steps and applicants apart", async () => {
    await store.save("inv-1", "profile", profile);
    await store.save("inv-1", "bank_account", { iban: "IR00" });
    await store.save("inv-2", "profile", { fullName: "Someone Else" });

    const all = await store.readAll("inv-1");
    expect(Object.keys(all).sort()).toEqual(["bank_account", "profile"]);
    expect(all.profile).toEqual(profile);
    expect(await store.read("inv-1", "suitability")).toBeUndefined();
  });

  it("erases everything an applicant answered, and says whether anything went", async () => {
    await store.save("inv-1", "profile", profile);
    await store.save("inv-1", "bank_account", { iban: "IR00" });

    expect(await store.erase("inv-1")).toBe(true);
    expect(await store.readAll("inv-1")).toEqual({});
    expect(await store.erase("inv-1")).toBe(false);
  });

  it("refuses answers that were altered in the database", async () => {
    await store.save("inv-1", "profile", profile);
    const row = await prisma.onboardingAnswer.findFirst({ where: { investorId: "inv-1" } });
    const tampered = Buffer.from(row?.content ?? []);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 0x01, tampered.length - 1);
    await prisma.onboardingAnswer.updateMany({
      where: { investorId: "inv-1" },
      data: { content: new Uint8Array(tampered) },
    });

    await expect(store.read("inv-1", "profile")).rejects.toThrow();
  });
});
