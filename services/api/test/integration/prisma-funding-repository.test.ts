import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FundingRequest } from "../../src/domain/funding/funding-request.js";
import { PrismaFundingRepository } from "../../src/infrastructure/persistence/prisma-funding-repository.js";

// 2.4b: funding persistence against real Postgres.
const prisma = new PrismaClient();
const repo = new PrismaFundingRepository(prisma);

const T1 = new Date("2026-08-02T09:00:00Z");
const T2 = new Date("2026-08-02T10:00:00Z");
const SETTLED = new Date("2026-08-03T09:00:00Z");

const opened = (id: string, investorId = "inv-1", now = T1, reference = `TP-${id}`) =>
  FundingRequest.open({ id, investorId, amountRial: 50_000_000n, reference, now });

beforeEach(async () => {
  await prisma.fundingRequest.deleteMany({});
});

afterAll(async () => {
  await prisma.fundingRequest.deleteMany({});
  await prisma.$disconnect();
});

describe("PrismaFundingRepository (integration, real Postgres)", () => {
  it("round-trips a pending request", async () => {
    await repo.save(opened("fund-1"));

    const stored = await repo.findById("fund-1");
    expect(stored?.status).toBe("pending");
    expect(stored?.amountRial).toBe(50_000_000n);
    expect(stored?.reference).toBe("TP-fund-1");
    expect(stored?.requestedAt).toEqual(T1);
    expect(stored?.settledAt).toBeUndefined();
    expect(stored?.settledAmountRial).toBeUndefined();
  });

  it("keeps the declared amount and what actually arrived apart", async () => {
    await repo.save(opened("fund-1"));
    const stored = await repo.findById("fund-1");
    if (!stored) throw new Error("expected a stored request");

    await repo.save(stored.confirm({ receivedRial: 49_950_000n, now: SETTLED }));

    const confirmed = await repo.findById("fund-1");
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.amountRial).toBe(50_000_000n);
    expect(confirmed?.settledAmountRial).toBe(49_950_000n);
    expect(confirmed?.settledAt).toEqual(SETTLED);
  });

  it("stores a rejection reason", async () => {
    await repo.save(opened("fund-1"));
    const stored = await repo.findById("fund-1");
    if (!stored) throw new Error("expected a stored request");

    await repo.save(stored.reject({ reason: "no matching credit", now: SETTLED }));

    expect((await repo.findById("fund-1"))?.rejectionReason).toBe("no matching credit");
  });

  it("updates in place rather than creating a second row", async () => {
    await repo.save(opened("fund-1"));
    const stored = await repo.findById("fund-1");
    if (!stored) throw new Error("expected a stored request");
    await repo.save(stored.cancel(SETTLED));

    expect(await prisma.fundingRequest.count()).toBe(1);
    expect((await repo.findById("fund-1"))?.status).toBe("cancelled");
  });

  it("lists an investor's own requests newest first, with a stable tiebreak", async () => {
    // Two requests can share a millisecond; without the tiebreak the order
    // would flicker between reads.
    await repo.save(opened("fund-a", "inv-1", T1));
    await repo.save(opened("fund-b", "inv-1", T2));
    await repo.save(opened("fund-c", "inv-1", T2));
    await repo.save(opened("fund-other", "inv-2", T2));

    const mine = await repo.findByInvestor("inv-1");

    expect(mine.map((r) => r.id)).toEqual(["fund-c", "fund-b", "fund-a"]);
    expect(mine.every((r) => r.investorId === "inv-1")).toBe(true);
  });

  it("gives treasury only pending requests, oldest first", async () => {
    await repo.save(opened("fund-a", "inv-1", T2));
    await repo.save(opened("fund-b", "inv-1", T1));
    const settled = await repo.findById("fund-a");
    if (!settled) throw new Error("expected a stored request");
    await repo.save(settled.confirm({ receivedRial: 1n, now: SETTLED }));

    const queue = await repo.findPending();

    expect(queue.map((r) => r.id)).toEqual(["fund-b"]);
  });

  it("refuses two requests sharing a reference", async () => {
    // The reference is the only link between a bank line and a request.
    await repo.save(opened("fund-a", "inv-1", T1, "TP-SAME"));

    await expect(repo.save(opened("fund-b", "inv-2", T1, "TP-SAME"))).rejects.toThrow();
  });
});
