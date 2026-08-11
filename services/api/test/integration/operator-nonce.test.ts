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

// The platform signs every chain write with ONE operator account, so how long
// a signer keeps its cached nonce matters.
//
// A long-lived NonceManager goes stale the moment another adapter sends — that
// was the real defect behind seven CI failures, and it is covered where it
// belongs, in onchainid-claim-issuer.test.ts.
//
// The narrower case below — two sends issued in the same instant — is closed
// by serialising sends per account: only a promise lane is shared, so nothing
// can go stale or wedge.
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

  it("keeps the lane moving after a send fails", async () => {
    if (!(await devnetUp())) {
      return;
    }
    const signer = operatorSigner(RPC_URL, MNEMONIC);
    const to = await signer.getAddress();

    // A send that cannot succeed: more value than the account holds.
    await expect(signer.sendTransaction({ to, value: 2n ** 200n })).rejects.toThrow();

    // The next one must still be mined. This is exactly what the two shared-
    // NonceManager designs could not do — everything after a failure queued
    // behind the gap and hung.
    const after = await operatorSigner(RPC_URL, MNEMONIC).sendTransaction({ to, value: 0n });
    expect((await after.wait())?.status).toBe(1);
  }, 60_000);
});
