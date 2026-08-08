import { describe, expect, it } from "vitest";
import {
  CorruptWalletDirectoryError,
  assertCustodialAddress,
  isCustodialAddress,
} from "../../../src/domain/registry/wallet-address.js";

// A holder snapshot reads every custodial wallet on record. One unusable row
// must not be able to look like "this holder owns nothing" — that would
// silently under-pay a distribution — and must not surface as a blank 500
// either, because then nobody can find the row that caused it.
describe("custodial wallet addresses", () => {
  it("accepts a real 20-byte address in either case", () => {
    expect(isCustodialAddress("0xD5F648E9E0EF2692f61378bc3aA3Bcb0699B4805")).toBe(true);
    expect(isCustodialAddress("0xd5f648e9e0ef2692f61378bc3aa3bcb0699b4805")).toBe(true);
  });

  it("rejects anything that is not one", () => {
    for (const bad of [
      "0xreg04c4f540aaaa", // an e2e fixture that reached the wallet table
      "D5F648E9E0EF2692f61378bc3aA3Bcb0699B4805", // no 0x
      "0xD5F648E9E0EF2692f61378bc3aA3Bcb0699B48", // too short
      "0xD5F648E9E0EF2692f61378bc3aA3Bcb0699B4805AA", // too long
      "0xZZF648E9E0EF2692f61378bc3aA3Bcb0699B4805", // not hex
      "",
    ]) {
      expect(isCustodialAddress(bad), bad).toBe(false);
    }
  });

  it("names the row it refuses, so the directory can actually be fixed", () => {
    expect(() => {
      assertCustodialAddress("0xreg04c4f540aaaa", "investor-7");
    }).toThrow(CorruptWalletDirectoryError);

    try {
      assertCustodialAddress("0xreg04c4f540aaaa", "investor-7");
    } catch (error) {
      expect((error as Error).message).toContain("0xreg04c4f540aaaa");
      expect((error as Error).message).toContain("investor-7");
    }
  });

  it("lets a valid address through untouched", () => {
    const address = "0xD5F648E9E0EF2692f61378bc3aA3Bcb0699B4805";
    expect(assertCustodialAddress(address, "investor-7")).toBe(address);
  });
});
