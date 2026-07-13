import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ContractFactory, HDNodeWallet, JsonRpcProvider } from "ethers";
import type { InterfaceAbi } from "ethers";
import {
  EcdsaAttestationSigner,
  OnchainAttestationAnchor,
} from "../../src/infrastructure/chain/attestation-chain.js";
import { canonicalAttestationPayload } from "../../src/domain/attestations/attestation.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";

// Deploy a fresh AttestationRegistry from the Foundry artifact so the test is
// self-contained (no dependency on a prior deploy / env address).
// cwd is the api package dir when its tests run; the artifact lives at the repo root.
const artifact = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../contracts/out/AttestationRegistry.sol/AttestationRegistry.json"),
    "utf8",
  ),
) as { abi: InterfaceAbi; bytecode: { object: string } };

describe("Attestation chain adapters (integration, anvil devnet)", () => {
  const signer = new EcdsaAttestationSigner(MNEMONIC);
  let registryAddress: string;

  beforeAll(async () => {
    const provider = new JsonRpcProvider(RPC_URL);
    const deployer = HDNodeWallet.fromPhrase(MNEMONIC).connect(provider);
    const registry = await new ContractFactory(
      artifact.abi,
      artifact.bytecode.object,
      deployer,
    ).deploy();
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
  });

  it("signs_a_payload_with_a_signature_that_recovers_to_the_attestor", async () => {
    const payload = canonicalAttestationPayload({
      assetId: "asset-chain-test",
      kind: "valuation",
      valueRial: 7_500_000_000n,
      attestorId: signer.attestorId(),
      issuedAt: new Date("2026-07-01T00:00:00Z"),
      validUntil: new Date("2026-10-01T00:00:00Z"),
    });

    const { payloadHash, signature } = await signer.sign(payload);
    expect(payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(signer.verify(payloadHash, signature)).toBe(true);
  });

  it("anchors_the_hash_on_chain_and_reports_a_nonzero_timestamp", async () => {
    const anchor = new OnchainAttestationAnchor(RPC_URL, MNEMONIC, registryAddress);
    const { payloadHash } = await signer.sign("anchor-test-payload");

    expect(await anchor.anchoredAt(payloadHash)).toBe(0n);
    await anchor.anchor(payloadHash, new Date("2026-10-01T00:00:00Z"));
    expect(await anchor.anchoredAt(payloadHash)).toBeGreaterThan(0n);
  });
});
