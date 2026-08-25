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

const ASSET_ID = "asset-health";
const OFFERING_ID = "off-health";

// One closed offering with an allocation, so the "awaiting mint" query has
// something real to answer about.
const closedOfferingWithAllocation = async (
  investorId: string,
  allocated: bigint,
  costRial: bigint,
): Promise<void> => {
  await prisma.asset.upsert({
    where: { id: ASSET_ID },
    update: {},
    create: {
      id: ASSET_ID,
      tenantId: "default",
      name: "Health Asset",
      type: "asset_backed",
      state: "proposed",
    },
  });
  await prisma.offering.upsert({
    where: { id: OFFERING_ID },
    update: {},
    create: {
      id: OFFERING_ID,
      tenantId: "default",
      assetId: ASSET_ID,
      tokenAddress: "0xToken",
      supply: 1_000n,
      priceRial: 1_000n,
      minPerInvestor: 1n,
      maxPerInvestor: 1_000n,
      minimumRaise: 1n,
      state: "closed_success",
      opensAt: new Date("2026-08-01T00:00:00.000Z"),
      closesAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  });
  await prisma.offeringAllocation.create({
    data: {
      tenantId: "default",
      offeringId: OFFERING_ID,
      investorId,
      requested: allocated,
      allocated,
      costRial,
      refundRial: 0n,
    },
  });
};

const confirmMint = async (investorId: string): Promise<void> => {
  await prisma.allocationMint.create({
    data: {
      id: `am-${investorId}`,
      tenantId: "default",
      offeringId: OFFERING_ID,
      investorId,
      tokens: "10",
      confirmedAt: new Date(),
    },
  });
};

const claimUnconfirmed = async (investorId: string): Promise<void> => {
  await prisma.allocationMint.create({
    data: {
      id: `am-u-${investorId}`,
      tenantId: "default",
      offeringId: OFFERING_ID,
      investorId,
      tokens: "10",
    },
  });
};

beforeEach(async () => {
  await prisma.allocationMint.deleteMany();
  await prisma.offeringAllocation.deleteMany();
  await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
  await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
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

// P0-2 step 3 residue (K-34): money is captured only after a confirmed mint, so
// an allocation with no confirmed mint is one whose investor is still holding
// the cost in escrow for tokens that do not exist. The unit tests use a fake
// probe, so this QUERY — the part that decides whether an operator sees the
// problem at all — is only real here.
describe("PlatformHealthProbe.allocationsAwaitingMint (integration, real Postgres)", () => {
  it("counts an allocation whose mint never confirmed, and sums the money held", async () => {
    await investor("inv-await", "approved");
    await closedOfferingWithAllocation("inv-await", 60n, 60_000n);

    expect(await probe.allocationsAwaitingMint()).toEqual({ count: 1, heldRial: 60_000n });
  });

  it("does NOT count an allocation whose mint confirmed", async () => {
    await investor("inv-done", "approved");
    await closedOfferingWithAllocation("inv-done", 60n, 60_000n);
    await confirmMint("inv-done");

    expect(await probe.allocationsAwaitingMint()).toEqual({ count: 0, heldRial: 0n });
  });

  it("DOES count a claimed-but-unconfirmed mint — that is the unresolved case", async () => {
    // A claim with no confirmation is exactly the state that needs a person:
    // nobody knows whether the chain took it, and the money is still held.
    // Treating it as done would hide the one case that most wants attention.
    await investor("inv-unres", "approved");
    await closedOfferingWithAllocation("inv-unres", 60n, 60_000n);
    await claimUnconfirmed("inv-unres");

    expect(await probe.allocationsAwaitingMint()).toEqual({ count: 1, heldRial: 60_000n });
  });

  it("ignores an allocation that was allocated nothing", async () => {
    // A fully refunded subscription owes no tokens and holds no money.
    await investor("inv-zero", "approved");
    await closedOfferingWithAllocation("inv-zero", 0n, 0n);

    expect(await probe.allocationsAwaitingMint()).toEqual({ count: 0, heldRial: 0n });
  });

  it("sums across investors without losing precision on a large escrow", async () => {
    // Rial totals outgrow a float; a SUM that came back as a Number would
    // round these two into the wrong answer.
    await investor("inv-a", "approved");
    await investor("inv-b", "approved");
    await closedOfferingWithAllocation("inv-a", 60n, 9_007_199_254_740_993n);
    await prisma.offeringAllocation.create({
      data: {
        tenantId: "default",
        offeringId: OFFERING_ID,
        investorId: "inv-b",
        requested: 5n,
        allocated: 5n,
        costRial: 2n,
        refundRial: 0n,
      },
    });

    expect(await probe.allocationsAwaitingMint()).toEqual({
      count: 2,
      heldRial: 9_007_199_254_740_995n,
    });
  });
});
