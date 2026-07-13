import { describe, expect, it } from "vitest";
import { TokenTransfer } from "../../../src/domain/transfers/token-transfer.js";
import { InvalidTransferError } from "../../../src/domain/transfers/errors.js";

const EXECUTED = new Date("2026-07-13T00:00:00Z");

const fields = (overrides: Partial<Parameters<typeof TokenTransfer.record>[0]> = {}) => ({
  id: "tr-1",
  assetId: "asset-1",
  tokenAddress: "0xTok1",
  fromInvestorId: "inv-a",
  toInvestorId: "inv-b",
  tokens: 25n,
  executedAt: EXECUTED,
  ...overrides,
});

describe("TokenTransfer (FR-TR-1)", () => {
  it("records_a_transfer_between_two_holders", () => {
    const tr = TokenTransfer.record(fields());
    expect(tr).toMatchObject({
      id: "tr-1",
      assetId: "asset-1",
      tokenAddress: "0xTok1",
      fromInvestorId: "inv-a",
      toInvestorId: "inv-b",
      tokens: 25n,
      executedAt: EXECUTED,
    });
  });

  it.each([0n, -5n])("rejects_a_non_positive_amount_%s", (tokens) => {
    expect(() => TokenTransfer.record(fields({ tokens }))).toThrow(InvalidTransferError);
  });

  it("rejects_a_transfer_to_self", () => {
    expect(() => TokenTransfer.record(fields({ toInvestorId: "inv-a" }))).toThrow(
      InvalidTransferError,
    );
  });
});
