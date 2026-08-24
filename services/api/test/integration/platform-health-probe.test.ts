import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PlatformHealthProbe } from "../../src/infrastructure/reporting/platform-health-probe.js";
import { clearInvestors } from "../support/clear-investors.js";

// K-2: the count that tells an officer someone was approved while the chain
// was unreachable, and cannot hold anything until their claim is reissued.
// Its unit tests use a fake probe, so the QUERY itself — the part that has to
// be right — was never run against a database until this.
const prisma = new PrismaClient();
// No IPFS or RPC needed: this count is a database question, which is the
// whole point — it has to answer while the chain is unreachable.
const probe = new PlatformHealthProbe(prisma, "http://unused.invalid", undefined);

const investor = async (
  id: string,
  kycState: "approved" | "submitted" | "rejected",
): Promise<void> => {
  await prisma.investor.create({
    data: {
      id,
      tenantId: "default",
      email: `${id}@example.com`,
      passwordHash: "x",
      kycState,
    },
  });
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.onchainIdentity.deleteMany();
  await clearInvestors(prisma);
});

describe("PlatformHealthProbe.approvedWithoutOnchainIdentity", () => {
  it("counts an approved investor the chain never heard about", async () => {
    await investor("needs-claim", "approved");

    expect(await probe.approvedWithoutOnchainIdentity()).toBe(1);
  });

  it("does not count one whose identity is on chain", async () => {
    await investor("has-identity", "approved");
    await prisma.onchainIdentity.create({
      data: { investorId: "has-identity", address: "0xabc" },
    });

    expect(await probe.approvedWithoutOnchainIdentity()).toBe(0);
  });

  it("does not count anyone who was never approved", async () => {
    await investor("still-waiting", "submitted");
    await investor("turned-down", "rejected");

    expect(await probe.approvedWithoutOnchainIdentity()).toBe(0);
  });

  it("answers zero on an empty platform rather than failing", async () => {
    // `notIn: []` is the shape this hits before anyone has an identity at all.
    expect(await probe.approvedWithoutOnchainIdentity()).toBe(0);
  });
});
