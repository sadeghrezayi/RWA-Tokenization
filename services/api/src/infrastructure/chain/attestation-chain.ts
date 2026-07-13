import { createHash } from "node:crypto";
import { Contract, HDNodeWallet, JsonRpcProvider, NonceManager, verifyMessage } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import { Logger } from "@nestjs/common";
import type { AttestationAnchor, AttestationSigner } from "../../application/attestations/ports.js";

// The attestor is anvil's funded account #1 — distinct from the operator
// (account #0), and it holds gas so it can send anchor transactions itself,
// keeping the on-chain msg.sender consistent with the signing identity.
const ATTESTOR_PATH = "m/44'/60'/0'/0/1";

const REGISTRY_ABI = [
  "function anchor(bytes32 payloadHash, uint256 validUntil)",
  "function anchoredAt(bytes32 payloadHash) view returns (uint256)",
];

type RegistryContract = Contract & {
  anchor(payloadHash: string, validUntil: bigint): Promise<ContractTransactionResponse>;
  anchoredAt(payloadHash: string): Promise<bigint>;
};

const sha256Hex = (payload: string): string =>
  `0x${createHash("sha256").update(payload).digest("hex")}`;

// FR-OR-1/2: signs the canonical payload with the attestor key. payloadHash is
// the sha256 of the payload (a 32-byte value, anchorable as bytes32); the
// signature is EIP-191 over that hash and recovers to the attestor address.
export class EcdsaAttestationSigner implements AttestationSigner {
  private readonly wallet: HDNodeWallet;

  constructor(mnemonic: string) {
    this.wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, ATTESTOR_PATH);
  }

  attestorId(): string {
    return this.wallet.address;
  }

  async sign(payload: string): Promise<{ payloadHash: string; signature: string }> {
    const payloadHash = sha256Hex(payload);
    const signature = await this.wallet.signMessage(payloadHash);
    return { payloadHash, signature };
  }

  // Exposed for tests / auditors: does this signature recover to the attestor?
  verify(payloadHash: string, signature: string): boolean {
    try {
      return verifyMessage(payloadHash, signature) === this.wallet.address;
    } catch {
      return false;
    }
  }
}

// FR-OR-1: records the payload hash on-chain via the AttestationRegistry.
export class OnchainAttestationAnchor implements AttestationAnchor {
  constructor(
    private readonly rpcUrl: string,
    private readonly mnemonic: string,
    private readonly registryAddress: string,
  ) {}

  async anchor(payloadHash: string, validUntil: Date): Promise<void> {
    const provider = new JsonRpcProvider(this.rpcUrl);
    const attestor = new NonceManager(
      HDNodeWallet.fromPhrase(this.mnemonic, undefined, ATTESTOR_PATH).connect(provider),
    );
    const registry = new Contract(this.registryAddress, REGISTRY_ABI, attestor) as RegistryContract;
    const validUntilSecs = BigInt(Math.floor(validUntil.getTime() / 1000));
    await (await registry.anchor(payloadHash, validUntilSecs)).wait();
  }

  async anchoredAt(payloadHash: string): Promise<bigint> {
    const provider = new JsonRpcProvider(this.rpcUrl);
    const registry = new Contract(this.registryAddress, REGISTRY_ABI, provider) as RegistryContract;
    return registry.anchoredAt(payloadHash);
  }
}

// Fallback when the registry isn't configured, so the API boots without a chain.
export class DevLogAttestationAnchor implements AttestationAnchor {
  private readonly logger = new Logger(DevLogAttestationAnchor.name);

  anchor(payloadHash: string): Promise<void> {
    this.logger.log(`attestation hash pending on-chain anchoring: ${payloadHash}`);
    return Promise.resolve();
  }
}

// Fallback signer when no attestor key is configured (dev/CI). Produces the
// real payload hash but an unverifiable placeholder signature.
export class DevAttestationSigner implements AttestationSigner {
  attestorId(): string {
    return "dev-attestor";
  }

  sign(payload: string): Promise<{ payloadHash: string; signature: string }> {
    return Promise.resolve({ payloadHash: sha256Hex(payload), signature: "dev-unsigned" });
  }
}
