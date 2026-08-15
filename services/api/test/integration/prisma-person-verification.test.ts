import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InvestorPersonVerification } from "../../src/application/issuers/investor-person-verification.js";
import { PrismaInvestorRepository } from "../../src/infrastructure/persistence/prisma-investor-repository.js";

const prisma = new PrismaClient();
const verification = new InvestorPersonVerification(new PrismaInvestorRepository(prisma));

const person = async (id: string, kycState: "draft" | "submitted" | "approved" | "rejected") => {
  await prisma.investor.create({
    data: {
      id,
      email: `${id}@example.test`,
      passwordHash: "x",
      kycState,
    },
  });
};

// 3.2: the gate behind "every person acting for an issuer must be individually
// verified". An issuer's person is a platform user who has completed the SAME
// verification as anyone else — this adapter is the only place that binds that
// meaning, so it is where the rule can quietly be made permissive.
describe("InvestorPersonVerification (integration, real Postgres)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.investor.deleteMany({ where: { email: { contains: "@example.test" } } });
  });

  afterAll(async () => {
    await prisma.investor.deleteMany({ where: { email: { contains: "@example.test" } } });
    await prisma.$disconnect();
  });

  it("accepts a person whose verification was approved", async () => {
    await person("person-approved", "approved");

    expect(await verification.isVerified("person-approved")).toBe(true);
  });

  it("refuses a person who has not finished verifying", async () => {
    await person("person-draft", "draft");
    await person("person-submitted", "submitted");

    expect(await verification.isVerified("person-draft")).toBe(false);
    // Submitted is NOT verified: an application under review has not been
    // accepted by anyone yet.
    expect(await verification.isVerified("person-submitted")).toBe(false);
  });

  it("refuses a person whose verification was rejected", async () => {
    await person("person-rejected", "rejected");

    expect(await verification.isVerified("person-rejected")).toBe(false);
  });

  it("fails closed for someone it has never heard of", async () => {
    // An unknown id must never read as verified — that is how a gate becomes
    // decoration.
    expect(await verification.isVerified("nobody-at-all")).toBe(false);
  });
});
