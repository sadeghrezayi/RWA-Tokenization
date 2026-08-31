import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { holderReferenceFor } from "../../../src/application/issuers/issuer-asset-holders.js";

// The issuer holder registry withholds the raw wallet because a wallet is a
// durable CROSS-ASSET key: the same address holds that investor's positions in
// every other asset on the chain. The reference is what replaces it.
//
// That substitution only works if the reference cannot be turned back into the
// thing it replaced. For a platform-known holder the hashed subject is a
// randomUUID investor id — 122 bits, unguessable. For a holder the platform
// CANNOT name, the subject is the wallet address itself, and wallet addresses
// are on-chain and enumerable. Anyone who can read the chain can hash candidate
// wallets against a known asset id and recover the mapping — handing back the
// exact key the design exists to withhold.
describe("the issuer holder reference cannot be reversed by guessing", () => {
  const ASSET = "asset-1";
  const WALLET = "0xabcdef0000000000000000000000000000000001";
  const KEY = "a-platform-secret-the-issuer-does-not-have";

  it("is not a plain digest of values an attacker already holds", () => {
    // The attack, written out: an issuer knows their own asset id, and can
    // enumerate wallets from the chain. If the reference is a bare hash of
    // those two, they can confirm which wallet each row belongs to.
    const reference = holderReferenceFor(KEY, ASSET, WALLET);
    const guessed = createHash("sha256").update(`${ASSET}:${WALLET}`).digest("hex").slice(0, 16);

    expect(reference).not.toBe(guessed);
  });

  it("still gives the same holder the same reference on every read", () => {
    // Whatever replaces the bare hash must stay stable, or an issuer cannot
    // follow one holder across readings — which is the reason the reference
    // exists at all.
    expect(holderReferenceFor(KEY, ASSET, WALLET)).toBe(holderReferenceFor(KEY, ASSET, WALLET));
  });

  it("still differs across assets, so two issuers cannot compare notes", () => {
    expect(holderReferenceFor(KEY, ASSET, WALLET)).not.toBe(
      holderReferenceFor(KEY, "asset-2", WALLET),
    );
  });
});
