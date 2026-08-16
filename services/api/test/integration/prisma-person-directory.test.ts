import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InvestorPersonDirectory } from "../../src/application/issuers/investor-person-directory.js";
import { InvalidEmailError } from "../../src/domain/identity/errors.js";
import { PrismaInvestorRepository } from "../../src/infrastructure/persistence/prisma-investor-repository.js";

const prisma = new PrismaClient();
const directory = new InvestorPersonDirectory(new PrismaInvestorRepository(prisma));

const person = async (id: string, email: string) => {
  await prisma.investor.create({
    data: { id, email, passwordHash: "x", kycState: "approved" },
  });
};

// 3.2e: how an issuer's people are named. Colleagues are invited by email — no
// admin can be asked for a teammate's UUID — so this adapter is what turns an
// address into a person and back, against the real column.
describe("InvestorPersonDirectory (integration, real Postgres)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.investor.deleteMany({ where: { email: { contains: "@directory.test" } } });
    await person("person-1", "founder@directory.test");
  });

  afterAll(async () => {
    await prisma.investor.deleteMany({ where: { email: { contains: "@directory.test" } } });
    await prisma.$disconnect();
  });

  it("finds a person however their address was typed", async () => {
    // An invitation must not fail because someone's mail client capitalized
    // the address or a copy-paste brought whitespace with it.
    expect(await directory.findIdByEmail("  Founder@Directory.TEST ")).toBe("person-1");
  });

  it("finds nobody when nobody holds the address", async () => {
    expect(await directory.findIdByEmail("stranger@directory.test")).toBeUndefined();
  });

  it("refuses an address that is not an address", async () => {
    // Surfaces as a 400 rather than a blank failure: the inviter mistyped.
    await expect(directory.findIdByEmail("not-an-address")).rejects.toThrow(InvalidEmailError);
  });

  it("gives back the address of a person it knows", async () => {
    expect(await directory.emailOf("person-1")).toBe("founder@directory.test");
  });

  it("gives back nothing for a person it has never heard of", async () => {
    // A team list must survive a row it cannot name, rather than failing whole.
    expect(await directory.emailOf("nobody-at-all")).toBeUndefined();
  });
});
