import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaWalletDirectory } from "../../src/infrastructure/persistence/prisma-wallet-directory.js";

const prisma = new PrismaClient();
const RUN = randomUUID().slice(0, 8);
const HELD = `walletdir-held-${RUN}`;
const PENDING = `walletdir-pending-${RUN}`;

describe("PrismaWalletDirectory (integration, real Postgres)", () => {
  beforeAll(async () => {
    for (const [id, address] of [
      [HELD, `0xDIR${RUN}AbCd`],
      [PENDING, `pending:${RUN}`],
    ] as const) {
      await prisma.investor.upsert({
        where: { id },
        create: { id, email: `${id}@example.com`, passwordHash: "x", kycState: "approved" },
        update: {},
      });
      await prisma.investorWallet.create({ data: { investorId: id, address } });
    }
  });

  afterAll(async () => {
    await prisma.investorWallet.deleteMany({ where: { investorId: { in: [HELD, PENDING] } } });
    await prisma.investor.deleteMany({ where: { id: { in: [HELD, PENDING] } } });
    await prisma.$disconnect();
  });

  it("maps_lowercased_addresses_to_investor_identities", async () => {
    const directory = await new PrismaWalletDirectory(prisma).byWallet();

    expect(directory.get(`0xdir${RUN.toLowerCase()}abcd`)).toEqual({
      investorId: HELD,
      email: `${HELD}@example.com`,
    });
  });

  it("skips_pending_placeholder_wallets", async () => {
    const directory = await new PrismaWalletDirectory(prisma).byWallet();

    expect([...directory.values()].some((v) => v.investorId === PENDING)).toBe(false);
  });
});
