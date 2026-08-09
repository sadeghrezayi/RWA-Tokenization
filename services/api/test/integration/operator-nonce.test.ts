import { describe, expect, it } from "vitest";
import { JsonRpcProvider } from "ethers";
import { operatorSigner } from "../../src/infrastructure/chain/custodial-wallets.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC =
  process.env.PLATFORM_OPERATOR_MNEMONIC ??
  "test test test test test test test test test test test junk";

const devnetUp = async (): Promise<boolean> => {
  try {
    await new JsonRpcProvider(RPC_URL).getBlockNumber();
    return true;
  } catch {
    return false;
  }
};

// The platform signs every chain write with ONE operator account. Two staff
// actions that touch the chain at the same time — approving a KYC while an
// asset is being tokenized — must not fight over the nonce.
//
// Each adapter used to build its own NonceManager, and several built a fresh
// one per call. Two managers over the same account both read "next nonce = N"
// and both send N; the loser comes back as "nonce has already been used",
// surfaced to an operator as a bare 500.
describe("operator signer (integration, anvil devnet)", () => {
  it("hands out distinct nonces to concurrent callers", async () => {
    if (!(await devnetUp())) {
      // The chain suites are skipped rather than failed when no devnet is up;
      // this one follows the same rule.
      return;
    }

    const signers = [
      operatorSigner(RPC_URL, MNEMONIC),
      operatorSigner(RPC_URL, MNEMONIC),
      operatorSigner(RPC_URL, MNEMONIC),
    ];
    const first = signers[0];
    expect(first).toBeDefined();
    if (!first) return;
    const to = await first.getAddress();

    // Three zero-value self-transfers fired at once, each through a signer
    // obtained independently — exactly how three concurrent requests reach it.
    const sent = await Promise.all(
      signers.map(async (signer) => {
        const tx = await signer.sendTransaction({ to, value: 0n });
        return tx.nonce;
      }),
    );

    expect(new Set(sent).size, `nonces collided: ${sent.join(", ")}`).toBe(sent.length);
  }, 60_000);
});
